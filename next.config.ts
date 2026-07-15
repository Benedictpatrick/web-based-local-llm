import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Cross-origin isolation lets wllama's WASM runtime use
        // multi-threading (SharedArrayBuffer), which speeds up CPU
        // inference significantly. "credentialless" (not "require-corp")
        // avoids breaking the cross-origin model download from HF's CDN.
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
        ],
      },
    ];
  },
};

export default nextConfig;
