// Vietnamese text helpers (PRD 6.6, 6.7).

const TONE = { '́': 's', '̀': 'f', '̉': 'r', '̃': 'x', '̣': 'j' };
const SHAPE = { '̆': 'w', '̛': 'w' }; // breve (ă), horn (ơ ư)
const CIRCUMFLEX = '̂';                     // â ê ô -> aa ee oo
const WORD_RE = /[\p{L}\p{M}\p{N}]+/gu;

/** Unicode NFC. @param {string} s @returns {string} */
export function nfc(s) {
  return String(s ?? '').normalize('NFC');
}

/** Drops combining marks and maps đ/Đ -> d/D: "xét nghiệm" -> "xet nghiem". @param {string} s @returns {string} */
export function stripDiacritics(s) {
  return nfc(s).normalize('NFD').replace(/\p{M}+/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').normalize('NFC');
}

function telexWord(word) {
  let out = '';
  let tone = '';
  for (const ch of word.normalize('NFD')) {
    if (TONE[ch]) tone = TONE[ch];
    else if (ch === CIRCUMFLEX) out += out.slice(-1);
    else if (SHAPE[ch]) out += SHAPE[ch];
    else if (ch === 'đ' || ch === 'Đ') out += ch === 'đ' ? 'dd' : 'DD';
    else if (/\p{M}/u.test(ch)) continue;
    else out += ch;
  }
  return out + tone;
}

/**
 * Telex typing form, tone mark at end of syllable: "xét nghiệm" -> "xets nghieemj" (PRD 6.7).
 * @param {string} s @returns {string}
 */
export function toTelex(s) {
  return nfc(s).replace(WORD_RE, telexWord);
}

/**
 * File slug from a title: no diacritics, lowercase, hyphens, at most `maxWords` words, [a-z0-9-] only.
 * Empty result falls back to "chuyen".
 * @param {string} title @param {number} [maxWords=6] @returns {string}
 */
export function slugify(title, maxWords = 6) {
  const words = stripDiacritics(title).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return words.slice(0, Math.max(1, maxWords)).join('-') || 'chuyen';
}
