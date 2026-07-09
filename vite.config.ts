import { spawn } from 'node:child_process'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// 随 dev server 自动拉起 h2 中继(见 scripts/llm-relay.mjs;端口被占说明已有实例,会自动退出)
function llmRelay(): Plugin {
  return {
    name: 'llm-relay',
    configureServer() {
      const child = spawn(process.execPath, ['scripts/llm-relay.mjs'], { stdio: 'inherit' })
      process.on('exit', () => child.kill())
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), llmRelay()],
  server: {
    // OminiGate 不允许浏览器跨域直连,且只在 HTTP/2 上流式;
    // 浏览器 → Vite(/llm-proxy) → 本地中继(:8788, h2) → 网关
    proxy: {
      '/llm-proxy': {
        target: 'http://127.0.0.1:8788',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/llm-proxy/, ''),
      },
    },
  },
})
