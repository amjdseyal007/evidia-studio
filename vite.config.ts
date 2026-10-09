import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vitest config lives here too (test field is read by vitest).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
