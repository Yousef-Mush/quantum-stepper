/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works on GitHub Pages, Netlify or any static host.
  base: './',
  build: { target: 'es2022' },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
