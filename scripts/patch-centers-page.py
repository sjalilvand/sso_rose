#!/usr/bin/env python3
"""patch-centers-page.py — شهرستان + مدیر مرکز + نمای ساختاری استان→شهرستان در صفحهٔ مراکز"""
import sys

P = "/home/z/my-project/src/app/(panel)/admin/centers/page.tsx"
s = open(P, encoding="utf-8").read()
orig = s
R = 0

def rep(old, new, count=1):
    global s, R
    if old not in s:
        print("ANCHOR NOT FOUND:", old[:90].replace("\n", "\\n"))
        sys.exit(1)
    s = s.replace(old, new, count)
    R += 1

# ---------- A) فایل‌های ایمپورت: افزودن آیکون‌های درخت ----------
rep(
    "  MapPin, Plus, Loader2, Search, Building2, Hospital, Landmark, HeartHandshake,\n  RefreshCw, Pencil, Trash2, Crosshair, LocationEdit, Ban, Layers,\n",
    "  MapPin, Plus, Loader2, Search, Building2, Hospital, Landmark, HeartHandshake,\n  RefreshCw, Pencil, Trash2, Crosshair, LocationEdit, Ban, Layers,\n  ChevronDown, ChevronLeft, Network, UserRound,\n",
)

# ---------- B) رابط Center ----------
rep(
    "interface Center {\n  id: string; code: string; name: string; type: string; region: string;\n  province: string; city: string; address: string; phone: string;\n",
    "interface Center {\n  id: string; code: string; name: string; type: string; region: string;\n  province: string; county: string; city: string; address: string; phone: string;\n",
)

# ---------- C) فرم خالی ----------
rep(
    'const emptyForm = {\n  id: "", code: "", name: "", type: "CLINIC", region: "", province: "", city: "",\n  address: "", phone: "", lat: "", lng: "", radiusM: "300", isActive: true,\n};',
    'const emptyForm = {\n  id: "", code: "", name: "", type: "CLINIC", region: "", province: "", county: "", city: "",\n  address: "", phone: "", lat: "", lng: "", radiusM: "300", isActive: true, managerId: "",\n};',
)

# ---------- D) وضعیت‌های جدید ----------
rep(
    '  const [formOpen, setFormOpen] = useState(false);\n  const [form, setForm] = useState({ ...emptyForm });\n',
    '  const [formOpen, setFormOpen] = useState(false);\n  const [form, setForm] = useState({ ...emptyForm });\n'
    '  const [view, setView] = useState<"map" | "org">("map"); // نقشه یا ساختار استان←شهرستان\n'
    '  const [openProv, setOpenProv] = useState<Set<string>>(new Set());\n'
    '  const [openCounty, setOpenCounty] = useState<Set<string>>(new Set());\n'
    '  const [userOpts, setUserOpts] = useState<Array<{ value: string; label: string; hint?: string }> | null>(null);\n',
)

# ---------- E) تابع بارگذاری گزینه‌های مدیر ----------
rep(
    "  // ---------- ذخیره ----------\n  async function save() {",
    """  // گزینه‌های «مدیر مرکز» — بارگذاری یک‌باره
  async function ensureUserOpts() {
    if (userOpts !== null) return;
    try {
      const d = await api<{ users: Array<{ id: string; name: string; jobTitle: string; unit: string }> }>("/api/users");
      setUserOpts(d.users.map((u) => ({ value: u.id, label: u.name, hint: u.jobTitle || u.unit })));
    } catch {
      setUserOpts([]);
    }
  }

  // ---------- ذخیره ----------
  async function save() {""",
)

# ---------- F) ارسال شهرستان و مدیر در ذخیره ----------
rep(
    "        province: form.province.trim(),\n        city: form.city.trim(),\n        address: form.address.trim(),",
    "        province: form.province.trim(),\n        county: form.county.trim(),\n        city: form.city.trim(),\n        managerId: form.managerId || null,\n        address: form.address.trim(),",
)

# ---------- G) openEdit با شهرستان و مدیر ----------
rep(
    "  function openEdit(c: Center) {\n    setForm({\n      id: c.id, code: c.code, name: c.name, type: c.type, region: c.region,\n      province: c.province, city: c.city, address: c.address, phone: c.phone,",
    "  function openEdit(c: Center) {\n    ensureUserOpts();\n    setForm({\n      id: c.id, code: c.code, name: c.name, type: c.type, region: c.region,\n      province: c.province, county: c.county || \"\", city: c.city, address: c.address, phone: c.phone,",
)
rep(
    "      radiusM: String(c.radiusM), isActive: c.isActive,\n    });\n    setFormOpen(true);",
    "      radiusM: String(c.radiusM), isActive: c.isActive, managerId: c.managerId || \"\",\n    });\n    setFormOpen(true);",
)

# ---------- H) دکمهٔ «مرکز جدید» → ensureUserOpts ----------
# دکمه ثبت مرکز جدید: find its onClick
import re
mnew = re.search(r"onClick=\{\(\) => \{\s*setForm\(\{ \.\.\.emptyForm \}\);\s*setFormOpen\(true\);", s)
if mnew:
    s = s.replace(
        "setForm({ ...emptyForm });\n          setFormOpen(true);",
        "setForm({ ...emptyForm });\n          ensureUserOpts();\n          setFormOpen(true);",
        1,
    )
    R += 1
else:
    print("WARN: new-center button anchor not found — ensureUserOpts only wired to openEdit")

# ---------- I) زیرنویس فهرست با شهرستان ----------
rep(
    '                      {c.province || "بدون استان"} · کد {c.code} · شعاع {faNum(c.radiusM)} متر',
    '                      {[c.province, c.county, c.city].filter(Boolean).join(" › ") || "بدون استان"} · کد {c.code}\n                      {c.managerId && managerName(c.managerId) ? ` · مدیر: ${managerName(c.managerId)}` : ""}',
)

# ---------- J) کلید تغییر نما قبل از گرید اصلی ----------
rep(
    '      <div className="grid lg:grid-cols-5 gap-4">\n        {/* فهرست مراکز */}',
    """      {/* کلید نما: نقشه یا ساختار سازمانی */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-muted-foreground">نمای نمایش:</span>
        <div className="flex rounded-xl border overflow-hidden">
          <button
            className={`px-3 h-8 text-xs flex items-center gap-1.5 ${view === "map" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            onClick={() => setView("map")}
          >
            <MapPin className="size-3.5" /> نقشه و فهرست
          </button>
          <button
            className={`px-3 h-8 text-xs flex items-center gap-1.5 border-s ${view === "org" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            onClick={() => setView("org")}
          >
            <Network className="size-3.5" /> ساختار استان ← شهرستان ← مراکز
          </button>
        </div>
      </div>

      {view === "org" ? (
        <Card>
          <CardContent className="p-3 max-h-[720px] overflow-y-auto">
            {orgTree()}
            {provincesOrg.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-10">
                هنوز مرکزی ثبت نشده است.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
      <div className="grid lg:grid-cols-5 gap-4">
        {/* فهرست مراکز */}""",
)

# ---------- K) بستن سه‌نمایی قبل از فرم مرکز ----------
rep(
    "      {/* فرم مرکز */}",
    """      )}
      {/* فرم مرکز */}""",
)

# ---------- L) فیلد شهرستان در فرم (سطر استان/شهر → سه‌ستونه) ----------
rep(
    """            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>استان</Label>
                <SearchableSelect
                  value={form.province}
                  onChange={(v) => { setForm((f) => ({ ...f, province: v, city: "" })); if (v) flyToCity(v, 11); }}
                  options={provinceOptions}
                  noneLabel="— انتخاب نشده —"
                  placeholder="انتخاب استان"
                />
              </div>
              <div className="space-y-1.5">
                <Label>شهر</Label>
                <SearchableSelect
                  value={form.city}
                  onChange={(v) => { setForm((f) => ({ ...f, city: v })); if (v) flyToCity(v, 12); }}
                  options={cityOptions}
                  noneLabel="— انتخاب نشده —"
                  placeholder="انتخاب شهر — نقشه به آن شهر می‌رود"
                />
              </div>
            </div>""",
    """            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>استان</Label>
                <SearchableSelect
                  value={form.province}
                  onChange={(v) => { setForm((f) => ({ ...f, province: v, county: "", city: "" })); if (v) flyToCity(v, 11); }}
                  options={provinceOptions}
                  noneLabel="— انتخاب نشده —"
                  placeholder="انتخاب استان"
                />
              </div>
              <div className="space-y-1.5">
                <Label>شهرستان</Label>
                <Input
                  value={form.county}
                  onChange={(e) => setForm((f) => ({ ...f, county: e.target.value }))}
                  placeholder="مثلاً مراغه"
                  list="county-suggestions"
                />
                <datalist id="county-suggestions">
                  {countySuggestions.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label>شهر</Label>
                <SearchableSelect
                  value={form.city}
                  onChange={(v) => { setForm((f) => ({ ...f, city: v })); if (v) flyToCity(v, 12); }}
                  options={cityOptions}
                  noneLabel="— انتخاب نشده —"
                  placeholder="انتخاب شهر — نقشه به آن شهر می‌رود"
                />
              </div>
            </div>""",
)

# ---------- M) انتخاب مدیر مرکز در فرم ----------
rep(
    '            <div className="space-y-1.5">\n              <Label>آدرس</Label>',
    """            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><UserRound className="size-3.5" /> مدیر مرکز</Label>
              <SearchableSelect
                value={form.managerId}
                onChange={(v) => setForm((f) => ({ ...f, managerId: v }))}
                options={userOpts || []}
                noneLabel="— بدون مدیر —"
                placeholder="انتخاب مدیر مرکز (از کاربران)"
                loading={userOpts === null}
              />
            </div>
            <div className="space-y-1.5">
              <Label>آدرس</Label>""",
)

open(P, "w", encoding="utf-8").write(s)
print(f"centers page patched: {R} edits")
