// Prompt templates in ../prompts/*.md with `{name}` placeholders (PRD 7.1, DM.4).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promptLists } from './vocab.mjs';

/** Absolute path of the prompts dir. */
export const PROMPTS_DIR = fileURLToPath(new URL('../prompts/', import.meta.url));

const NAMES = ['harvest', 'harvest-fill', 'cluster', 'hook-tension', 'stakes', 'outsider', 'bip', 'angle', 'profile'];
const PLACEHOLDER = /\{([a-z][a-z_]*)\}/g;
const LEADING_COMMENT = /^\s*<!--[\s\S]*?-->[ \t]*\r?\n?/;

/** Template text without leading `<!-- ... -->` notes. @param {string} name @returns {string} */
function template(name) {
  if (!NAMES.includes(name)) throw new Error(`prompt lạ: ${name}`);
  let t = fs.readFileSync(path.join(PROMPTS_DIR, `${name}.md`), 'utf8');
  while (LEADING_COMMENT.test(t)) t = t.replace(LEADING_COMMENT, '');
  return t.replace(/\s+$/, '');
}

/** `{tensions}` and `{signals}`: the shared story vocabulary (lib/rules/story-vocab.json), the same in every prompt. */
const LISTS = promptLists();

/**
 * Reads `prompts/<name>.md` and fills `{var}` placeholders in one pass (values are never re-scanned).
 * `{tensions}` and `{signals}` come from the story vocabulary unless `vars` sets them.
 * Throws if a placeholder in the file has no value.
 * @param {'harvest'|'harvest-fill'|'cluster'|'hook-tension'|'stakes'|'outsider'|'bip'|'angle'|'profile'} name
 * @param {Record<string, string|number>} vars @returns {string}
 */
export function render(name, vars) {
  vars = { ...LISTS, ...vars };
  const t = template(name);
  const missing = [...new Set([...t.matchAll(PLACEHOLDER)].map(m => m[1]).filter(k => vars?.[k] == null))];
  if (missing.length) throw new Error(`prompt ${name} thiếu giá trị: ${missing.join(', ')}`);
  return t.replace(PLACEHOLDER, (_, k) => String(vars[k]));
}
