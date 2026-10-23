import { textHeaders, CACHE } from '../lib/cache.js';

const SITE = 'https://datewizza.com';

const TOOLS = [
  ['NUSA — full SEO + UX + AEO audit', '/'],
  ['OFUX Tool', '/ofux-tool/'],
  ['Lighthouse Plus', '/lighthouse-plus-tool/'],
  ['AEO Performance Tool', '/aeo-performance-tool/'],
  ['SEO Intent Tool', '/seo-intent-tool/'],
  ['SEO + UX Tool', '/seo-ux-tool/'],
  ['Local SEO Tool', '/local-seo-tool/'],
  ['Product SEO Tool', '/product-seo-tool/'],
  ['Entity Extractor', '/seo-entity-extractor-tool/'],
  ['Topical Authority Audit Tool', '/topical-authority-audit-tool/'],
  ['Schema Generator', '/schema-generator/'],
  ['AI Search Optimization Tool', '/ai-search-optimization-tool/'],
  ['AI Voice Search Tool', '/ai-voice-search-tool/'],
  ['AI Content Audit Tool', '/ai-audit-tool/'],
  ['Quit Risk Tool', '/quit-risk-tool/'],
  ['Keyword Research Tool', '/keyword-research-tool/'],
  ['Keyword Placement Tool', '/keyword-tool/'],
];

export async function handleLlms(request, env) {
  const tools = TOOLS.map(([name, path]) => `- [${name}](${SITE}${path})`).join('\n');

  const body = `# DateWizza

> DateWizza is a free, privacy-first SEO, UX, and AEO audit toolkit. It runs 17 different audit tools against any URL and produces a 0–100 score with a per-module breakdown.

## Tools
${tools}

## Community
- [Community torches](${SITE}/community/): every audit shared by the community, ranked by score
- [Leaderboard](${SITE}/leader-board/): top-scoring sites across all tools
- [Top contributors](${SITE}/leader-board/#contributors): community members earning points

## Content
- [Blog](${SITE}/blog/): SEO, GEO, AEO, and AI search guides
- [Developer API](${SITE}/integrations/developer/api/): programmatic access to all audit tools

## Notes
- All audit results are opt-in public. Users choose whether to share a torch and whether to reveal the domain.
- Scores are 0–100. Each tool has its own scoring modules.
- No account required to run an audit. Free tier: 3 audits per day.

## Contact
- Website: ${SITE}/
- Support: support@datewizza.com
`;

  return new Response(body, { headers: textHeaders(CACHE.llms) });
}
