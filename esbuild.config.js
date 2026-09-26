const { build, context } = require('esbuild');
const { spawn } = require('child_process');
const fs = require('fs');

let appProcess;

const opts = {
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: false,
  external: ['./node_modules/*'],
  tsconfig: 'tsconfig.json',
  logLevel: 'info',

  ...(['production', 'sandbox'].includes(process.env.NODE_ENV)
    ? {
        minify: true,
        entryPoints: {
          erp: './app.ts',
          // Se corre una vez desde el Shell de Render: `node dist/seed.js`.
          seed: './prisma/seed.ts',
        },
      }
    : {
        minifyWhitespace: false,
        entryPoints: ['./app.ts'],
      }),
};

const restartApp = () => {
  if (appProcess) {
    appProcess.kill();
  }
  console.log('🚀 restarting app...');
  appProcess = spawn('node', ['dist/app.js'], { stdio: 'inherit' });
};

const dev = async () => {
  const ctx = await context(opts);
  await ctx.watch();

  fs.watchFile('./dist/app.js', () => {
    if (fs.existsSync('./dist/app.js')) {
      restartApp();
    }
  });

  process.on('SIGINT', async () => {
    console.log('🛑 Deteniendo esbuild...');
    if (appProcess) appProcess.kill();
    await ctx.dispose();
    process.exit(0);
  });
};

if (['production', 'sandbox'].includes(process.env.NODE_ENV)) {
  build(opts).catch(() => process.exit(1));
} else {
  dev();
}
