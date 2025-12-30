#!/usr/bin/env node
// Simple dev emitter to append sample OpenCode events to .opencode/logs/events.jsonl
// Usage: node scripts/dev_opencode_emitter.js [count]

const fs = require('fs');
const path = require('path');

const target = path.resolve('.opencode', 'logs', 'events.jsonl');
const count = Number(process.argv[2] || 3);

function ensureDir(file) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

ensureDir(target);

function nowIso(offset = 0) {
  return new Date(Date.now() + offset).toISOString();
}

const agents = ['map', 'bd', 'cli'];
const lines = [];
for (let i = 0; i < count; i++) {
  const agent = agents[i % agents.length];
  const seq = Math.floor(Math.random() * 1000) + i;
  const t = nowIso(i * 1000);
  const obj = {
    type: i % 2 === 0 ? 'agent.message' : 'agent.started',
    time: t,
    properties: {
      agent,
      title: `${agent} dev sample event #${seq}`,
      seq,
    },
  };
  lines.push(JSON.stringify(obj));
}

fs.appendFileSync(target, lines.join('\n') + '\n', 'utf8');
console.log(`Appended ${count} sample events to ${target}`);
