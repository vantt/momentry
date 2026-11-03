// JSON extraction from model output (PRD 5.5, DM.4).

/** Cuts from the first `{` to the last `}` and parses. Throws on failure. @param {string} text @returns {any} */
export function extractJson(text) {
  if (typeof text !== 'string') throw new Error('đầu ra model không phải chuỗi');
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('đầu ra model không có JSON object');
  try {
    return JSON.parse(text.slice(a, b + 1));
  } catch (e) {
    throw new Error(`JSON hỏng (${e.name})`); // V8 messages quote the input
  }
}
