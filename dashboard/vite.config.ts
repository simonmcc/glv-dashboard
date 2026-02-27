import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { getGitVersion, getGitUrl } from './build-utils'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(getGitVersion()),
    __APP_URL__: JSON.stringify(getGitUrl()),
  },
})
