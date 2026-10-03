import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // The shared workspace package ships TypeScript source.
  transpilePackages: ["@app1/shared"],
  turbopack: {
    // npm workspaces hoist node_modules to the repo root.
    root: join(here, ".."),
    resolveAlias: {
      // RainbowKit references the Base Account connector. During SSR the package's "node" entry is
      // picked, which drags in Coinbase's server SDK (and its optional x402 deps). The browser entry
      // is all a web app needs, so always use it.
      "@base-org/account": "@base-org/account/browser",
    },
  },
};

export default nextConfig;
