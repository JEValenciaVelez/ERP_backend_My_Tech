import { afterAll, beforeAll } from 'vitest';

import prisma from '@/models';

import Server from './server';

beforeAll(async () => {
  console.warn('🧪 Iniciando tests...');

  const server = new Server();
  const app = server.createApp();

  (globalThis as any).app = app;
});

afterAll(async () => {
  console.warn('✅ Tests completados');
  await prisma.$disconnect();
});
