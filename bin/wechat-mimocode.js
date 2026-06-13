#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mainJs = join(__dirname, '..', 'dist', 'main.js');
const args = process.argv.slice(2);

// Smart dispatch: if no args or first arg is a subcommand, route appropriately
let finalArgs = args;

// Flatten "wechat-mimocode daemon start" -> ["daemon", "start"]
// npm-style: if first arg looks like a flag, default to "start"
if (args.length === 0 || args[0].startsWith('-')) {
  finalArgs = ['start', ...args];
}

const child = spawn(process.execPath, [mainJs, ...finalArgs], {
  stdio: 'inherit',
  cwd: process.cwd(),
  env: { ...process.env },
});

child.on('close', (code) => process.exit(code ?? 1));
child.on('error', (err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
