#!/usr/bin/env node
const code = parseInt(process.argv[2] || '0', 10) || 0;
process.exit(code);
