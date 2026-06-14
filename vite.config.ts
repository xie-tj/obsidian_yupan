import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // 拆分重型依赖为可并行下载、可独立缓存的 chunk；
        // Three.js（流体）单独成块，配合 App 里的 React.lazy 从首屏关键路径剥离。
        manualChunks: {
          three: ['three', '@react-three/fiber'],
          charts: ['lightweight-charts'],
          motion: ['framer-motion'],
          'react-vendor': ['react', 'react-dom'],
        },
      },
    },
  },
})
