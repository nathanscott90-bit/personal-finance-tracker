import type { NextConfig } from "next";

/** Written to .env.local by setup-windows.ps1, e.g. "desktop.tail1234.ts.net". */
const publicHost = process.env.FINANCE_PUBLIC_HOST?.trim();

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  // Statement text is posted to `commitFile` as a server-action argument; the
  // default 1 MB body limit would reject files the 5 MB dropzone guard allows.
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
      // Server actions refuse a form posted from an origin other than the
      // host they were served on. Behind Tailscale Serve the browser is on
      // https://<pc>.<tailnet>.ts.net, so allow exactly that name.
      allowedOrigins: publicHost ? [publicHost] : [],
    },
  },
};

export default nextConfig;
