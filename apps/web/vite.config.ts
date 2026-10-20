import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    // Must come before react(): it generates src/routeTree.gen.ts.
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    proxy: {
      // The browser only ever talks to this address, as it will in production.
      // changeOrigin stays false so the API (and later Better Auth) sees the
      // browser's Host, which keeps cookies and auth links on this address.
      '/api': { target: 'http://localhost:3000', changeOrigin: false },
    },
  },
})
