// Wraps website/src/index.html (artifact-style fragment, no doctype/head/body)
// into a standalone page at website/dist/index.html for static hosting.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, 'src', 'index.html'), 'utf8');
const split = src.indexOf('</style>') + '</style>'.length;
const head = src.slice(0, split).replace(/<meta name="claude:viewport-fit-sides"[^>]*>\n?/, '');
const body = src.slice(split);

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
${head}
</head>
<body>
${body.trim()}
</body>
</html>
`;
mkdirSync(join(here, 'dist'), { recursive: true });
writeFileSync(join(here, 'dist', 'index.html'), page);
console.log('wrote website/dist/index.html', page.length, 'bytes');
