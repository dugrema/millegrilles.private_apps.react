import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  const isBuild = command === 'build'

  return {
    resolve: {
      alias: {
        // Intercept imports to use the correct files during build
        '@apiMapping-json': isBuild
          ? path.resolve(__dirname, 'app/workers/apiMapping.signed.json')
          : path.resolve(__dirname, 'app/workers/apiMapping.json'),
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
  }
});
