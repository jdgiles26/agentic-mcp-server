import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "../..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: projectRoot,
  transpilePackages: [
    "@prompt-forge/config",
    "@prompt-forge/core",
    "@prompt-forge/enhancer",
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
