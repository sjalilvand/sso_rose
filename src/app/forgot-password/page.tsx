"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, KeyRound, CheckCircle2, MessageCircle } from "lucide-react";
import Image from "next/image";

function ForgotForm() {
  const [nationalId, setNationalId] = useState("");
  const [loading, setLoading] = useState(false);
  const [okMsg, setOkMsg] = useState("");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setOkMsg("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nationalId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "درخواست بازیابی ناموفق بود");
        return;
      }
      setOkMsg(data.message);
    } catch {
      setError("خطا در ارتباط با سرور");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="nationalId">کد ملی حساب شما</Label>
          <Input
            id="nationalId"
            dir="ltr"
            inputMode="numeric"
            className="text-left"
            value={nationalId}
            onChange={(e) => setNationalId(e.target.value)}
            required
            placeholder="۱۰ رقم"
          />
        </div>
        {error && (
          <p className="rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-sm px-4 py-3 leading-6 whitespace-pre-line">
            {error}
          </p>
        )}
        {okMsg && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 text-sm px-4 py-3 leading-6">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="size-5 shrink-0 mt-0.5" />
              <span>{okMsg}</span>
            </div>
            <p className="mt-2 text-xs leading-6">
              پیام بات را باز کنید و روی دکمهٔ «انتخاب رمز جدید» بزنید. اگر حساب خود را هنوز به بات
              متصل نکرده‌اید، اول در بله به{" "}
              <a href="https://ble.ir/rosepro_bot" target="_blank" rel="noreferrer" className="underline font-medium">
                ble.ir/rosepro_bot
              </a>{" "}
              پیام دهید.
            </p>
          </div>
        )}
        <Button type="submit" className="w-full h-11 text-base" disabled={loading}>
          {loading ? <Loader2 className="size-5 animate-spin" /> : "ارسال کد بازیابی به بات بله"}
        </Button>
      </form>
      <div className="mt-4 rounded-xl border bg-muted/40 p-3 text-xs text-muted-foreground leading-6 flex items-start gap-2">
        <MessageCircle className="size-4 shrink-0 mt-0.5 text-primary" />
        <span>
          بازیابی رمز فقط از طریق بات پشتیبانی بله انجام می‌شود:{" "}
          <a href="https://ble.ir/rosepro_bot" target="_blank" rel="noreferrer" className="underline">
            ble.ir/rosepro_bot
          </a>{" "}
          — در بات گزینهٔ «فراموشی رمز عبور» را بزنید، کد ملی و ۴ رقم آخر موبایلتان را ارسال کنید تا
          حساب متصل شود.
        </span>
      </div>
    </>
  );
}

export default function ForgotPasswordPage() {
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
              <KeyRound className="size-5 text-primary" />
              فراموشی رمز عبور
            </CardTitle>
            <CardDescription>کد بازیابی از طریق بات پشتیبانی بله برای شما ارسال می‌شود</CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<div className="h-40" />}>
              <ForgotForm />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
