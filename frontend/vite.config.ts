import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  root: '.',
  plugins: [react()],
  publicDir: 'public',
  server: {
    port: 5173,
    host: true,
    middlewareMode: false,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      input: './index.html',
    },
  },
})
