import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Three.js + React Three Fiber — heaviest dependencies
          "three-vendor": ["three"],
          "r3f-vendor": ["@react-three/fiber", "@react-three/drei"],
          // React core
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          // UI utilities
          "ui-vendor": ["lucide-react", "react-compare-slider"],
        },
      },
    },
    // Raise the warning threshold since Three.js chunks are inherently large
    chunkSizeWarningLimit: 600,
  },
});
