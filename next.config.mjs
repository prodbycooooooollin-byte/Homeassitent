/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["3000-" + (process.env.BASE44_PUBLIC_HOST_SUFFIX || "")].filter(Boolean),
};

export default nextConfig;
