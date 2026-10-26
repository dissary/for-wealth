import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // The API's port, read from apps/api/.env so the proxy follows PORT there.
  // Only PORT is loaded; the API's other values stay out of this process.
  const apiDir = fileURLToPath(new URL('../api', import.meta.url))
  const { PORT: apiPort = '3000' } = loadEnv(mode, apiDir, 'PORT')

  return {
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
        // The browser only ever talks to this address, as it will in
        // production. changeOrigin stays false so the API (and later Better
        // Auth) sees the browser's Host, which keeps cookies and auth links on
        // this address.
        '/api': { target: `http://localhost:${apiPort}`, changeOrigin: false },
      },
    },
  }
})
