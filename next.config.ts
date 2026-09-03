import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  // Native/local-runtime packages must stay external to the server bundle.
  serverExternalPackages: [
    "@openai/codex",
    "better-sqlite3",
  ],
  outputFileTracingIncludes: {
    "/*": ["./seed/signal.db"],
  },
};

export default nextConfig;
