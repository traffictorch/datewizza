export const TOOL_DISPLAY = {
  'nusa-tool': 'NUSA',
  'keyword-tool': 'Keyword Placement',
  'keyword-research-tool': 'Keyword Research',
  'ofux-tool': 'OFUX',
  'lighthouse-plus-tool': 'Lighthouse Plus',
  'topical-authority-audit-tool': 'Topical Authority',
  'seo-entity-extractor-tool': 'Entity Extractor',
  'seo-ux-tool': 'SEO + UX',
  'local-seo-tool': 'Local SEO',
  'seo-intent-tool': 'SEO Intent',
  'product-seo-tool': 'Product SEO',
  'aeo-performance-tool': 'AEO Performance',
  'ai-search-optimization-tool': 'AI Search',
  'ai-voice-search-tool': 'Voice Search',
  'ai-audit-tool': 'AI Content',
  'quit-risk-tool': 'Quit Risk',
  'schema-generator': 'Schema Generator',
};

export const TOOL_PATH = {
  'nusa-tool': '/',
  'keyword-tool': '/keyword-tool/',
  'keyword-research-tool': '/keyword-research-tool/',
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
  'quit-risk-tool': '/quit-risk-tool/',
  'schema-generator': '/schema-generator/',
};

export const ALL_TOOLS = Object.keys(TOOL_DISPLAY);

export const toolDisplay = (key) =>
  TOOL_DISPLAY[key] || (key || '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const toolRunUrl = (tool, url) =>
  tool && url ? `${TOOL_PATH[tool] || '/'}?url=${encodeURIComponent(url)}` : '#';
