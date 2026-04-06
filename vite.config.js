import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    strictPort: false,
    hmr: {
      protocol: 'wss',
      clientPort: 443,
    },
    allowedHosts: true,
  },
  preview: {
    allowedHosts: true,
  },
})
