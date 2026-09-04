import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// Três entradas independentes:
//  - content   -> módulo ES carregado pelo public/content-loader.js (content script)
//  - background-> service worker (module) apontado direto no manifest
//  - wa-bridge -> injetado no contexto da PÁGINA (web.whatsapp.com) p/ falar com o WPP
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    // manter legível ajuda a depurar dentro do WhatsApp Web
    minify: false,
    rollupOptions: {
      input: {
        content: path.resolve(__dirname, 'src/content/main.tsx'),
        background: path.resolve(__dirname, 'src/background/index.ts'),
        'wa-bridge': path.resolve(__dirname, 'src/page/wa-bridge.ts'),
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/chunk-[hash].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
