/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@prompt-forge/core",
    "@prompt-forge/enhancer",
    "@prompt-forge/patterns",
    "@prompt-forge/providers",
  ],
  webpack(config) {
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};
export default nextConfig;
