/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ensure the service worker and manifest are served from the app origin.
  async headers() {
    return [
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
      { source: "/manifest.webmanifest", headers: [{ key: "Content-Type", value: "application/manifest+json" }] },
    ];
  },
};
module.exports = nextConfig;
