import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Split stable vendor code out of the index chunk so repeat visits
        // (and deploys that only touch app code) re-use the cached vendor
        // bundle instead of re-downloading ~800KB.
        manualChunks: {
          vendor: ["react", "react-dom", "wouter"],
          query:  ["@tanstack/react-query"],
          ui:     ["framer-motion", "lucide-react"],
        },
      },
    },
  },
});
