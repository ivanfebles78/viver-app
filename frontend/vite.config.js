import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  cacheDir: "/tmp/vite-cache-" + Date.now(),
  server: { port: 5476, strictPort: true },
  // `vite preview` (usado en producción sobre Railway) bloquea por defecto los
  // hosts desconocidos. Permitimos cualquiera para que sirva bajo el dominio
  // *.railway.app del servicio.
  preview: { allowedHosts: true },
});
