import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@ip2m/core': path.resolve(__dirname, './packages/core/src'),
      '@ip2m/rag': path.resolve(__dirname, './packages/rag/src'),
      '@ip2m/policy-graph': path.resolve(__dirname, './packages/policy-graph/src'),
      '@ip2m/reporters': path.resolve(__dirname, './packages/reporters/src'),
      '@ip2m/ui': path.resolve(__dirname, './packages/ui/src'),
    },
  },
  server: {
    port: 3000,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
