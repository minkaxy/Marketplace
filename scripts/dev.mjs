process.env.PORT ||= '4173';
await import('./ensure-build.mjs');
await import('./start.mjs');
