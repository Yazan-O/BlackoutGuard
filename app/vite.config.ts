import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "localhost",
    port: 5173,
    // fixtures live in ../contracts and are pulled in at build time via import.meta.glob
    fs: { allow: [".."] },
  },
});
