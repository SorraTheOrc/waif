#!/usr/bin/env node
const total = 1_000_000;
const chunkSize = 10_000;
const chunk = 'x'.repeat(chunkSize);
let written = 0;
function writeChunk() {
  while (written < total) {
    const ok = process.stdout.write(chunk);
    written += chunkSize;
    if (!ok) {
      process.stdout.once('drain', writeChunk);
      return;
    }
  }
  process.exit(0);
}
writeChunk();
