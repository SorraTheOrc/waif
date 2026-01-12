#!/usr/bin/env node
const ms = parseInt(process.argv[2] || '0', 10) || 0;
setTimeout(() => process.exit(0), ms);
