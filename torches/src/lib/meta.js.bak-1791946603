import { htmlEscape } from './escape.js';

const SITE = 'https://traffictorch.net';
const FALLBACK_OG = `${SITE}/images/traffic-torch-toolkit.webp`;

export function buildProfileMeta(profile, username) {
  const display = profile.display_name || username;
  const title = `${display} (@${username}) · Traffic Torch`;
  const description = (profile.bio && profile.bio.trim())
    || `${display} on Traffic Torch — shared SEO, UX and AEO audits, network and points.`;
  const canonical = `${SITE}/torcher/${username}/`;
  const ogImage = `${SITE}/og/profile/${username}.png`;
  return { title, description, canonical, ogImage, display, username };
}

export function renderHeadTags(meta, { index = true, type = 'profile' } = {}) {
  const t = htmlEscape(meta.title);
  const d = htmlEscape(meta.description);
  const c = htmlEscape(meta.canonical);
  const img = htmlEscape(meta.ogImage);
  return [
    `<title>${t}</title>`,
    `<meta name="description" content="${d}">`,
    `<link rel="canonical" href="${c}">`,
    `<meta name="robots" content="${index ? 'index, follow, max-image-preview:large' : 'noindex, follow'}">`,
    `<meta property="og:type" content="${type}">`,
    `<meta property="og:title" content="${t}">`,
    `<meta property="og:description" content="${d}">`,
    `<meta property="og:url" content="${c}">`,
    `<meta property="og:image" content="${img}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:site_name" content="Traffic Torch">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${t}">`,
    `<meta name="twitter:description" content="${d}">`,
    `<meta name="twitter:image" content="${img}">`,
    `<meta name="twitter:site" content="@Guitaralize">`,
  ].join('\n  ');
}

export function buildTorchMeta(post, author, id) {
  const display = author.display_name || author.username;
  const domain = post.domain_mode === 'hidden'
    ? (post.domain_label || 'Hidden site')
    : (post.url ? new URL(post.url).hostname.replace(/^www\./, '') : 'Unknown');
  const titleText = (post.page_title && post.page_title.trim()) || post.domain_label || domain;
  const title = `${titleText} — ${post.score}/100 · Torch by @${author.username}`;
  const description = `@${author.username} scored ${post.score}/100 with the ${post.tool} audit on ${domain}.${post.note ? ' ' + post.note.slice(0, 120) : ''}`;
  const canonical = `https://traffictorch.net/torch/${id}/`;
  const ogImage = `https://traffictorch.net/og/torch/${id}.png`;
  return { title, description, canonical, ogImage, domain, titleText, display };
}

export function buildCommunityMeta(tool) {
  const toolLabel = tool ? tool.replace(/-tool$/, '').replace(/-/g, ' ') : null;
  const title = toolLabel
    ? `${toolLabel} Torches — Community Audit Scores · Traffic Torch`
    : 'Community Torches — Every Audit Score · Traffic Torch';
  const description = toolLabel
    ? `Every ${toolLabel} audit shared by the Traffic Torch community, ranked and filterable.`
    : 'Browse every audit shared by the Traffic Torch community. SEO, UX, and AEO scores from real websites, ranked by score.';
  const canonical = `https://traffictorch.net/community/`;
  const ogImage = 'https://traffictorch.net/images/traffic-torch-toolkit.webp';
  return { title, description, canonical, ogImage };
}
