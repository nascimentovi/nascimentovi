import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';

// Caminho base configurável (ex.: GitHub Pages em subdiretório).
const base = process.env.BASE_PATH ?? '/';

export default defineConfig(({ mode }) => ({
  base,
  // Sintaxe compatível com navegadores móveis mais antigos (Safari 14+/Chrome 87+).
  build: { target: ['es2020', 'safari14', 'chrome87'] },
  // Em desenvolvimento, /tse/* é encaminhado ao site de resultados do TSE (evita bloqueio CORS).
  server: {
    proxy: {
      '/tse': { target: 'https://resultados.tse.jus.br', changeOrigin: true, rewrite: (p) => p.replace(/^\/tse/, '') },
    },
  },
  preview: {
    proxy: {
      '/tse': { target: 'https://resultados.tse.jus.br', changeOrigin: true, rewrite: (p) => p.replace(/^\/tse/, '') },
    },
  },
  plugins: [
    react(),
    // Câmera exige contexto seguro: `npm run dev:https` sobe com certificado local.
    ...(mode === 'https' ? [basicSsl()] : []),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Apuração de Boletins de Urna',
        short_name: 'Apuração BU',
        description: 'Leitura de QR Code, PDF e foto de Boletins de Urna com contabilização offline',
        lang: 'pt-BR',
        theme_color: '#0f3d63',
        background_color: '#f4f6f9',
        display: 'standalone',
        orientation: 'portrait',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        // Pré-cache de tudo, inclusive o núcleo WASM e o modelo do OCR, para uso offline.
        globPatterns: ['**/*.{js,mjs,css,html,svg,wasm,gz,json}'],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}));
