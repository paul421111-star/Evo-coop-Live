import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    // As credenciais do WhatsApp (Baileys) viram milhares de arquivos em
    // data/whatsapp; vigiar essa pasta deixa o servidor de desenvolvimento lento.
    watch: {
      ignored: ['**/data/**'],
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3015',
        changeOrigin: true,
      },
    },
  },
})
