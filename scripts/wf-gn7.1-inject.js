#!/usr/bin/env node
// Minimal POC: inject a context payload into an OpenCode session
// Usage: node scripts/wf-gn7.1-inject.js --session <id> --context '<json>'

import fetch from 'node-fetch';
import process from 'process';

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--session') out.session = args[++i];
    if (args[i] === '--context') out.context = args[++i];
  }
  return out;
}

async function main() {
  const { session, context } = parseArgs();
  if (!session || !context) {
    console.error('Usage: --session <id> --context <json>');
    process.exit(2);
  }

  const url = process.env.OPENCODE_URL;
  const key = process.env.OPENCODE_API_KEY;
  if (!url || !key) {
    console.error('Missing OPENCODE_URL or OPENCODE_API_KEY environment variables.');
    process.exit(2);
  }

  let payload;
  try {
    payload = JSON.parse(context);
  } catch (e) {
    console.error('Invalid JSON for --context');
    process.exit(2);
  }

  const endpoint = `${url.replace(/\/+$/, '')}/sessions/${encodeURIComponent(session)}/context`;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${key}`
      },
      body: JSON.stringify({ prime: payload })
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('OpenCode API error:', res.status, text);
      process.exit(2);
    }
    console.log('Context injected successfully');
  } catch (e) {
    console.error('Network error:', e.message);
    process.exit(2);
  }
}

main();
