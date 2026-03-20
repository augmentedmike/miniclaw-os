import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow server-side access to vault and system files
  serverExternalPackages: [],
};

export default nextConfig;
