import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isBuild = command === 'build';

  return {
    resolve: {
      alias: {
        // Intercept imports to use the correct files during build
        '@apiMapping-json': isBuild
          ? path.resolve(__dirname, 'src/workers/apiMapping.signed.json')
          : path.resolve(__dirname, 'src/workers/apiMapping.json'),
        '@manifest-build-json': isBuild 
          ? path.resolve(__dirname, 'build_assets/manifest.build.json')
          : path.resolve(__dirname, 'src/manifest.build.json'),
      },
    },
    plugins: [
      react(),
      tailwindcss(),
    ],
    base: '/apps/',
    server: {
      hmr: command === 'serve' && env.VITE_HMR_HOST ? {  // create .env.local file with VITE_HMR_HOST=yourhost
        host: env.VITE_HMR_HOST,
        protocol: env.VITE_HMR_PROTOCOL || 'wss',
      } : undefined,
    },
  }
});
