import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/', // On reste sur la racine pour papergraph.net
  root: '.',
  build: {
    outDir: 'dist',
    assetsDir: 'build-assets', // Évite le conflit avec ton dossier 'assets' de logos
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        editor: resolve(__dirname, 'editor.html'),
        gallery: resolve(__dirname, 'gallery.html'),
        projects: resolve(__dirname, 'projects.html'),
        privacy: resolve(__dirname, 'privacy.html'),
      },
    },
  },
});