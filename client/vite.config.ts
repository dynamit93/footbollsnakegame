import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_DEV_SERVER_URL || 'http://localhost:3001'

  return {
    resolve: {
      alias: {
        '@soccer-snake/shared': path.resolve(__dirname, '../shared/src/index.ts'),
      },
    },
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
