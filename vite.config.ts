import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
    dedupe: ["react", "react-dom"],
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 1000, // kB — warn only above 1MB
    rollupOptions: {
      output: {
        manualChunks: {
          // Split heavy vendor libs into separate chunks
          "vendor-react":   ["react", "react-dom"],
          "vendor-radix":   [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-select",
            "@radix-ui/react-tabs",
            "@radix-ui/react-tooltip",
            "@radix-ui/react-accordion",
            "@radix-ui/react-popover",
          ],
          "vendor-query":   ["@tanstack/react-query"],
          "vendor-supabase": ["@supabase/supabase-js"],
          "vendor-charts":  ["recharts"],
          "vendor-ui":      ["sonner", "vaul", "cmdk"],
        },
      },
    },
  },
});
