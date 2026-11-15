import { defineConfig } from "vite";

// Minimal Vite config. No framework plugins needed - vanilla TypeScript.
export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
  },
});
