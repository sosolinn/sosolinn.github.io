/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  reactStrictMode: true,
  images: {
    unoptimized: true
  },
  webpack(config) {
    config.module.rules.push({
      resourceQuery: /raw/,
      type: "asset/source"
    });

    return config;
  }
};

export default nextConfig;
