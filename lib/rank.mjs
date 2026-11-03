// Ranking (PRD 5.9). No threshold; only order changes.

const num = (v) => (Number.isInteger(v) ? v : null);

/**
 * Sort key (ascending): [tension ≠ none ? 0 : 1, -(stakes × strength), -hits, -date]. Missing fields sort last
 * (tension missing -> 2; product/hits/date missing -> +Infinity).
 * @param {{id: string, data: Record<string, any>}} story @returns {(number|string)[]}
 */
export function rankKey(story) {
  const d = story?.data || {};
  const tension = typeof d.tension === 'string' && d.tension ? (d.tension === 'none' ? 1 : 0) : 2;
  const st = num(d.stakes), sg = num(d.strength);
  const product = st === null || sg === null ? Infinity : -(st * sg);
  const hits = num(d.hits) === null ? Infinity : -d.hits;
  const t = typeof d.date === 'string' ? Date.parse(d.date) : NaN;
  return [tension, product, hits, Number.isNaN(t) ? Infinity : -t];
}

/** New array, best first; nothing dropped; ties by id. @template {{id: string, data: Record<string, any>}} T @param {T[]} stories @returns {T[]} */
export function sortRanked(stories) {
  const keyed = stories.map((s) => [rankKey(s), s]);
  keyed.sort(([a, x], [b, y]) => {
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
    }
    return String(x.id).localeCompare(String(y.id));
  });
  return keyed.map(([, s]) => s);
}
