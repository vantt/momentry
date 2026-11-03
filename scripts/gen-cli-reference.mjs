#!/usr/bin/env node
// Generates docs/cli-reference.md from lib/commands.mjs (the single command definition).
// Usage: node scripts/gen-cli-reference.mjs   (test/commands.test.mjs fails when the file is stale)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMMANDS, GLOBAL_FLAGS } from '../lib/commands.mjs';
import { EXIT } from '../lib/config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'cli-reference.md');

const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const flagName = (k, f) => `${f.short ? `\`-${f.short}\`, ` : ''}\`--${k}${f.type === 'string' ? ` ${f.arg ?? 'X'}` : ''}\``;

export function renderReference() {
  const out = [
    '# Tham chiếu lệnh momentry',
    '',
    '<!-- Sinh từ lib/commands.mjs bằng `node scripts/gen-cli-reference.mjs`. Đừng sửa tay. -->',
    '',
    'Trợ giúp trong máy: `momentry --help`, `momentry <lệnh> --help`, `momentry help --json`.',
    '',
    '## Cờ chung',
    '',
    '| Cờ | Ý nghĩa |',
    '|---|---|',
    ...Object.entries(GLOBAL_FLAGS).map(([k, f]) => `| ${flagName(k, f)} | ${cell(f.desc)} |`),
    '',
    '## Mã thoát',
    '',
    '| Mã | Nghĩa |',
    '|---|---|',
    `| ${EXIT.OK} | xong |`,
    `| ${EXIT.FAIL} | lỗi, hoặc \`check\` thấy lỗi khuôn / vi phạm riêng tư, hoặc doctor còn check quan trọng chưa đạt |`,
    `| ${EXIT.USAGE} | sai cú pháp lệnh hoặc cờ; thiếu \`--yes\` khi không có TTY |`,
    `| ${EXIT.UNCHECKED} | bỏ qua kiểm riêng tư vì chưa có nguồn chặn |`,
    `| ${EXIT.LLM} | model lỗi |`,
    `| ${EXIT.LOCKED} | phiên đang bị tiến trình khác khoá |`,
    `| ${EXIT.UPDATE} | \`update --check\`: có bản mới |`,
    '',
    '## JSON',
    '',
    'Mọi lệnh nhận `--json` và in đúng một object ra stdout, kể cả khi lỗi:',
    '',
    '```json',
    '{"schema": 1, "ok": true, "data": {}, "error": null, "next": ["momentry …"]}',
    '```',
    '',
    '`error` khi lỗi: `{"code", "why", "fix"}`. `next` là các lệnh không tương tác nên chạy tiếp.',
    '',
    '## Lệnh',
    '',
  ];
  for (const [name, c] of Object.entries(COMMANDS)) {
    if (c.hidden) continue;
    out.push(`### \`momentry ${name}${c.positionals?.names ? ` ${c.positionals.names}` : ''}\``, '', c.summary, '');
    if (c.aliases?.length) out.push(`Tên khác: ${c.aliases.map((a) => `\`${a}\``).join(', ')}.`, '');
    if (c.changes) out.push(`**Thay đổi:** ${c.changes}`, '');
    if (c.prereq) out.push(`**Cần:** ${c.prereq}`, '');
    const flags = Object.entries(c.flags);
    if (flags.length) {
      out.push('| Cờ | Ý nghĩa |', '|---|---|', ...flags.map(([k, f]) => `| ${flagName(k, f)} | ${cell(f.desc)}${f.default !== undefined ? ` (mặc định: ${f.default})` : ''} |`), '');
    }
    out.push('```sh', ...c.examples, '```', '');
    out.push(`Mã thoát: ${Object.entries(c.exit).map(([k, v]) => `${k} ${v}`).join('; ')}.`, '');
    if (c.next) out.push(`Tiếp theo: ${c.next}`, '');
  }
  return `${out.join('\n').trimEnd()}\n`;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(OUT, renderReference());
  console.log(`đã ghi ${path.relative(ROOT, OUT)}`);
}
