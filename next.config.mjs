/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Minecraft-Avatare (Spielerköpfe) werden über den öffentlichen
    // mc-heads.net-Dienst gerendert (UUID/Name -> Kopf-PNG). Es werden keine
    // Zugangsdaten übertragen, nur der öffentliche Spielername/UUID.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "mc-heads.net",
      },
    ],
  },
};

export default nextConfig;
