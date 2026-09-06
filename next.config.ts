import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite embarque son runtime WASM avec import.meta.url : on le laisse hors
  // du bundle Next afin d'éviter l'erreur « path must be string ... URL ».
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
