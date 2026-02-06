import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react()],
    define: {
      // This is necessary to make process.env.API_KEY work in the browser
      // usually Vite uses import.meta.env
      'process.env.API_KEY': JSON.stringify(env.API_KEY)
    }
  };
});