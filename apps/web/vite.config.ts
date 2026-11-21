/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Shabd Mitra',
        short_name: 'Shabd Mitra',
        description: '5 new English words every day',
        theme_color: '#1d4ed8',
        background_color: '#fffbea',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: { navigateFallbackDenylist: [/^\/api/] },
    }),
  ],
  server: {
    port: 5173,
    host: true,
    proxy: { '/api': `http://localhost:${process.env.API_PORT ?? 4000}` },
  },
  test: { environment: 'jsdom' },
});
