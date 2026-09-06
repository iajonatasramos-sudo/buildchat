import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

/**
 * Tailwind v4 dentro de shadow DOM: `@property` não vale aqui.
 *
 * As utilities do Tailwind v4 leem variáveis internas — `.border` é
 * `border-style: var(--tw-border-style); border-width: 1px`, e o valor inicial
 * `solid` vem de uma regra `@property`. Só que `@property` registra a
 * propriedade no DOCUMENTO, e a spec manda IGNORAR as que estão dentro de uma
 * shadow tree — que é exatamente onde o nosso CSS é carregado. Sem registro, o
 * `var()` não resolve, a declaração cai por terra e `border-style` volta a
 * `none`: largura 1px, borda invisível. Foi assim que a extensão inteira ficou
 * sem contorno de campo, caixa e divisória.
 *
 * A correção é dar a cada elemento o valor inicial como variável comum. Aplicar
 * em `.bc-root *` (e não só na raiz) imita o `inherits: false` do `@property`:
 * ninguém herda o valor do pai, e a utility que define a sua própria variável
 * continua vencendo, por estar na camada `utilities`.
 */
function valoresIniciaisDoTailwind(): Plugin {
  return {
    name: 'bc-tw-property-fallback',
    apply: 'build',
    generateBundle(_opcoes, pacote) {
      for (const arquivo of Object.values(pacote)) {
        if (arquivo.type !== 'asset' || !arquivo.fileName.endsWith('.css')) continue;
        const css = String(arquivo.source);

        const iniciais = [...css.matchAll(/@property\s+(--[\w-]+)\s*\{([^}]*)\}/g)]
          .map(([, nome, corpo]) => {
            const valor = /initial-value:\s*([^;]+);/.exec(corpo)?.[1]?.trim();
            return valor ? `    ${nome}: ${valor};` : null;
          })
          .filter(Boolean);
        if (iniciais.length === 0) continue;

        arquivo.source =
          `${css}\n/* Valores iniciais das variáveis do Tailwind — ver vite.config.ts */\n` +
          `@layer base {\n  .bc-root, .bc-root * {\n${iniciais.join('\n')}\n  }\n}\n`;
      }
    },
  };
}

// Três entradas independentes:
//  - content   -> módulo ES carregado pelo public/content-loader.js (content script)
//  - background-> service worker (module) apontado direto no manifest
//  - wa-bridge -> injetado no contexto da PÁGINA (web.whatsapp.com) p/ falar com o WPP
export default defineConfig({
  plugins: [react(), tailwindcss(), valoresIniciaisDoTailwind()],
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
