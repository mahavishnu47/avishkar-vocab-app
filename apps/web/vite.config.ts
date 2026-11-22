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
        name: 'WordWise',
        short_name: 'WordWise',
        description: '5 new English words every day',
        theme_color: '#1d4ed8',
        background_color: '#fffbea',
        display: 'standalone',
        id: '/',
        start_url: '/',
        scope: '/',
        // PNG icons are what Android/Chrome need to install a real app (not a bookmark shortcut); SVG stays for large sizes.
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      includeAssets: ['apple-touch-icon.png'],
      // Take over open tabs/apps at once after a deploy so people are not stuck on a stale cached copy (H-2).
      workbox: { navigateFallbackDenylist: [/^\/api/], clientsClaim: true, skipWaiting: true, cleanupOutdatedCaches: true },
    }),
  ],
  server: {
    port: 5173,
    host: true,
    proxy: { '/api': `http://localhost:${process.env.API_PORT ?? 4000}` },
  },
  test: { environment: 'jsdom', setupFiles: ['./src/test-setup.ts'] },
});
