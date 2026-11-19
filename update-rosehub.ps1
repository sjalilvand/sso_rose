# =============================================================================
#  update-rosehub.ps1 - Update Rose Hub on the server from GitHub
#  Steps: stop app (PM2 / port owner) + backup database + git sync
#         (DB restored after reset) + npm install + prisma
#         + sync system names/urls + build + PM2 start + health check
#  Usage:
#     powershell -ExecutionPolicy Bypass -File C:\update-rosehub.ps1
#  Optional parameters:
#     -InstallDir "C:\RoseHub"   install folder
#     -Port 8082                 app port
#     -GitHubToken "ghp_..."     only if the repo becomes private
#  NOTE 1: written in pure ASCII on purpose - PowerShell 5.1 mis-decodes
#          UTF-8 scripts without BOM on some system locales, which breaks
#          Persian string literals. Keep this file ASCII-only.
#  NOTE 2: the SQLite database (db\custom.db) and .env are never taken from
#          git. The database is backed up before git reset and restored
#          right after it, so server data always survives the update.
#  NOTE 3: the app must be fully stopped before "prisma generate", otherwise
#          Windows refuses to replace the locked query engine DLL
#          (EPERM rename error). The stop routine works even when the app
#          is not visible in the current user's PM2 list: it stops any PM2
#          app living in the install folder, then kills whatever still
#          listens on the app port, then kills the PM2 daemon / node.exe
#          if something keeps respawning it.
# =============================================================================

#requires -Version 5.1

param(
    [string]$InstallDir  = "C:\RoseHub",
    [int]$Port           = 8082,
    [string]$GitHubToken = ""
)

$ErrorActionPreference = "Continue"
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

function Write-Step($msg)  { Write-Host ""; Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)    { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn2($msg) { Write-Host "  [!] $msg" -ForegroundColor Yellow }

function Refresh-Path {
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path", "User")
}
Refresh-Path

# ---------- port helpers ----------
function Get-PortPids([int]$P) {
    $pids = @()
    try {
        $conns = Get-NetTCPConnection -LocalPort $P -State Listen -ErrorAction Stop
        $pids  = @($conns | ForEach-Object { $_.OwningProcess } | Select-Object -Unique)
    } catch {
        # fallback for systems without Get-NetTCPConnection
        $lines = netstat -ano | Select-String ":$P\s" | Select-String "LISTENING"
        foreach ($line in $lines) {
            $parts = ($line.ToString().Trim() -split "\s+")
            if ($parts.Length -ge 5) { $pids += [int]$parts[-1] }
        }
        $pids = @($pids | Select-Object -Unique)
    }
    return $pids
}

function Stop-PortOwners([int]$P) {
    foreach ($procId in (Get-PortPids $P)) {
        try {
            $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
            if ($proc) {
                Write-Warn2 "Port $P is held by PID $procId ($($proc.ProcessName)) - killing it"
                Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
            }
        } catch {}
    }
}

function Test-PortBusy([int]$P) {
    return (Get-PortPids $P).Count -gt 0
}

# ---------- PM2 / startup diagnostics ----------
function Show-Pm2State([string]$AppName) {
    try {
        $app = $null
        foreach ($a in @(pm2 jlist 2>$null | ConvertFrom-Json)) {
            if ([string]$a.name -eq $AppName) { $app = $a }
        }
        if ($app) {
            $status   = [string]$app.pm2_env.status
            $restarts = "?"
            try { $restarts = [string]$app.pm2_env.restart_time } catch {}
            $exitCode = "?"
            try { $exitCode = [string]$app.pm2_env.exit_code } catch {}
            Write-Host "  PM2 '$AppName': status=$status restarts=$restarts lastExitCode=$exitCode"
            if ($status -ne "online") {
                Write-Warn2 "PM2 reports '$status' - the process exits on startup; diagnostics will show the real error"
            }
            return $status
        } else {
            Write-Warn2 "PM2 has no app named '$AppName'"
            return "missing"
        }
    } catch { return "unknown" }
}

function Show-StartupDiagnostics {
    Write-Host ""
    Write-Host "  ============ STARTUP DIAGNOSTICS ============" -ForegroundColor Yellow

    # 1) node / npm versions
    try { Write-Host "  node $(node -v 2>$null)  npm $(npm -v 2>$null)" } catch {}

    # 2) build output really there?
    if (Test-Path ".next\BUILD_ID") {
        $bid = (Get-Content ".next\BUILD_ID" -ErrorAction SilentlyContinue | Select-Object -First 1)
        Write-Ok ".next build is present (BUILD_ID=$bid)"
    } else {
        Write-Warn2 ".next\BUILD_ID is MISSING - the production build did not finish"
    }

    # 3) PM2 view of the app
    Show-Pm2State $pm2Name | Out-Null
    try { pm2 describe rose-hub 2>$null | Out-Host } catch {}

    # 4) tails of every log file that may hold the crash reason
    $logFiles = @(
        "logs\rose-hub-error.log",
        "logs\rose-hub-out.log",
        (Join-Path $env:USERPROFILE ".pm2\logs\rose-hub-error.log"),
        (Join-Path $env:USERPROFILE ".pm2\logs\rose-hub-out.log"),
        (Join-Path $env:USERPROFILE ".pm2\pm2.log")
    )
    foreach ($f in $logFiles) {
        if ($f -and (Test-Path $f)) {
            Write-Host ""
            Write-Host "  ---- last 30 lines of $f ----" -ForegroundColor Yellow
            try { Get-Content $f -Tail 30 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "  $_" } } catch {}
        }
    }

    # 5) port state
    $owners = Get-PortPids $Port
    Write-Host ""
    if ($owners.Count -gt 0) {
        Write-Host "  Port $Port is held by PID(s): $($owners -join ', ')"
    } else {
        Write-Host "  Port $Port is free - nothing is listening"
    }

    # 6) THE decisive test: run the app directly (no PM2) and capture the raw error
    Write-Host ""
    Write-Warn2 "Running the app directly WITHOUT PM2 for 18 seconds to capture the real error..."
    $fgOut = Join-Path $env:TEMP "rosehub-fg-out.log"
    $fgErr = Join-Path $env:TEMP "rosehub-fg-err.log"
    Remove-Item $fgOut, $fgErr -Force -ErrorAction SilentlyContinue
    $script:fgRanFine = $false
    try {
        if (Test-PortBusy $Port) {
            Write-Warn2 "Port $Port is busy - skipping the foreground test"
        } else {
            $proc = Start-Process -FilePath "node" `
                -ArgumentList "node_modules\next\dist\bin\next", "start", "-p", "$Port" `
                -WorkingDirectory (Get-Location).Path `
                -RedirectStandardOutput $fgOut -RedirectStandardError $fgErr `
                -NoNewWindow -PassThru
            Start-Sleep -Seconds 18
            if (-not $proc.HasExited) {
                $script:fgRanFine = $true
                Write-Ok "The app RAN fine in the foreground (no crash) - the problem is PM2-side"
                try {
                    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/login" -UseBasicParsing -TimeoutSec 5
                    Write-Ok "Foreground app answered HTTP $($r.StatusCode) on /login"
                } catch {
                    Write-Warn2 "Foreground app is alive but did NOT answer HTTP on /login"
                }
                try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch {}
                Start-Sleep -Seconds 1
                if (Test-PortBusy $Port) { Stop-PortOwners $Port }   # make sure the port is free for the PM2 retry
            } else {
                Write-Warn2 "The app exited by itself (exit code $($proc.ExitCode)) - the raw error is below"
            }
        }
    } catch {
        Write-Warn2 "Foreground test could not start: $_"
    }
    foreach ($f in @($fgOut, $fgErr)) {
        if (Test-Path $f) {
            $lines = Get-Content $f -ErrorAction SilentlyContinue
            if ($lines) {
                Write-Host ""
                Write-Host "  ---- output of the foreground run ----" -ForegroundColor Yellow
                $lines | Select-Object -First 60 | ForEach-Object { Write-Host "  $_" }
            }
        }
    }

    Write-Host ""
    Write-Host "  Paste ALL lines above (diagnostics block) to the assistant -" -ForegroundColor Cyan
    Write-Host "  they contain the real startup error." -ForegroundColor Cyan
    Write-Host "  ============================================" -ForegroundColor Yellow
}

# ---------- Step 1/9: check install folder ----------
Write-Step "Step 1/9 - Check install folder"
if (-not (Test-Path (Join-Path $InstallDir "package.json"))) {
    throw "Rose Hub not found in $InstallDir - run deploy-rose-hub.ps1 first."
}
Set-Location $InstallDir
Write-Ok "Install folder: $InstallDir"

# ---------- Step 2/9: stop the app (PM2 + port + respawn guard) ----------
Write-Step "Step 2/9 - Stop the app"
$pm2Name = "rose-hub"
$inList  = $false

# 2a) stop any PM2 app that lives in the install folder (any name)
$pm2Apps = @()
try { $pm2Apps = @(pm2 jlist 2>$null | ConvertFrom-Json) } catch {}
foreach ($app in $pm2Apps) {
    $cwd = ""
    try { $cwd = [string]$app.pm2_env.pm_cwd } catch {}
    $appName = [string]$app.name
    if ($appName -eq $pm2Name -or ($cwd -and $cwd.ToLower().StartsWith($InstallDir.ToLower()))) {
        pm2 stop $appName 2>$null | Out-Null
        Write-Ok "PM2: stopped app '$appName'"
        $inList = $true
    }
}
if (-not $inList) {
    Write-Warn2 "No PM2 app found for this folder in the current user's PM2 list"
}

Start-Sleep -Seconds 2

# 2b) whatever still listens on the app port IS the app - kill it
if (Test-PortBusy $Port) {
    Stop-PortOwners $Port
    Start-Sleep -Seconds 3
    # 2c) if it came back, a supervisor respawns it - kill the supervisor too
    if (Test-PortBusy $Port) {
        Write-Warn2 "App came back after kill - stopping PM2 daemon and node processes"
        pm2 kill 2>$null | Out-Null
        Stop-PortOwners $Port
        Start-Sleep -Seconds 2
    }
    if (Test-PortBusy $Port) {
        Write-Warn2 "Still respawning - killing all node.exe processes (Rose Hub is the only Node app on this server)"
        taskkill /F /IM node.exe 2>$null | Out-Null
        Start-Sleep -Seconds 2
        Stop-PortOwners $Port
    }
}

if (Test-PortBusy $Port) {
    Write-Warn2 "Port $Port is STILL busy - prisma/build steps may fail on locked files"
} else {
    Write-Ok "App stopped, port $Port is free"
}

# ---------- Step 3/9: backup database ----------
Write-Step "Step 3/9 - Backup database"
$dbFile   = "db\custom.db"
$stamp    = Get-Date -Format "yyyyMMdd-HHmmss"
$dbBackup = Join-Path $env:TEMP "rosehub-db-$stamp.db"
$dbHad    = (Test-Path $dbFile)
if ($dbHad) {
    Copy-Item $dbFile $dbBackup -Force
    Write-Ok "Database backed up to $dbBackup"
} else {
    Write-Warn2 "db\custom.db not found - a fresh database will be created later"
}

# ---------- Step 4/9: sync code from GitHub ----------
Write-Step "Step 4/9 - Sync code from GitHub"
if ($GitHubToken -ne "") {
    git remote set-url origin "https://sjalilvand:$GitHubToken@github.com/sjalilvand/sso_rose.git" 2>$null
}
git fetch origin main
if ($LASTEXITCODE -ne 0) { throw "Cannot reach GitHub (check internet / token)" }

$localCommit  = (git rev-parse HEAD).Trim()
$remoteCommit = (git rev-parse origin/main).Trim()
if (-not $remoteCommit) { throw "Cannot read origin/main after fetch" }
if ($localCommit -eq $remoteCommit) {
    Write-Ok "Code is already up to date ($($localCommit.Substring(0,7)))"
} else {
    git reset --hard origin/main
    if ($LASTEXITCODE -ne 0) { throw "git reset failed - see the git error above" }
    Write-Ok "Code updated to $($remoteCommit.Substring(0,7))"
}

# restore the database after the reset (git may delete or overwrite it)
if ($dbHad) {
    Copy-Item $dbBackup $dbFile -Force
    Write-Ok "Database restored from backup (server data kept)"
}

# ---------- Step 4b/9: ensure .env points at THIS install folder ----------
# .env was once committed by mistake with a developer-machine path; a git
# reset then overwrote the server's correct file and Prisma silently created
# an empty database elsewhere. Normalize DATABASE_URL on every update.
Write-Step "Step 4b/9 - Ensure .env (DATABASE_URL)"
$envFile   = Join-Path $InstallDir ".env"
$canonical = 'DATABASE_URL="file:../db/custom.db"'
$needsFix  = $true
if (Test-Path $envFile) {
    foreach ($line in (Get-Content $envFile -ErrorAction SilentlyContinue)) {
        if ($line -match '^\s*DATABASE_URL\s*=\s*"?file:\.\./db/custom\.db"?\s*$') { $needsFix = $false; break }
    }
}
if ($needsFix) {
    $kept = @()
    if (Test-Path $envFile) {
        $kept = @(Get-Content $envFile -ErrorAction SilentlyContinue | Where-Object { $_ -notmatch '^\s*DATABASE_URL\s*=' })
    }
    $kept += $canonical
    Set-Content -Path $envFile -Value $kept -Encoding ASCII
    Write-Ok ".env normalized: DATABASE_URL=file:../db/custom.db (this install's db\custom.db)"
} else {
    Write-Ok ".env already points at this install's db\custom.db"
}

# ---------- Step 5/9: npm install (Iranian mirror first, then default) ----------
Write-Step "Step 5/9 - Install npm dependencies"
$mirror = "https://archive.ito.gov.ir/mirror2/npm/"
$useRegistry = ""
# probe with a real small package doc: proves the mirror is up AND serves our packages
try {
    $probe = Invoke-WebRequest -Uri ($mirror + "xlsx/latest") -Method Get -UseBasicParsing -TimeoutSec 10
    if ($probe.StatusCode -lt 500) { $useRegistry = $mirror }
} catch {}
if ($useRegistry -ne "") {
    Write-Host "  npm install from mirror $mirror ..."
    npm install --registry $useRegistry --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) {
        Write-Warn2 "Mirror install failed - retrying with the official registry"
        npm install --no-audit --no-fund
    }
} else {
    Write-Warn2 "npm mirror is not reachable - using the official registry"
    npm install --no-audit --no-fund
}
if ($LASTEXITCODE -ne 0) { throw "npm install failed - check the output above" }

# make sure the xlsx package (Excel import) really landed in node_modules
if (-not (Test-Path "node_modules\xlsx\package.json")) {
    Write-Warn2 "xlsx package is missing - installing it directly"
    npm install xlsx@0.18.5 --no-audit --no-fund
    if (-not (Test-Path "node_modules\xlsx\package.json")) { throw "xlsx package could not be installed" }
}
Write-Ok "Dependencies installed (xlsx present)"

# ---------- Step 6/9: Prisma (client + schema sync) ----------
Write-Step "Step 6/9 - Prisma (generate + db push)"
npx prisma generate
if ($LASTEXITCODE -ne 0) { throw "prisma generate failed - is the app really stopped? Re-run this script." }
npx prisma db push --accept-data-loss --skip-generate
if ($LASTEXITCODE -ne 0) { Write-Warn2 "prisma db push failed - harmless if the schema did not change" }
Write-Ok "Prisma ready (username + consultant fields present)"

# ---------- Step 7/9: sync system names and urls in the database ----------
Write-Step "Step 7/9 - Sync system names/urls in database"
if (Test-Path "scripts\bind-sso-systems.cjs") {
    node scripts/bind-sso-systems.cjs
    if ($LASTEXITCODE -eq 0) {
        Write-Ok "System names/urls synced (Rose Psy / Rose Center / Attendance)"
    } else {
        Write-Warn2 "bind-sso-systems failed - run manually later: node scripts\bind-sso-systems.cjs"
    }
} else {
    Write-Warn2 "scripts\bind-sso-systems.cjs not found - skipped"
}

# ---------- Step 7b/9: seed base-info centers + org managements (phase 72) ----------
Write-Step "Step 7b/9 - Seed base-info centers and clinics (phase 72)"
if (Test-Path "scripts\seed-centers.cjs") {
    node scripts/seed-centers.cjs
    if ($LASTEXITCODE -eq 0) {
        Write-Ok "Centers seeded (HQ + province clinics) - sync exact data from Attendance admin page"
    } else {
        Write-Warn2 "seed-centers failed - run manually later: node scripts/seed-centers.cjs"
    }
} else {
    Write-Warn2 "scripts/seed-centers.cjs not found - skipped"
}
if (Test-Path "scripts\seed-org-structure.cjs") {
    node scripts/seed-org-structure.cjs
    if ($LASTEXITCODE -eq 0) {
        Write-Ok "Org managements seeded (clinic managers + executive officers)"
    } else {
        Write-Warn2 "seed-org-structure failed - run manually later: node scripts/seed-org-structure.cjs"
    }
} else {
    Write-Warn2 "scripts/seed-org-structure.cjs not found - skipped"
}

# ---------- Step 8/9: production build ----------
Write-Step "Step 8/9 - Production build (a few minutes)"
npm run build
if ($LASTEXITCODE -ne 0) { throw "build failed - check the output above" }
Write-Ok "Build completed (.next)"

# ---------- Step 9/9: start PM2 and health check ----------
Write-Step "Step 9/9 - Start app (PM2)"
if (-not (Test-Path "logs")) { New-Item -ItemType Directory -Path "logs" -Force | Out-Null }
if (-not (Test-Path ".next\BUILD_ID")) {
    Write-Warn2 ".next\BUILD_ID is missing - build did not finish - rebuilding once..."
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "build failed again - check the output above" }
}
try { pm2 flush 2>$null | Out-Null } catch {}   # fresh logs = readable crash reason
if (Test-PortBusy $Port) {
    Write-Warn2 "Something already listens on port $Port - skipping PM2 start (app probably managed by another PM2 session)"
} elseif ($inList) {
    pm2 restart $pm2Name --update-env
    Write-Ok "PM2: $pm2Name restarted"
} else {
    pm2 start ecosystem.config.js --only rose-hub
    pm2 save 2>$null | Out-Null
    Write-Ok "PM2: app started from ecosystem.config.js"
}
Start-Sleep -Seconds 5
Show-Pm2State $pm2Name | Out-Null

# ---------- Step 9b/9: Bale support bot (@rosepro_bot) under PM2 ----------
Write-Step "Step 9b/9 - Bale support bot (PM2)"
$botInList = $false
try {
    foreach ($app in @(pm2 jlist 2>$null | ConvertFrom-Json)) {
        if ([string]$app.name -eq "rose-bale-bot") { $botInList = $true }
    }
} catch {}
if ($botInList) {
    pm2 restart rose-bale-bot --update-env 2>$null | Out-Null
    Write-Ok "PM2: rose-bale-bot restarted"
} else {
    pm2 start ecosystem.config.js --only rose-bale-bot 2>$null | Out-Null
    Write-Ok "PM2: rose-bale-bot started (first time)"
}
pm2 save 2>$null | Out-Null
Start-Sleep -Seconds 3
$botOnline = $false
try {
    foreach ($app in @(pm2 jlist 2>$null | ConvertFrom-Json)) {
        if ([string]$app.name -eq "rose-bale-bot" -and [string]$app.pm2_env.status -eq "online") { $botOnline = $true }
    }
} catch {}
if ($botOnline) {
    Write-Ok "Bale bot @rosepro_bot is online (password reset + support via Bale messenger)"
} else {
    Write-Warn2 "rose-bale-bot is not online - check: pm2 logs rose-bale-bot --lines 20"
}

Write-Host ""
Write-Step "Health check"
$healthy = $false
for ($i = 0; $i -lt 15; $i++) {
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/login" -UseBasicParsing -TimeoutSec 5
        if ($r.StatusCode -eq 200) { $healthy = $true; break }
    } catch { Start-Sleep -Seconds 2 }
}
if ($healthy) {
    Write-Ok "Rose Hub is healthy on port $Port"
    node scripts\db-stats.cjs
    Write-Host ""
    Write-Host "================================================================="
    Write-Host "  Rose Hub update finished"
    Write-Host "================================================================="
    Write-Host "  URL              : http://130.185.73.157:$Port"
    Write-Host "  In this version  :"
    Write-Host "    - Mobile-friendly login + QR code (left side) to open the hub on phones"
    Write-Host "    - PWA manifest: the hub can be added to the phone home screen"
    Write-Host "    - Self-service registration with admin approval (login only after"
    Write-Host "      approval in: management -> Registration requests)"
    Write-Host "    - Bale support bot @rosepro_bot: password reset + support inbox"
    Write-Host "      (PM2 app: rose-bale-bot; users must link their account in the bot first)"
    Write-Host "    - Update script: safe stop + database backup/restore"
    Write-Host "  Tip: press Ctrl+F5 in the browser to bypass the cache."
    Write-Host "================================================================="
} else {
    Write-Warn2 "App did not respond - collecting diagnostics..."
    Show-StartupDiagnostics
    if ($script:fgRanFine) {
        # the app works outside PM2 -> give PM2 one more chance (first start
        # sometimes races with antivirus scanning the fresh .next folder)
        Write-Host ""
        Write-Warn2 "App works without PM2 - restarting under PM2 and re-checking..."
        pm2 restart rose-hub --update-env 2>$null | Out-Null
        Start-Sleep -Seconds 5
        $healthy2 = $false
        for ($i = 0; $i -lt 6; $i++) {
            try {
                $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/login" -UseBasicParsing -TimeoutSec 5
                if ($r.StatusCode -eq 200) { $healthy2 = $true; break }
            } catch { Start-Sleep -Seconds 2 }
        }
        if ($healthy2) {
            Write-Ok "Rose Hub is NOW healthy under PM2 (first start raced with antivirus/file locks)"
        } else {
            Show-Pm2State $pm2Name | Out-Null
            Write-Warn2 "Still not healthy under PM2 - the diagnostics block above shows where it dies"
        }
    }
}

# ---------- Step 9c/9: keep the C:\ root copy of this script fresh ----------
# کاربر معمولاً C:\update-rosehub.ps1 را اجرا می‌کند؛ نسخهٔ رپو باید آن را
# بروز نگه دارد تا قدم‌های جدید (مثل seed مراکز) از دست نروند.
try {
    $rootCopy = "C:\update-rosehub.ps1"
    $selfPath = $PSCommandPath
    if ($selfPath -and ((Resolve-Path $selfPath -ErrorAction SilentlyContinue).Path -ne (Resolve-Path $rootCopy -ErrorAction SilentlyContinue).Path)) {
        Copy-Item -LiteralPath $selfPath -Destination $rootCopy -Force
        Write-Ok "Root launcher refreshed: C:\update-rosehub.ps1 = $selfPath"
    }
} catch {}
