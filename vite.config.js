import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  // Make sure assets in public folder are copied with correct paths
  publicDir: 'public',
  server: {
    proxy: {
      '/api/flights': {
        target: 'http://api.aviationstack.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/flights/, '/v1/flights'),
      },
    },
  },
})