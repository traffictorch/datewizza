import { htmlEscape } from './escape.js';

const SITE = 'https://datewizza.com';
const FALLBACK_OG = `${SITE}/images/traffic-torch-toolkit.webp`;

function stripMarkdown(text, max) {
  if (!text) return '';
  const stripped = String(text)
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/```[\s\S]*?```/g, '[code]')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^\s*>\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  return max ? (stripped.length <= max ? stripped : stripped.slice(0, max).replace(/\s+\S*$/, '') + '…') : stripped;
}

export function buildProfileMeta(profile, username) {
  const display = profile.display_name || username;
  const title = `${display} (@${username}) · DateWizza`;
  const description = (profile.bio && profile.bio.trim())
    || `${display} on DateWizza — shared SEO, UX and AEO audits, network and points.`;
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
    `<meta property="og:site_name" content="DateWizza">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${t}">`,
    `<meta name="twitter:description" content="${d}">`,
    `<meta name="twitter:image" content="${img}">`,
    `<meta name="twitter:site" content="@Guitaralize">`,
  ].join('\n  ');
}

export function buildTorchMeta(post, author, id) {
  const display = author.display_name || author.username;

  if (post.post_type === 'workflow') {
    let wf = null;
    try { wf = post.workflow_meta ? (typeof post.workflow_meta === 'string' ? JSON.parse(post.workflow_meta) : post.workflow_meta) : null; } catch (e) {}
    const titleText = (post.title && post.title.trim()) || ('Workflow #' + id);
    const version = (wf && wf.version) ? (' ' + wf.version) : '';
    const title = titleText + version + ' — Workflow by @' + author.username + ' · DateWizza';
    const summary = (wf && wf.summary) ? wf.summary : stripMarkdown(post.body_md || post.note || '', 155);
    const chips = [];
    if (wf) {
      ['ai_models','ai_tools','cloud','ide','hardware','databases'].forEach(function (k) { if (Array.isArray(wf[k])) chips.push.apply(chips, wf[k]); });
    }
    const description = (summary || ('Workflow shared by @' + author.username + ' on DateWizza.')) + (chips.length ? ' · Stack: ' + chips.slice(0, 6).join(', ') : '');
    const canonical = 'https://datewizza.com/torch/' + id + '/';
    const ogImage = 'https://datewizza.com/og/discussion/' + id + '.png';
    return { title, description, canonical, ogImage, titleText, display };
  }

  if (post.post_type === 'discussion') {
    const titleText = (post.title && post.title.trim()) || ('Discussion #' + id);
    const title = titleText + ' — Discussion by @' + author.username + ' · DateWizza';
    const bodyText = stripMarkdown(post.body_md || post.note || '', 155);
    const description = bodyText || ('Discussion started by @' + author.username + ' on DateWizza.');
    const canonical = 'https://datewizza.com/torch/' + id + '/';
    const ogImage = 'https://datewizza.com/og/discussion/' + id + '.png';
    return { title, description, canonical, ogImage, titleText, display };
  }

  const domain = post.domain_mode === 'hidden'
    ? (post.domain_label || 'Hidden site')
    : (post.url ? new URL(post.url).hostname.replace(/^www\./, '') : 'Unknown');
  const titleText = (post.page_title && post.page_title.trim()) || post.domain_label || domain;
  const title = titleText + ' — ' + post.score + '/100 · Torch by @' + author.username;
  const description = '@' + author.username + ' scored ' + post.score + '/100 with the ' + post.tool + ' audit on ' + domain + '.' + (post.note ? ' ' + post.note.slice(0, 120) : '');
  const canonical = 'https://datewizza.com/torch/' + id + '/';
  const ogImage = 'https://datewizza.com/og/torch/' + id + '.png';
  return { title, description, canonical, ogImage, domain, titleText, display };
}

export function buildCommunityMeta(tool) {
  const toolLabel = tool ? tool.replace(/-tool$/, '').replace(/-/g, ' ') : null;
  const title = toolLabel
    ? `${toolLabel} Torches — Community Audit Scores · DateWizza`
    : 'Community Torches — Every Audit Score · DateWizza';
  const description = toolLabel
    ? `Every ${toolLabel} audit shared by the DateWizza community, ranked and filterable.`
    : 'Browse every audit shared by the DateWizza community. SEO, UX, and AEO scores from real websites, ranked by score.';
  const canonical = `https://datewizza.com/community/`;
  const ogImage = 'https://datewizza.com/images/traffic-torch-toolkit.webp';
  return { title, description, canonical, ogImage };
}
