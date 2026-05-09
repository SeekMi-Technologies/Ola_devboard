import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Vite config for the devboard frontend.
//
// Port: 3001 (CRM holds 3000). `strictPort: true` so a stale CRM dev
// server on 3001 surfaces as a clean error rather than vite silently
// drifting to 3002.
//
// Proxy: `/api` is rewritten to the devboard backend (8890). Same-origin
// reduces CORS noise during local dev. The backend ALSO has CORS for
// localhost:3001 as a belt-and-braces — direct XHR still works.

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '..'), '');
  const FRONTEND_PORT = Number(env.FRONTEND_PORT) || 3001;
  const BACKEND_PORT = Number(env.BACKEND_PORT) || 8890;
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: '127.0.0.1',
      port: FRONTEND_PORT,
      strictPort: true,
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${BACKEND_PORT}`,
          changeOrigin: false,
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: false,
    },
  };
});
