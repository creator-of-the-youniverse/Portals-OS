import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        host: '0.0.0.0',
        port: 5174,
        proxy: {
          '/api': {
            target: 'http://localhost:3002',
            changeOrigin: true,
          },
        },
      },
      plugins: [react({
        // Add JSX runtime to prevent polyfill mode issues
        jsxRuntime: 'automatic',
      })],
      define: {
        // API keys are not exposed to client-side code for security
        // Disable console warnings in production
        'process.env.NODE_ENV': JSON.stringify(mode),
        // Define global constants to reduce runtime checks
        global: 'globalThis',
      },
      esbuild: {
        jsxDev: mode !== 'production',
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      css: {
        postcss: './postcss.config.js',
      },
      // Performance optimizations
      build: {
        rollupOptions: {
          output: {
            manualChunks: {
              vendor: ['react', 'react-dom'],
              three: ['three', '@react-three/fiber', '@react-three/drei'],
              ui: ['framer-motion', 'lucide-react'],
            },
          },
        },
        chunkSizeWarningLimit: 1000,
      },
      // Development optimizations
      optimizeDeps: {
        include: ['react', 'react-dom', 'framer-motion'],
      },
    };
});
