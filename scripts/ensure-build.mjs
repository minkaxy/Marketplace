import { access } from 'node:fs/promises';
try {
  await access(new URL('../dist/server/index.js', import.meta.url));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  await import('./build.mjs');
}
