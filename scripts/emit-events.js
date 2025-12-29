#!/usr/bin/env node
// ESM-safe launcher for calling emitEvents from built dist
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  try {
    const modPath = path.join(__dirname, '..', 'dist', 'index.js');
    const mod = await import(modPath);
    if (mod && typeof mod.emitEvents === 'function') {
      await mod.emitEvents();
      console.log('emit-events: invoked');
    } else {
      console.error('emit-events: emitEvents not found in dist/index.js');
      process.exitCode = 2;
    }
  } catch (err) {
    console.error('emit-events: failed', err);
    process.exitCode = 1;
  }
}

main();
