// shared/social/tools.js
// Canonical tool names + paths. Change here, both community and dashboard update.

const TOOL_NAMES = {
  'keyword-tool': 'Keyword Placement Tool',
  'nusa-tool': 'NUSA Tool',
  'ofux-tool': 'OFUX Tool',
  'lighthouse-plus-tool': 'Lighthouse Plus',
  'topical-authority-audit-tool': 'Topical Authority Audit Tool',
  'seo-entity-extractor-tool': 'Entity Extractor',
  'seo-ux-tool': 'SEO + UX Tool',
  'local-seo-tool': 'Local SEO Tool',
  'seo-intent-tool': 'SEO Intent Tool',
  'product-seo-tool': 'Product SEO Tool',
  'aeo-performance-tool': 'AEO Performance Tool',
  'ai-search-optimization-tool': 'AEO / AI Search Tool',
  'ai-voice-search-tool': 'AI Voice Search Tool',
  'ai-audit-tool': 'AI Content Audit Tool',
  'quit-risk-tool': 'Quit Risk Tool'
};

const TOOL_PATHS = {
  'keyword-tool': '/keyword-tool/',
  'nusa-tool': '/',
  'ofux-tool': '/ofux-tool/',
  'lighthouse-plus-tool': '/lighthouse-plus-tool/',
  'topical-authority-audit-tool': '/topical-authority-audit-tool/',
  'seo-entity-extractor-tool': '/seo-entity-extractor-tool/',
  'seo-ux-tool': '/seo-ux-tool/',
  'local-seo-tool': '/local-seo-tool/',
  'seo-intent-tool': '/seo-intent-tool/',
  'product-seo-tool': '/product-seo-tool/',
  'aeo-performance-tool': '/aeo-performance-tool/',
  'ai-search-optimization-tool': '/ai-search-optimization-tool/',
  'ai-voice-search-tool': '/ai-voice-search-tool/',
  'ai-audit-tool': '/ai-audit-tool/',
  'quit-risk-tool': '/quit-risk-tool/'
};

export function toolDisplayName(key) {
  if (!key) return 'Audit';
  return TOOL_NAMES[key] || key.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function toolPath(key) {
  return TOOL_PATHS[key] || '/';
}

export function toolRunUrl(key, testedUrl) {
  if (!key || !testedUrl) return '#';
  return toolPath(key) + '?url=' + encodeURIComponent(testedUrl);
}
