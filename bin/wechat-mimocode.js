#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mainJs = join(__dirname, '..', 'dist', 'main.js');
const args = process.argv.slice(2);

// Smart dispatch: if no args or first arg is a flag (but not --version/-v), route to start
let finalArgs = args;

// Pass --version/-v directly without modification
if (args.length > 0 && (args[0] === '--version' || args[0] === '-v')) {
  finalArgs = args;
} else if (args.length === 0 || args[0].startsWith('-')) {
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
