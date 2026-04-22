import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // -------------------------------------------------------
    // PROXY: All /api/* calls get forwarded to the FastAPI
    // backend. Change 'target' to your teammate's LAN IP when
    // testing together e.g. http://192.168.1.42:8000
    // -------------------------------------------------------
    proxy: {
      '/api': {
        target: 'http://10.100.240.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
