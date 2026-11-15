if(Number(process.versions.node.split('.')[0])<24){console.error('Install Node.js 24 or newer: https://nodejs.org/en/download');process.exit(1);}
try {await import('node:sqlite');}catch{console.error('This Node installation does not include node:sqlite. Install an official Node.js 24 build.');process.exit(1);}
if(process.arch==='arm')console.warn('Use a 64-bit operating system and the ARM64 Node.js build on Raspberry Pi.');
