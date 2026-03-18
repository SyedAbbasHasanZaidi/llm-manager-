/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,

  // Prevents Next.js from bundling these Node.js-only packages into the
  // edge/browser bundles. They're used only in server-side API routes.
  serverExternalPackages: ["pg"],
};

module.exports = nextConfig;
