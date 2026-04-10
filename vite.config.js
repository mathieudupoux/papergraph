import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/', // On reste sur la racine pour papergraph.net
  root: '.',
  resolve: {
    // zundo imports bare 'zustand' which pulls in zustand/react (→ React dep).
    // Redirect only the exact 'zustand' specifier to zustand/vanilla.
    alias: [
      { find: /^zustand$/, replacement: 'zustand/vanilla' },
    ],
  },
  server: {
    port: 8000,
  },
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