import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Read both .env files and the process environment (Docker build ARGs and
  // CI job env), so the existing REACT_APP_* names keep working untouched.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    server: {
      port: 3000,
    },
    define: {
      'process.env.REACT_APP_API_URL': JSON.stringify(env.REACT_APP_API_URL ?? ''),
      'process.env.REACT_APP_SOCKET_TRANSPORT': JSON.stringify(
        env.REACT_APP_SOCKET_TRANSPORT ?? ''
      ),
    },
  };
});
