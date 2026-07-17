import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { NextConfig } from "next"

const appRoot = dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  devIndicators: false,
  serverExternalPackages: ["better-sqlite3"],
  // Workspace packages ship TypeScript source (no build step), so Next must
  // transpile them.
  transpilePackages: ["@glocalx/db", "@glocalx/domain"],
  turbopack: {
    // Workspace root, not app root: node_modules and packages/* are hoisted
    // two levels up in the npm-workspaces monorepo.
    root: resolve(appRoot, "../.."),
  },
}

export default nextConfig
