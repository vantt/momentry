// Story vocabulary shared by prompts, validators and the UI: tension types and harvest signals (lib/rules/story-vocab.json).
// One list, so a prompt never offers a tension the validator rejects. The file ships with the code; a broken one is
// a broken install, so it fails loudly instead of falling back.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The shipped vocabulary file. */
export const VOCAB_FILE = fileURLToPath(new URL('./rules/story-vocab.json', import.meta.url));

/**
 * @typedef {{id: string, label: string, label_en: string|null, description: string}} Tension
 * @typedef {{id: string, label: string, description: string}} Signal
 * @typedef {{tensions: Tension[], signals: Signal[]}} Vocab
 */

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => typeof v === 'string' && v.trim() !== '' && !/[\r\n]/.test(v);

/**
 * Problems in a parsed vocabulary, each naming the entry. Ids are a-z0-9_, unique per list; `none` (no tension) must
 * be a tension; texts are one line.
 * @param {any} raw @returns {string[]}
 */
export function checkVocab(raw) {
  if (!isObj(raw)) return ['story-vocab phải là JSON object'];
  const errs = [];
  if (raw.version !== 1) errs.push(`version phải là 1, nhận ${JSON.stringify(raw.version)}`);
  const lists = { tensions: ['id', 'label', 'label_en', 'description'], signals: ['id', 'label', 'description'] };
  for (const [name, keys] of Object.entries(lists)) {
    const xs = raw[name];
    if (!Array.isArray(xs) || !xs.length) { errs.push(`${name} phải là mảng không rỗng`); continue; }
    const seen = new Set();
    xs.forEach((x, i) => {
      const where = `${name}[${i}]${isObj(x) && typeof x.id === 'string' ? ` ${x.id}` : ''}`;
      if (!isObj(x)) return errs.push(`${where}: phải là object`);
      if (typeof x.id !== 'string' || !/^[a-z][a-z0-9_]*$/.test(x.id)) errs.push(`${where}: id phải dạng a-z0-9_`);
      else if (seen.has(x.id)) errs.push(`${where}: id lặp`);
      seen.add(x.id);
      for (const k of ['label', 'description']) if (!str(x[k])) errs.push(`${where}: thiếu ${k} (một dòng)`);
      if (name === 'tensions' && x.label_en !== null && !str(x.label_en)) errs.push(`${where}: label_en phải là một dòng hoặc null`);
      const extra = Object.keys(x).filter((k) => !keys.includes(k));
      if (extra.length) errs.push(`${where}: khoá lạ ${extra.join(', ')}`);
    });
    if (name === 'tensions' && !seen.has('none')) errs.push('tensions: thiếu none');
  }
  return errs;
}

/** Reads and checks a vocabulary file; throws naming every problem. @param {string} [file] @returns {Vocab} */
export function loadVocab(file = VOCAB_FILE) {
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { throw new Error(`không đọc được từ vựng chuyện ${file}: ${e.message}`); }
  const errs = checkVocab(raw);
  if (errs.length) throw new Error(`từ vựng chuyện ${file} sai: ${errs.join('; ')}`);
  return { tensions: raw.tensions, signals: raw.signals };
}

/** The shipped vocabulary. */
export const VOCAB = Object.freeze(loadVocab());

/** Tension ids, `none` included. */
export const TENSION_IDS = Object.freeze(VOCAB.tensions.map((t) => t.id));

/**
 * Prompt text of the lists: `{tensions}` one "- id: description" line each, `{signals}` one numbered
 * "n. Label: description" line each.
 * @param {Vocab} [v] @returns {{tensions: string, signals: string}}
 */
export function promptLists(v = VOCAB) {
  return {
    tensions: v.tensions.map((t) => `- ${t.id}: ${t.description}`).join('\n'),
    signals: v.signals.map((s, i) => `${i + 1}. ${s.label}: ${s.description}`).join('\n'),
  };
}
