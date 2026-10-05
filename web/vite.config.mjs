import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import { phoneRelay } from './phone-relay.mjs'
import { phoneSetupPlugin } from './phone-setup.mjs'

export default defineConfig(({ mode }) => {
  const phone = mode === 'phone'
  if (phone && (!process.env.MOTION_TLS_KEY || !process.env.MOTION_TLS_CERT)) {
    throw new Error('Set MOTION_TLS_KEY and MOTION_TLS_CERT to trusted mkcert PEM files; see PHONE_CONTROLLER.md')
  }
  return {
    plugins: [phoneRelay(),phoneSetupPlugin(phone,phone?readFileSync(process.env.MOTION_TLS_CERT):undefined)],
    server: {
      host: phone ? '0.0.0.0' : '127.0.0.1', port: 5173, strictPort: true,
      https: phone ? { key: readFileSync(process.env.MOTION_TLS_KEY), cert: readFileSync(process.env.MOTION_TLS_CERT) } : undefined,
      proxy: { '/cv-ws': { target: 'ws://127.0.0.1:8765', ws: true, rewrite: () => '/' } },
    },
  }
})
