import 'dotenv/config';

import path from 'path';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

/**
 * Los tests corren contra su propia base (erp_db_test), nunca contra la de
 * desarrollo: global-setup le aplica las migraciones y la vacía al empezar.
 */
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  (process.env.DATABASE_URL || '').replace(/\/erp_db(?=\?|$)/, '/erp_db_test');

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
  test: {
    testTimeout: 30000,
    globals: true,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DATABASE_URL,
      // Sin conexión con ANT: los envíos de acceso quedan pendientes.
      ANT_API_URL: '',
      ANT_SERVICE_TOKEN: '',
      // Todas las pruebas salen de la misma IP: el límite por IP se prueba
      // aparte (por email) y aquí no debe acumularse entre corridas.
      LOGIN_MAX_POR_IP: '100000',
    },
    setupFiles: ['./test.setup.ts'],
    globalSetup: ['./global-setup.ts'],
    include: ['**/e2e.test.ts'],
    environment: 'node',
    clearMocks: true,
    fileParallelism: false,
  },
});
