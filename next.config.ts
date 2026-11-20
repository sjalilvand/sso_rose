import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // output: "standalone" حذف شد — PM2 اپ را با next start اجرا می‌کند و
  // Next 16 اجرای next start با standalone را پشتیبانی نمی‌کند
  // («next start" does not work with "output: standalone"»)
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  experimental: {
    // پراموت «Preparing upgrade / Looking for coding agents» در انتهای build
    // روی سرور ویندوز مزاحم است — خاموش می‌شود
    agentUpgrade: false,
  },
};

export default nextConfig;
