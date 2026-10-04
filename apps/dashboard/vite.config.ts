import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Same-origin API in dev: no CORS, cookies-free Bearer auth just works.
      '/api': 'http://127.0.0.1:8787',
    },
  },
  build: {
    outDir: 'dist',
  },
});
