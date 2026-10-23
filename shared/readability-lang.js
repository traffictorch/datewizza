// /shared/readability-lang.js
// Language-aware syllable counting + Flesch-like formulas.
// Auto-detects language from text so callers don't need to pass it.
// Mirrors the scoring logic in quit-risk-tool/modules/readability.js.

const SYLLABLE_COUNTERS = {
  en: (w) => {
    w = String(w).toLowerCase();
    if (w.length <= 3) return 1;
    w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
    w = w.replace(/^y/, '');
    return (w.match(/[aeiouy]{1,2}/g) || []).length;
  },
  de: (w) => Math.max(1, (String(w).toLowerCase().replace(/[^a-zäöüß]/g, '').match(/[aeiouäöüy]+/g) || []).length),
  es: (w) => Math.max(1, (String(w).toLowerCase().match(/[aeiouáéíóúü]+/g) || []).length),
  it: (w) => Math.max(1, (String(w).toLowerCase().match(/[aeiouàèéìòù]+/g) || []).length),
  fr: (w) => {
    w = String(w).toLowerCase().replace(/[^a-zàâäéèêëîïôöùûüÿç]/g, '');
    if (!w) return 1;
    w = w.replace(/e$/, '');
    return Math.max(1, (w.match(/[aeiouyàâäéèêëîïôöùûü]+/g) || []).length);
  },
  nl: (w) => {
    w = String(w).toLowerCase().replace(/[^a-z]/g, '');
    if (!w) return 1;
    w = w.replace(/ij/g, 'y');
    return Math.max(1, (w.match(/[aeiouy]+/g) || []).length);
  },
  ru: (w) => Math.max(1, (String(w).toLowerCase().match(/[аеёиоуыэюя]/g) || []).length)
};

export function normalizeLang(lang) {
  if (!lang) return 'und';
  return String(lang).trim().toLowerCase().split(/[-_]/)[0] || 'und';
}

// Stopword fingerprint sampling — no deps, ~5KB of text is enough.
export function detectLang(text) {
  const sample = String(text || '').toLowerCase().slice(0, 5000);
  if (!sample) return 'und';

  const checks = [
    { lang: 'de', re: /\b(der|die|das|und|oder|nicht|eine?n?|sind|wird|auch|mit|für|auf|sich|von|ist|im|dem|des)\b/g },
    { lang: 'fr', re: /\b(le|la|les|des|une?|et|ou|est|sont|pas|dans|pour|avec|sur|par|que|qui|vous|nous)\b/g },
    { lang: 'es', re: /\b(el|la|los|las|un|una|y|o|es|son|no|en|para|con|por|que|del|se|al)\b/g },
    { lang: 'it', re: /\b(il|lo|la|gli|le|un|una|e|o|è|sono|non|in|per|con|che|del|si|al)\b/g },
    { lang: 'nl', re: /\b(de|het|een|en|of|is|zijn|niet|in|voor|met|op|van|dat|die|je)\b/g }
  ];

  let best = { lang: 'en', count: 0 };
  for (const c of checks) {
    const m = sample.match(c.re);
    const count = m ? m.length : 0;
    if (count > best.count) best = { lang: c.lang, count };
  }
  // Cyrillic → Russian
  if (/[\u0400-\u04FF]/.test(sample)) {
    const count = (sample.match(/[\u0400-\u04FF]/g) || []).length;
    if (count > best.count) best = { lang: 'ru', count };
  }
  // 5+ stopword hits = confident; otherwise assume English
  return best.count >= 5 ? best.lang : 'en';
}

export function countSyllables(text, lang) {
  const L = normalizeLang(lang || detectLang(text));
  const counter = SYLLABLE_COUNTERS[L] || SYLLABLE_COUNTERS.en;
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  let n = 0;
  for (const w of words) n += counter(w);
  return n;
}

// Returns { ease, formula, measured }. ease is null when no trusted formula.
export function fleschLike(avgSentenceLength, avgSyllablesPerWord, lang) {
  const L = normalizeLang(lang);
  const s = avgSentenceLength, w = avgSyllablesPerWord;

  if (L === 'en') return { ease: 206.835 - 1.015 * s - 84.6 * w, formula: 'Flesch', measured: true };
  if (L === 'de') return { ease: 180 - s - 58.5 * w,             formula: 'Amstad', measured: true };
  if (L === 'es') return { ease: 206.84 - 60 * w - 102 / Math.max(s, 1), formula: 'Fernández-Huerta', measured: true };
  if (L === 'fr') return { ease: 207 - 1.015 * s - 73.6 * w,     formula: 'Kandel-Moles', measured: true };
  if (L === 'it') return { ease: 217 - 1.3 * s - 0.6 * w * 100,  formula: 'Flesch-Vacca', measured: true };
  if (L === 'nl') return { ease: 206.84 - 0.93 * s - 77 * w,     formula: 'Douma', measured: true };
  if (L === 'ru') return { ease: 206.835 - 1.3 * s - 60.1 * w,   formula: 'Oborneva', measured: true };

  return { ease: null, formula: null, measured: false };
}