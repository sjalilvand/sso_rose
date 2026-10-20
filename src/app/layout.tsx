import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";

const vazir = localFont({
  src: "../fonts/Vazirmatn-Variable.ttf",
  variable: "--font-vazir",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "رز هاب | Rose Hub — درگاه یکپارچه مجموعه رز سفید",
  description:
    "درگاه یکپارچه مدیریت، ارتباطات و همکاری مجموعه کلینیک رز سفید: ورود یکپارچه، داشبورد شخصی، وظایف، تقویم شمسی، اطلاعیه‌ها، گفتگوها و یادداشت‌ها",
  icons: {
    icon: "/logo.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fdf2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#1b1418" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body
        className={`${vazir.variable} antialiased bg-background text-foreground min-h-screen`}
      >
        <Providers>{children}</Providers>
        <Toaster position="top-center" richColors closeButton dir="rtl" />
      </body>
    </html>
  );
}
