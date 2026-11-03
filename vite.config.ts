import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  base: './', // relative URLs, so it works at a domain root or under a sub-path like github.io/repo/
  build: {
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html'), brand: resolve(__dirname, 'brand.html') },
    },
  },
})
