import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * LAN video testing needs HTTPS: browsers treat `localhost` as safe but reject
 * camera/microphone access from `http://192.168.x.x`.  A developer explicitly
 * supplies a trusted local certificate by path; no generated certificate or
 * secret is ever committed to the repository.
 */
function localHttpsOptions(env: Record<string, string>): { key: Buffer; cert: Buffer } | undefined {
  const keyPath = env.VITE_DEV_HTTPS_KEY?.trim()
  const certPath = env.VITE_DEV_HTTPS_CERT?.trim()
  if (keyPath === undefined && certPath === undefined) return undefined
  if (keyPath === undefined || certPath === undefined) {
    throw new Error('VITE_DEV_HTTPS_KEY và VITE_DEV_HTTPS_CERT phải được đặt cùng nhau.')
  }
  return {
    key: readFileSync(resolve(process.cwd(), keyPath)),
    cert: readFileSync(resolve(process.cwd(), certPath)),
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const https = localHttpsOptions(env)

  return {
    plugins: [react(), tailwindcss()],
    server: {
      // Keep the default private. LAN sharing is an explicit .env.local choice.
      host: env.VITE_DEV_HOST?.trim() || 'localhost',
      port: 5180,
      strictPort: true,
      https,
      proxy: {
        '/api': {
          target: env.VITE_DEV_BACKEND_PROXY?.trim() || 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
      },
    },
  }
})
