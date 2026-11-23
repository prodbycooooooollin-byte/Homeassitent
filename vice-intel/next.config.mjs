import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
];

const nextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle — used by the Windows desktop app (Electron).
  output: "standalone",
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    // Add CDN / asset hosts here once licensed media is available.
    remotePatterns: [],
  },
  experimental: {
    serverComponentsExternalPackages: ["@anthropic-ai/sdk"],
    // This app lives in a sub-folder of a larger repo; trace files from here only.
    outputFileTracingRoot: here,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
