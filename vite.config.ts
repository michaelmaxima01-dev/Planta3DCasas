import { execSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/** Código do commit em execução, mostrado na barra superior para conferir a versão. */
function commit() {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'sem-git'
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_COMMIT__: JSON.stringify(commit()),
  },
})
