#!/usr/bin/env node
// momentry CLI entry: check Node, then hand over to lib/cli.mjs. Kept tiny so an old Node gets a clear message.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MIN_NODE = 20;
const BIN = fileURLToPath(import.meta.url);

async function run(argv) {
  if (Number(process.versions.node.split('.')[0]) < MIN_NODE) {
    if (argv[0] === 'hook') { if (argv.includes('--agy')) process.stdout.write('{}\n'); return 0; } // a hook never fails the session
    process.stderr.write(`lỗi: momentry cần Node ≥ ${MIN_NODE}, đang chạy ${process.versions.node}\n  sửa: cài Node ≥ ${MIN_NODE} từ https://nodejs.org (hoặc nvm install 22)\n`);
    return 1;
  }
  const { main } = await import(pathToFileURL(path.join(path.dirname(BIN), '..', 'lib', 'cli.mjs')).href);
  return main(argv);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(BIN)) {
  process.exitCode = await run(process.argv.slice(2));
}
