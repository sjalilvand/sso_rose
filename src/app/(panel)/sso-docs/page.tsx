"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BookOpen,
  KeyRound,
  ShieldCheck,
  ArrowLeftRight,
  LogOut,
  Globe,
  Copy,
  CheckCircle2,
  ExternalLink,
  Table2,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

const SAMPLES: Record<string, { label: string; note: string; code: string }> = {
  node: {
    label: "Node.js / Express",
    note: "نصب: npm i jsonwebtoken express-session",
    code: `const jwt = require("jsonwebtoken");

// مسیر دریافت توکن از رز هاب و ورود خودکار
app.get("/auth/rose-hub", (req, res) => {
  const token = req.query.sso_token;
  if (!token) return res.status(400).send("توکن ارسال نشده است");

  try {
    const payload = jwt.verify(token, process.env.ROSE_HUB_CLIENT_SECRET, {
      algorithms: ["HS256"],          // فقط همین الگوریتم
      issuer: "rose-hub",             // iss
      audience: process.env.ROSE_HUB_CLIENT_ID, // aud = clientId شما
      clockTolerance: 60,             // تحمل اختلاف ساعت (ثانیه)
    });

    // ورود خودکار: کاربر را با payload.email پیدا یا بسازید و نشست بسازید
    req.session.user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role,
    };
    res.redirect("/dashboard");
  } catch (err) {
    res.status(401).send("توکن ورود یکپارچه نامعتبر است: " + err.message);
  }
});`,
  },
  php: {
    label: "PHP / Laravel",
    note: "نصب: composer require firebase/php-jwt",
    code: `<?php
use Firebase\\JWT\\JWT;
use Firebase\\JWT\\Key;

$token = $_GET['sso_token'] ?? '';
if (!$token) { http_response_code(400); exit('توکن ارسال نشده است'); }

try {
    $payload = JWT::decode($token, new Key(getenv('ROSE_HUB_CLIENT_SECRET'), 'HS256'));

    if ($payload->iss !== 'rose-hub'
        || $payload->aud !== getenv('ROSE_HUB_CLIENT_ID')
        || $payload->exp < time() - 60) {
        throw new Exception('اعتبار توکن تأیید نشد');
    }

    // ورود خودکار: یافتن یا ساخت کاربر با $payload->email و باز کردن نشست
    $_SESSION['user'] = [
        'id'    => $payload->sub,
        'email' => $payload->email,
        'name'  => $payload->name,
        'role'  => $payload->role,
    ];
    header('Location: /dashboard');
} catch (Exception $e) {
    http_response_code(401);
    exit('توکن نامعتبر: ' . $e->getMessage());
}`,
  },
  wp: {
    label: "وردپرس",
    note: "در functions.php قالب یا یک افزونه کوچک",
    code: `<?php
// composer require firebase/php-jwt  (در همین پوشه)

add_action('init', function () {
    if (empty($_GET['sso_token'])) return;

    try {
        $payload = validate_rose_hub_token($_GET['sso_token']); // مثل نمونه PHP با firebase/php-jwt

        $user = get_user_by('email', $payload->email);
        if (!$user) {
            $user_id = wp_create_user($payload->email, wp_generate_password(24), $payload->email);
            wp_update_user(['ID' => $user_id, 'display_name' => $payload->name]);
            $user = get_user_by('id', $user_id);
        }
        wp_set_current_user($user->ID);
        wp_set_auth_cookie($user->ID, true);
        wp_safe_redirect(home_url('/dashboard'));
        exit;
    } catch (Exception $e) {
        wp_die('ورود یکپارچه ناموفق بود: ' . esc_html($e->getMessage()));
    }
});`,
  },
  python: {
    label: "Python / FastAPI",
    note: "نصب: pip install pyjwt fastapi",
    code: `import os, jwt
from fastapi import Request, HTTPException
from fastapi.responses import RedirectResponse

@app.get("/auth/rose-hub")
def rose_hub_sso(request: Request):
    token = request.query_params.get("sso_token", "")
    try:
        payload = jwt.decode(
            token,
            os.environ["ROSE_HUB_CLIENT_SECRET"],
            algorithms=["HS256"],
            audience=os.environ["ROSE_HUB_CLIENT_ID"],
            issuer="rose-hub",
            leeway=60,
        )
        # ورود خودکار با payload["email"] و ساخت نشست
        return RedirectResponse("/dashboard")
    except jwt.PyJWTError as e:
        raise HTTPException(status_code=401, detail=f"توکن نامعتبر: {e}")`,
  },
};

const CLAIMS: [string, string, string][] = [
  ["iss", "rose-hub", "صادرکننده توکن — همیشه برابر rose-hub"],
  ["aud", "شناسه سامانه شما (clientId)", "مخاطب توکن — فقط برای سامانه شما صادر شده"],
  ["sub", "شناسه کاربر در رز هاب", "شناسه یکتا و پایدار برای find-or-create"],
  ["email", "ایمیل سازمانی", "کلید اصلی تطبیق کاربر"],
  ["name", "نام و نام خانوادگی", "برای ساخت پروفایل اولیه"],
  ["role", "نقش در رز هاب", "SUPER_ADMIN / UNIT_MANAGER / THERAPIST / RECEPTION / INSTRUCTOR / EXTERNAL"],
  ["systemId", "شناسه داخلی سامانه", "برای ردگیری"],
  ["systemName", "نام سامانه مقصد", "برای ردگیری"],
  ["scope", "sso-launch", "محدوده توکن — فقط ورود"],
  ["iat / exp", "زمان صدور / انقضا", "اعتبار کل: ۵ دقیقه"],
  ["jti", "شناسه یکتای توکن", "برای لاگ و جلوگیری از استفاده مجدد"],
];

const SYSTEM_LINKS: { name: string; url: string }[] = [
  { name: "راه زندگی", url: "https://testrahezendegi.ir/" },
  { name: "رز آکادمی", url: "https://roseacademy.ir/" },
  { name: "رز سنتر", url: "https://rosecenter.ir/" },
  { name: "رز سای", url: "https://rosepsy.ir/" },
  { name: "تکنورز", url: "https://technorose.ir/" },
];

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        className="absolute top-2 end-2 z-10 h-7 gap-1 text-xs"
        onClick={async () => {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          toast.success("کد کپی شد");
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <CheckCircle2 className="size-3.5" /> : <Copy className="size-3.5" />}
        کپی
      </Button>
      <pre
        dir="ltr"
        className="text-left text-[11px] leading-5 bg-muted/70 rounded-xl p-4 overflow-x-auto max-h-96 overflow-y-auto font-mono"
      >
        {code}
      </pre>
    </div>
  );
}

function Section({ icon, title, children, id }: { icon: React.ReactNode; title: string; children: React.ReactNode; id: string }) {
  return (
    <Card id={id} className="scroll-mt-24">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm leading-7 text-muted-foreground">{children}</CardContent>
    </Card>
  );
}

export default function SsoDocsPage() {
  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* هدر */}
      <div className="rounded-2xl border bg-card p-5 md:p-6 animate-fade-up">
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <BookOpen className="size-6 text-primary" />
          مستندات اتصال سامانه‌ها به رز هاب (SSO)
        </h1>
        <p className="text-sm text-muted-foreground mt-2 leading-7">
          این راهنما برای تیم‌های فنی سامانه‌های مجموعه (راه زندگی، رز آکادمی، رز سنتر، رز سای و
          تکنورز) تهیه شده تا بدون وابستگی به سازندگان اولیه، بتوانند سامانه خود را به ورود یکپارچه
          رز هاب متصل کنند. کل فرآیند پیاده‌سازی سمت سامانه مقصد حدود ۱ تا ۲ ساعت کار است و به هیچ
          تغییر سمت رز هاب نیاز ندارد.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Badge variant="secondary" className="gap-1">
            <ShieldCheck className="size-3" /> استاندارد JWT (HS256)
          </Badge>
          <Badge variant="secondary" className="gap-1">
            <KeyRound className="size-3" /> رمز اختصاصی برای هر سامانه
          </Badge>
          <Badge variant="secondary" className="gap-1">
            <ArrowLeftRight className="size-3" /> بدون اشتراک رمز عبور
          </Badge>
          <a href="https://github.com/sjalilvand/sso_rose/blob/main/docs/sso-integration-fa.md" target="_blank" rel="noopener noreferrer">
            <Badge variant="outline" className="gap-1 cursor-pointer hover:bg-accent">
              نسخه کامل مستندات <ExternalLink className="size-3" />
            </Badge>
          </a>
        </div>
      </div>

      {/* گام ۱ */}
      <Section id="step-1" icon={<KeyRound className="size-5 text-primary" />} title="گام ۱ — دریافت مشخصات اتصال سامانه">
        <p>
          مدیر کل رز هاب از مسیر «مدیریت ← مدیریت سامانه‌ها» برای هر سامانه دو مقدار اختصاصی صادر
          می‌کند. این مقادیر را از پنل مدیریت کپی کنید و در فایل پیکربندی (env) سامانه خود ذخیره
          نمایید:
        </p>
        <ul className="list-disc ps-6 space-y-1">
          <li>
            <b className="text-foreground">Client ID</b> — شناسه عمومی سامانه (در claim «aud» توکن
            قرار می‌گیرد)
          </li>
          <li>
            <b className="text-foreground">Client Secret</b> — رمز مشترک اعتبارسنجی امضای توکن؛
            محرمانه است و فقط با تیم فنی سامانه شما به‌اشتراک گذاشته می‌شود
          </li>
        </ul>
        <p>
          در صورت لو رفتن رمز، مدیر کل می‌تواند با دکمه «تمدید رمز» مقدار جدید صادر کند؛ رمز قبلی
          بلافاصله باطل می‌شود.
        </p>
      </Section>

      {/* گام ۲ */}
      <Section id="step-2" icon={<ArrowLeftRight className="size-5 text-primary" />} title="گام ۲ — جریان ورود یکپارچه چگونه کار می‌کند؟">
        <ol className="list-decimal ps-6 space-y-2">
          <li>کاربر در رز هاب وارد می‌شود (یک‌بار و فقط یک‌بار).</li>
          <li>
            از کارت سامانه، دکمه «ورود با رز هاب» را می‌زند؛ رز هاب مجوز او را بررسی و توکن موقت
            ۵ دقیقه‌ای صادر می‌کند.
          </li>
          <li>
            کاربر به نشانی زیر هدایت می‌شود:
            <code dir="ltr" className="block mt-1 text-[11px] bg-muted/70 rounded-lg p-2 font-mono text-foreground">
              {"https://your-system.ir/?sso_token=<JWT>"}
            </code>
          </li>
          <li>سامانه شما توکن را اعتبارسنجی می‌کند (گام ۳) و بدون فرم ورود، نشست کاربر را می‌سازد (گام ۴).</li>
        </ol>
        <p>
          توجه: «ورود یکپارچه» به معنی دسترسی به همه سامانه‌ها نیست — رز هاب فقط کاربرانی را به
          سامانه شما می‌فرستد که مدیر برای آن‌ها مجوز آن سامانه را صادر کرده باشد؛ اما سامانه شما
          نیز باید طبق قواعد نقش‌های خودش مجوزهای داخلی را اعمال کند.
        </p>
      </Section>

      {/* گام ۳ */}
      <Section id="step-3" icon={<ShieldCheck className="size-5 text-primary" />} title="گام ۳ — اعتبارسنجی توکن (نمونه کد آماده)">
        <p>
          توکن یک JWT با الگوریتم <b className="text-foreground">HS256</b> است که با{" "}
          <b className="text-foreground">Client Secret اختصاصی شما</b> امضا شده است. چهار مورد را
          همیشه بررسی کنید: امضا، <code dir="ltr">iss</code>، <code dir="ltr">aud</code> و{" "}
          <code dir="ltr">exp</code> (با تحمل ۶۰ ثانیه اختلاف ساعت).
        </p>
        <div className="flex items-center gap-2 text-xs">
          <Globe className="size-3.5" />
          پیکربندی عمومی و همگام‌سازی ساعت سرور:
          <a href="/api/sso/config" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-mono" dir="ltr">
            GET /api/sso/config
          </a>
        </div>
        <Tabs defaultValue="node" dir="rtl">
          <TabsList className="flex-wrap h-auto">
            {Object.entries(SAMPLES).map(([key, s]) => (
              <TabsTrigger key={key} value={key} className="text-xs">
                {s.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {Object.entries(SAMPLES).map(([key, s]) => (
            <TabsContent key={key} value={key} className="space-y-2">
              <p className="text-xs">{s.note}</p>
              <CodeBlock code={s.code} />
            </TabsContent>
          ))}
        </Tabs>
        <div className="rounded-xl border p-3">
          <p className="font-medium text-foreground text-xs mb-2 flex items-center gap-1.5">
            <Table2 className="size-3.5" /> محتوای توکن (Claims)
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-start border-b">
                  <th className="py-1.5 px-2 text-start">Claim</th>
                  <th className="py-1.5 px-2 text-start">مقدار</th>
                  <th className="py-1.5 px-2 text-start">توضیح</th>
                </tr>
              </thead>
              <tbody>
                {CLAIMS.map(([c, v, d]) => (
                  <tr key={c} className="border-b last:border-0">
                    <td className="py-1.5 px-2 font-mono text-primary" dir="ltr">{c}</td>
                    <td className="py-1.5 px-2" dir="ltr">{v}</td>
                    <td className="py-1.5 px-2">{d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      {/* گام ۴ */}
      <Section id="step-4" icon={<CheckCircle2 className="size-5 text-primary" />} title="گام ۴ — ورود خودکار کاربر و خروج یکپارچه">
        <p>
          بعد از اعتبارسنجی موفق، کاربر را با <code dir="ltr">email</code> (کلید تطبیق) در دیتابیس
          خود پیدا کنید؛ اگر نبود، با نام و ایمیل توکن بسازید و نقش پیش‌فرض سامانه خودتان را بدهید.
          سپس نشست استاندارد سامانه خودتان را باز کنید — همین. کاربر دیگر هیچ فرم ورودی نمی‌بیند.
        </p>
        <p>برای خروج یکپارچه، دکمه «خروج از همه سامانه‌ها» را به این نشانی بدهید:</p>
        <code dir="ltr" className="block text-[11px] bg-muted/70 rounded-lg p-2 font-mono text-foreground">
          {"GET https://<rose-hub>/api/auth/logout?redirect=/login"}
        </code>
        <p className="text-xs">
          این لینک نشست رز هاب را باطل می‌کند و کاربر را به مسیر نسبی داده‌شده برمی‌گرداند (فقط مسیر
          نسبی پذیرفته می‌شود). توصیه می‌شود طول نشست سمت سامانه شما نیز محدود باشد (مثلاً حداکثر
          ۲۴ ساعت) تا پس از خروج از رز هاب، نشست قدیمی باقی نماند.
        </p>
      </Section>

      {/* اندپوینت‌ها */}
      <Section id="endpoints" icon={<Wrench className="size-5 text-primary" />} title="مرجع سریع اندپوینت‌ها">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="py-1.5 px-2 text-start">اندپوینت</th>
                <th className="py-1.5 px-2 text-start">دسترسی</th>
                <th className="py-1.5 px-2 text-start">توضیح</th>
              </tr>
            </thead>
            <tbody className="font-mono" dir="ltr">
              {[
                ["POST /api/systems/{id}/sso", "ورود کاربر در رز هاب", "صدور توکن و launchUrl (داخل رز هاب استفاده می‌شود)"],
                ["GET /api/sso/config", "عمومی", "پیکربندی SSO، زمان سرور و پارامترهای اعتبارسنجی"],
                ["GET /api/auth/logout?redirect=/login", "عمومی", "خروج یکپارچه — لغو نشست رز هاب"],
              ].map(([a, b, c]) => (
                <tr key={a} className="border-b last:border-0">
                  <td className="py-1.5 px-2 text-primary whitespace-nowrap">{a}</td>
                  <td className="py-1.5 px-2 font-sans">{b}</td>
                  <td className="py-1.5 px-2 font-sans">{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* امنیت */}
      <Section id="security" icon={<ShieldCheck className="size-5 text-primary" />} title="چک‌لیست امنیتی الزامی">
        <ul className="list-disc ps-6 space-y-1.5">
          <li>سامانه شما باید فقط روی HTTPS کار کند؛ توکن روی HTTP قابل شنود است.</li>
          <li>Client Secret را در env/مدیریت رازها نگه دارید؛ در کد یا مخزن commit نکنید.</li>
          <li>هرگز الگوریتم دیگری غیر از HS256 را نپذیرید (جلوگیری از حمله algorithm confusion).</li>
          <li>علاوه بر امضا، iss و aud و exp را حتماً بررسی کنید؛ توکن انقضاشده را نپذیرید.</li>
          <li>توکن را در لاگ یا URLهای بعدی ذخیره نکنید؛ پس از ساخت نشست، پارامتر را از URL پاک کنید.</li>
          <li>مجوزهای داخلی سامانه خودتان را مستقل اعمال کنید؛ نقش رز هاب صرفاً راهنماست.</li>
          <li>در صورت لو رفتن رمز، بلافاصله از پنل رز هاب «تمدید رمز» بزنید.</li>
        </ul>
      </Section>

      {/* عیب‌یابی */}
      <Section id="troubleshoot" icon={<Wrench className="size-5 text-primary" />} title="عیب‌یابی رایج">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="py-1.5 px-2 text-start">خطا</th>
                <th className="py-1.5 px-2 text-start">علت و راه‌حل</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["invalid signature", "Client Secret اشتباه است یا رمز تمدید شده — مقدار جدید را از مدیر بگیرید"],
                ["jwt audience invalid", "مقدار ROSE_HUB_CLIENT_ID با aud توکن فرق دارد — clientId را دقیق کپی کنید"],
                ["jwt expired", "بیش از ۵ دقیقه از صدور گذشته است — کاربر را به رز هاب برگردانید تا دوباره ورود بزند"],
                ["jwt issuer invalid", "iss باید دقیقاً rose-hub باشد"],
                ["کاربر منتقل نشد", "بررسی کنید مسیر /auth/rose-hub روی سامانه شما فعال و بدون فیلتر احراز هویت قبلی باشد"],
                ["اختلاف ساعت", "اختلاف ساعت سرور خود را با /api/sso/config بررسی کنید (تحمل ۶۰ ثانیه)"],
              ].map(([a, b]) => (
                <tr key={a} className="border-b last:border-0">
                  <td className="py-1.5 px-2 font-mono text-destructive" dir="ltr">{a}</td>
                  <td className="py-1.5 px-2">{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* لینک سامانه‌ها */}
      <Section id="systems" icon={<Globe className="size-5 text-primary" />} title="لینک مستقیم سامانه‌های مجموعه">
        <p>برای دسترسی مستقیم به نشانی سامانه‌ها (بدون توکن، برای تست‌های تیم فنی):</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {SYSTEM_LINKS.map((s) => (
            <a
              key={s.url}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between rounded-xl border p-3 hover:bg-accent transition-colors"
            >
              <span className="font-medium text-foreground text-sm">{s.name}</span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono" dir="ltr">
                {s.url.replace("https://", "")} <ExternalLink className="size-3.5" />
              </span>
            </a>
          ))}
        </div>
      </Section>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <LogOut className="size-3.5" />
        نسخه ۱٫۰ — این صفحه هم‌راستا با فایل docs/sso-integration-fa.md در مخزن کد نگهداری می‌شود.
      </div>
    </div>
  );
}
