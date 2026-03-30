import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_DEV_SERVER_URL || 'http://localhost:3001'

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/socket.io': {
          target: apiTarget,
          ws: true,
          changeOrigin: true,
        },
      },
    },
  }
})
