import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/papergraph/', 

  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        editor: resolve(__dirname, 'editor.html'),
        index: resolve(__dirname, 'index.html'),
        gallery: resolve(__dirname, 'gallery.html'),
        projects: resolve(__dirname, 'projects.html'),
        privacy: resolve(__dirname, 'privacy.html'),
      },
    },
  },
  server: {
    port: 8000,
  },
});