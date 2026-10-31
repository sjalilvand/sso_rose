"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from "@/components/ui/input-otp";
import { Loader2, Lock, User, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [needsOtp, setNeedsOtp] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, otpCode: otp || undefined }),
      });
      const data = await res.json();
      if (data.requiresTwoFactor) {
        setNeedsOtp(true);
        toast.info("کد تأیید دومرحله‌ای را وارد کنید");
        return;
      }
      if (!res.ok) {
        toast.error(data.error || "ورود ناموفق بود");
        return;
      }
      toast.success(`خوش آمدید ${data.user.name}`);
      router.replace(searchParams.get("next") || "/");
      router.refresh();
    } catch {
      toast.error("خطا در ارتباط با سرور");
    } finally {
      setLoading(false);
    }
  }

  async function requestDemoOtp() {
    const res = await fetch("/api/auth/otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error);
      return;
    }
    toast.info(`کد نمایشی: ${data.demoCode}`, { duration: 8000 });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">ایمیل سازمانی یا کد ملی</Label>
        <div className="relative">
          <User className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            id="email"
            type="text"
            dir="ltr"
            autoComplete="username"
            placeholder="name@rose.ir یا کد ملی"
            className="pr-9 text-left"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">رمز عبور</Label>
        <div className="relative">
          <Lock className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            id="password"
            type="password"
            dir="ltr"
            placeholder="••••••••"
            className="pr-9 text-left"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
      </div>

      {needsOtp && (
        <div className="space-y-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4 animate-fade-up">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="size-4 text-primary" />
            کد تأیید دومرحله‌ای
          </div>
          <InputOTP maxLength={6} value={otp} onChange={setOtp} dir="ltr">
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
            </InputOTPGroup>
            <InputOTPSeparator />
            <InputOTPGroup>
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
          <button
            type="button"
            onClick={requestDemoOtp}
            className="text-xs text-primary hover:underline"
          >
            درخواست کد (نمایشی — در نسخه واقعی پیامک/ایمیل می‌شود)
          </button>
        </div>
      )}

      <Button type="submit" className="w-full h-11 text-base" disabled={loading}>
        {loading ? <Loader2 className="size-5 animate-spin" /> : "ورود به رز هاب"}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* ستون معرفی */}
      <div className="relative lg:w-[46%] bg-gradient-to-br from-[#c2185b] via-[#d81b60] to-[#0f766e] text-white p-8 lg:p-14 flex flex-col justify-between overflow-hidden">
        <div className="absolute inset-0 opacity-[0.07]" aria-hidden>
          <div className="absolute -top-24 -right-24 size-96 rounded-full bg-white blur-3xl" />
          <div className="absolute bottom-0 -left-24 size-80 rounded-full bg-white blur-3xl" />
        </div>
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="size-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center">
              <Image src="/logo.svg" alt="رز هاب" width={40} height={40} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-shadow-soft">رز هاب | Rose Hub</h1>
              <p className="text-white/85 text-sm">درگاه یکپارچه مجموعه کلینیک رز سفید</p>
            </div>
          </div>
        </div>
        <div className="relative space-y-6 my-10">
          <h2 className="text-3xl lg:text-4xl font-bold leading-relaxed text-shadow-soft">
            یک حساب کاربری،
            <br />
            دسترسی به همه سامانه‌های مجموعه
          </h2>
          <p className="text-white/85 leading-8 max-w-md">
            داشبورد شخصی، وظایف، تقویم شمسی، اطلاعیه‌ها، گفتگوهای سازمانی و یادداشت‌ها — همه در یک
            محیط آرام، امن و هماهنگ.
          </p>
          <div className="flex flex-wrap gap-2 text-xs">
            {["ورود یکپارچه (SSO)", "مدیریت وظایف", "تقویم شمسی", "گفتگوی سازمانی", "گزارش مدیریتی"].map((f) => (
              <span key={f} className="rounded-full bg-white/15 backdrop-blur px-3 py-1.5">
                {f}
              </span>
            ))}
          </div>
        </div>
        <p className="relative text-white/60 text-xs">
          ارتباطات رمزگذاری‌شده · کنترل دسترسی سمت سرور · OpenID Connect / OAuth 2.0
        </p>
      </div>

      {/* ستون فرم ورود */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-6">
          <Card className="border-border/60 shadow-lg shadow-rose-100/40 dark:shadow-none">
            <CardHeader className="text-center">
              <CardTitle className="text-xl">ورود به حساب کاربری</CardTitle>
              <CardDescription>با ایمیل یا کد ملی و یک رمز عبور وارد شوید</CardDescription>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<div className="h-40" />}>
                <LoginForm />
              </Suspense>
            </CardContent>
          </Card>

          <p className="text-center text-xs text-muted-foreground">
            ورود یکپارچه به معنای دسترسی به همه سامانه‌ها نیست؛ مجوز هر سامانه جداگانه تعیین می‌شود.
          </p>
        </div>
      </div>
    </div>
  );
}
