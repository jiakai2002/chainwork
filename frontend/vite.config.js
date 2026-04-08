import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: {
    // Aptos SDK uses process.env in some paths
    "process.env": {},
    global: "globalThis",
  },
});
