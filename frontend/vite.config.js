import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Allow dynamic import() of JSON files (e.g. contract.json written by deploy script)
  json: { stringify: false },
});
