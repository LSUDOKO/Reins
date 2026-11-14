import type { NextConfig } from "next";

// Static export: the console is plain HTML + JS that talks to NEAR RPC directly, so
// it can be served from GitHub Pages. NEXT_PUBLIC_BASE_PATH is "/Reins" there.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

const nextConfig: NextConfig = {
  // Next 16 writes AGENTS.md / CLAUDE.md into the package on dev; the repo keeps its own.
  agentRules: false,
  reactStrictMode: true,
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  transpilePackages: ["@reins/sdk"],
  allowedDevOrigins: ["192.168.1.*", "10.0.0.*"],
};

export default nextConfig;
