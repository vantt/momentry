// Surgical edits of other tools' JSON config files (~/.claude/settings.json, ~/.codex/hooks.json):
// refuse malformed files, back up first, keep the file mode and indentation, write atomically,
// and abort if the file changed between our read and our write.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { CliError } from './cli-output.mjs';
import { writeAtomic } from './install.mjs';

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

/**
 * @param {string} file
 * @returns {{exists: boolean, text: string, digest: string|null, data: Record<string, any>, indent: string|number}}
 */
export function readJsonFile(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) {
    if (e.code === 'ENOENT') return { exists: false, text: '', digest: null, data: {}, indent: 2 };
    throw new CliError(`không đọc được ${file}: ${e.message}`);
  }
  if (!text.trim()) return { exists: true, text, digest: sha256(text), data: {}, indent: 2 };
  let data;
  try { data = JSON.parse(text); } catch (e) {
    throw new CliError(`${file} không phải JSON hợp lệ (${e.message}); momentry không sửa file hỏng`, { code: 'host-config-malformed', fix: `sửa tay ${file}, rồi chạy lại` });
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new CliError(`${file} không phải object JSON; momentry không sửa`, { code: 'host-config-malformed', fix: `sửa tay ${file}, rồi chạy lại` });
  }
  const m = /\n([ \t]+)"/.exec(text);
  return { exists: true, text, digest: sha256(text), data, indent: m ? m[1] : 2 };
}

// millisecond + pid precision: two edits in the same second never share (and overwrite) a backup name
const stamp = () => `${new Date().toISOString().replace(/[-:]/g, '').replace('.', '')}-${process.pid}`;

/** Copies `file` next to itself under a unique backup name; returns that name. */
function backUp(file) {
  const backup = `${file}.momentry-bak-${stamp()}`;
  fs.copyFileSync(file, backup);
  return backup;
}

/** Edits go to the symlink target, so a dotfile-managed settings.json stays a link to the managed copy. */
const target = (file) => { try { return fs.realpathSync(file); } catch { return file; } };

/**
 * Writes `data` back if the file still has the digest we read. Backs up an existing file first.
 * @param {string} file @param {Record<string, any>} data
 * @param {{digest: string|null, indent: string|number}} read what readJsonFile returned
 * @returns {{backup: string|null}}
 */
export function writeJsonFile(link, data, read) {
  const file = target(link);
  let now = null;
  try { now = sha256(fs.readFileSync(file, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (now !== read.digest) {
    throw new CliError(`${file} vừa bị chương trình khác sửa trong lúc momentry đang làm; không ghi`, { code: 'host-config-changed', fix: 'chạy lại lệnh' });
  }
  const backup = now !== null ? backUp(file) : null;
  const mode = now !== null ? fs.statSync(file).mode & 0o777 : 0o600;
  writeAtomic(file, `${JSON.stringify(data, null, read.indent)}\n`, mode);
  return { backup };
}

/** Writes a text file we own (marker-checked by the caller), backing up a previous version. */
export function writeOwnedText(link, text) {
  const file = target(link);
  const backup = fs.existsSync(file) ? backUp(file) : null;
  writeAtomic(file, text, 0o644);
  return { backup };
}
