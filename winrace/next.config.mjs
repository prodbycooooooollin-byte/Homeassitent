/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Linting is run explicitly via `npm run lint` in CI; don't block builds on it.
    ignoreDuringBuilds: true,
  },
  images: {
    // Event-Logos, Spiele-Cover, Twitch-Avatare etc. sind beliebige, vom Host
    // eingetragene URLs – wir verzichten daher bewusst auf next/image (fixe
    // Domain-Allowlist) und rendern sie als normale <img>, siehe components/ui/avatar.tsx.
    unoptimized: true,
  },
};

export default nextConfig;
