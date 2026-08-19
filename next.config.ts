import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // native module — must stay external to the server bundle
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
