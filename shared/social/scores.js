// shared/social/scores.js
// Parsing helpers for the raw JSON columns returned by the API.
// All tolerant of null / bad data — return [] or {} instead of throwing.

export function parseModuleScores(raw) {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) return parsed.filter(x => x && typeof x.score === 'number');
    if (parsed && typeof parsed === 'object') {
      return Object.keys(parsed).map(k => ({ name: k, score: parsed[k] }));
    }
    return [];
  } catch { return []; }
}

export function moduleScoreClass(s) {
  return s >= 80 ? 'bg-green-500' : s >= 60 ? 'bg-yellow-500' : 'bg-red-500';
}

export function parseImages(raw) {
  if (!raw) return [];
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(arr) ? arr.filter(x => x && x.url) : [];
  } catch { return []; }
}

export function parseWorkflowMeta(raw) {
  if (!raw) return null;
  try {
    const m = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return m && typeof m === 'object' ? m : null;
  } catch { return null; }
}

const WF_CHIP_ORDER = [
  'ai_models', 'ai_tools', 'cloud', 'ide', 'hardware',
  'databases', 'devops', 'terminal', 'os', 'other_tools'
];

export function wfTopChips(meta, limit = 6) {
  if (!meta) return [];
  const out = [];
  for (const k of WF_CHIP_ORDER) {
    const arr = meta[k];
    if (Array.isArray(arr)) for (const v of arr) {
      if (out.length < limit) out.push(v);
    }
  }
  return out;
}
