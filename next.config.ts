import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    clientsClaim: true,
    skipWaiting: true,
  },
});

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: ['puppeteer', 'puppeteer-core', '@sparticuz/chromium'],
  outputFileTracingIncludes: {
    '/api/bot/invoice': ['./node_modules/@sparticuz/chromium/**'],
  },
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};

export default withPWA(nextConfig);
