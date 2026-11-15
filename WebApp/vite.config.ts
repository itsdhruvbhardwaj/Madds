import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': { target: 'https://picme-ai.onrender.com', changeOrigin: true, timeout: 600_000, proxyTimeout: 600_000 } } },
  build: { target: 'safari16', sourcemap: false, outDir: 'dist/client' },
});
