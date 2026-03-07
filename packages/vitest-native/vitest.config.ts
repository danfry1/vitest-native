import { defineConfig } from 'vitest/config';
import { reactNative } from './src/index.js';

export default defineConfig({
  plugins: [reactNative({ diagnostics: true })],
});
