"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, LockKeyhole, CheckCircle2 } from "lucide-react";
import Image from "next/image";

function ResetForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("تکرار رمز عبور با رمز جدید یکسان نیست");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "تغییر رمز ناموفق بود");
        return;
      }
      setDone(true);
    } catch {
      setError("خطا در ارتباط با سرور");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="text-center space-y-4 py-4">
        <p className="text-sm text-muted-foreground leading-7">
          پیوند بازیابی معتبر نیست. از بات بله (@rosepro_bot) دکمهٔ «انتخاب رمز جدید» را بزنید تا
          پیوند تازه برایتان ارسال شود.
        </p>
        <Link href="/forgot-password" className="text-primary hover:underline text-sm font-medium">
          صفحهٔ فراموشی رمز
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <CheckCircle2 className="size-14 text-emerald-600" />
        <p className="font-medium">رمز عبور شما تغییر کرد</p>
        <p className="text-sm text-muted-foreground">حالا با رمز جدید وارد شوید.</p>
        <Button onClick={() => router.replace("/login")}>رفتن به صفحهٔ ورود</Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="password">رمز عبور جدید</Label>
        <Input
          id="password"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          className="text-left"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          placeholder="حداقل ۶ نویسه"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">تکرار رمز عبور جدید</Label>
        <Input
          id="confirm"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          className="text-left"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          placeholder="••••••••"
        />
      </div>
      {error && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-sm px-4 py-3 leading-6">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full h-11 text-base" disabled={loading}>
        {loading ? <Loader2 className="size-5 animate-spin" /> : "ثبت رمز جدید"}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
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
        <Card className="w-full max-w-md border-border/60 shadow-lg shadow-rose-100/40 dark:shadow-none">
          <CardHeader className="text-center">
            <CardTitle className="text-xl flex items-center justify-center gap-2">
              <LockKeyhole className="size-5 text-primary" />
              انتخاب رمز عبور جدید
            </CardTitle>
            <CardDescription>پیوند یک‌بارمصرف از بات پشتیبانی بله</CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<div className="h-40" />}>
              <ResetForm />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
