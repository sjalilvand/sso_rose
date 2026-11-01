"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, UserPlus, CheckCircle2 } from "lucide-react";
import Image from "next/image";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    fullName: "",
    nationalId: "",
    mobile: "",
    password: "",
    province: "",
    clinic: "",
    jobTitle: "",
  });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  function set(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "ثبت‌نام ناموفق بود");
        return;
      }
      setDone(true);
    } catch {
      setError("خطا در ارتباط با سرور");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex items-center gap-3 p-5">
        <div className="size-11 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Image src="/logo.svg" alt="رز هاب" width={28} height={28} />
        </div>
        <div>
          <h1 className="text-lg font-bold">رز هاب</h1>
          <p className="text-xs text-muted-foreground">درگاه یکپارچه مجموعه کلینیک رز سفید</p>
        </div>
        <Link href="/login" className="ms-auto text-sm text-muted-foreground hover:text-primary">
          بازگشت به ورود
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <Card className="w-full max-w-lg border-border/60 shadow-lg shadow-rose-100/40 dark:shadow-none">
          <CardHeader className="text-center">
            <CardTitle className="text-xl flex items-center justify-center gap-2">
              <UserPlus className="size-5 text-primary" />
              ثبت‌نام در رز هاب
            </CardTitle>
            <CardDescription>
              درخواست شما پس از بررسی و تأیید مدیر فعال می‌شود و سپس می‌توانید وارد شوید.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {done ? (
              <div className="flex flex-col items-center gap-4 py-8 text-center">
                <CheckCircle2 className="size-14 text-emerald-600" />
                <p className="font-medium">درخواست ثبت‌نام شما ثبت شد</p>
                <p className="text-sm text-muted-foreground leading-7">
                  مدیر مجموعه درخواست شما را بررسی می‌کند. به‌محض تأیید، با کد ملی و رمزی که
                  انتخاب کردید می‌توانید وارد شوید.
                </p>
                <Button onClick={() => router.replace("/login")}>بازگشت به صفحهٔ ورود</Button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="fullName">نام و نام خانوادگی</Label>
                    <Input id="fullName" value={form.fullName} onChange={set("fullName")} required placeholder="مثلاً مریم راه‌نورد" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nationalId">کد ملی (نام کاربری)</Label>
                    <Input id="nationalId" dir="ltr" inputMode="numeric" className="text-left" value={form.nationalId} onChange={set("nationalId")} required placeholder="۱۰ رقم" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mobile">شماره موبایل</Label>
                    <Input id="mobile" dir="ltr" inputMode="tel" className="text-left" value={form.mobile} onChange={set("mobile")} required placeholder="09xxxxxxxxx" />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="password">رمز عبور</Label>
                    <Input id="password" type="password" dir="ltr" autoComplete="new-password" className="text-left" value={form.password} onChange={set("password")} required placeholder="حداقل ۶ نویسه" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="province">استان (اختیاری)</Label>
                    <Input id="province" value={form.province} onChange={set("province")} placeholder="مثلاً اصفهان" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="clinic">کلینیک (اختیاری)</Label>
                    <Input id="clinic" value={form.clinic} onChange={set("clinic")} placeholder="مثلاً کلینیک رز" />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="jobTitle">عنوان شغلی (اختیاری)</Label>
                    <Input id="jobTitle" value={form.jobTitle} onChange={set("jobTitle")} placeholder="مثلاً روان‌شناس" />
                  </div>
                </div>

                {error && (
                  <p className="rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-sm px-4 py-3 leading-6">
                    {error}
                  </p>
                )}

                <Button type="submit" className="w-full h-11 text-base" disabled={loading}>
                  {loading ? <Loader2 className="size-5 animate-spin" /> : "ارسال درخواست ثبت‌نام"}
                </Button>

                <p className="text-center text-sm text-muted-foreground">
                  حساب دارید؟{" "}
                  <Link href="/login" className="text-primary hover:underline font-medium">
                    وارد شوید
                  </Link>
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
