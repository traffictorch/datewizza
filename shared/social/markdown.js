// shared/social/markdown.js
// Pure Markdown rendering + video/post embed wrapping.
// Depends on window.markdownit being loaded — degrades gracefully if not.
// No API calls, no DOM writes.

/** YouTube / Vimeo / TikTok / X — return embed URL or null. */
export function youtubeEmbedSrc(url) {
  try {
    const u = new URL(url);
    const h = u.hostname.replace(/^www\./, '');
    if (h === 'youtu.be') { const id = u.pathname.slice(1).split('/')[0]; return id ? 'https://www.youtube-nocookie.com/embed/' + id : null; }
    if (h === 'youtube.com' || h === 'm.youtube.com') {
      if (u.pathname === '/watch') { const v = u.searchParams.get('v'); return v ? 'https://www.youtube-nocookie.com/embed/' + v : null; }
      const m = u.pathname.match(/^\/(?:embed|shorts|v)\/([^/?]+)/);
      if (m) return 'https://www.youtube-nocookie.com/embed/' + m[1];
    }
  } catch { /* fall through */ }
  return null;
}

export function vimeoEmbedSrc(url) {
  try {
    const u = new URL(url);
    const h = u.hostname.replace(/^www\./, '');
    if (h === 'vimeo.com' || h === 'player.vimeo.com') {
      const m = u.pathname.match(/^\/(?:video\/)?(\d+)/);
      if (m) return 'https://player.vimeo.com/video/' + m[1];
    }
  } catch { /* fall through */ }
  return null;
}

export function tiktokEmbedSrc(url) {
  try {
    const u = new URL(url);
    const h = u.hostname.replace(/^www\./, '');
    if (h === 'tiktok.com' || h === 'm.tiktok.com') {
      let m = u.pathname.match(/^\/@[^/]+\/video\/(\d+)/);
      if (m) return 'https://www.tiktok.com/embed/v2/' + m[1];
      m = u.pathname.match(/^\/embed\/v?2?\/(\d+)/);
      if (m) return 'https://www.tiktok.com/embed/v2/' + m[1];
      m = u.pathname.match(/^\/v\/(\d+)/);
      if (m) return 'https://www.tiktok.com/embed/v2/' + m[1];
    }
  } catch { /* fall through */ }
  return null;
}

export function twitterEmbedSrc(url) {
  try {
    const u = new URL(url);
    const h = u.hostname.replace(/^www\./, '').replace(/^mobile\./, '');
    if (h === 'twitter.com' || h === 'x.com') {
      const m = u.pathname.match(/^\/[^/]+\/status\/(\d+)/) || u.pathname.match(/^\/i\/web\/status\/(\d+)/);
      if (m) return 'https://platform.twitter.com/embed/Tweet.html?id=' + m[1];
    }
  } catch { /* fall through */ }
  return null;
}

/** Wrap an embed URL in the responsive iframe div. */
export function embedFrame(src, title = 'Embedded media') {
  return '<div class="md-embed"><iframe src="' + src + '" title="' + title +
    '" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>';
}

/** Replace bare video/social links inside rendered HTML with embeds. */
export function embedifyHtml(html) {
  try {
    return html.replace(/<a href="([^"]+)"[^>]*>[^<]*<\/a>/g, (match, url) => {
      try {
        const yt = youtubeEmbedSrc(url);   if (yt) return embedFrame(yt, 'YouTube video');
        const vm = vimeoEmbedSrc(url);     if (vm) return embedFrame(vm, 'Vimeo video');
        const tt = tiktokEmbedSrc(url);    if (tt) return embedFrame(tt, 'TikTok video');
        const tw = twitterEmbedSrc(url);   if (tw) return embedFrame(tw, 'X post');
      } catch { /* fall through */ }
      return match;
    });
  } catch (e) {
    console.warn('[markdown] embedify failed:', e);
    return html;
  }
}

let _md = null;
function getMd() {
  if (_md) return _md;
  if (typeof window === 'undefined' || !window.markdownit) return null;
  _md = window.markdownit({
    html: false,
    linkify: true,
    breaks: true,
    typographer: false,
    highlight(str, lang) {
      if (lang && window.hljs && window.hljs.getLanguage(lang)) {
        try {
          return '<pre class="hljs"><code>' +
            window.hljs.highlight(str, { language: lang, ignoreIllegals: true }).value +
            '</code></pre>';
        } catch { /* fall through */ }
      }
      return '<pre class="hljs"><code>' + _md.utils.escapeHtml(str) + '</code></pre>';
    }
  });
  const defaultLink = _md.renderer.rules.link_open || function (tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options);
  };
  _md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
    tokens[idx].attrSet('target', '_blank');
    tokens[idx].attrSet('rel', 'nofollow ugc noopener');
    return defaultLink(tokens, idx, options, env, self);
  };
  return _md;
}

export function renderMarkdown(text) {
  if (!text) return '';
  const raw = String(text);
  const md = getMd();
  if (!md) {
    // Fallback — safe plain text with newlines preserved.
    const esc = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return '<p style="white-space:pre-wrap;margin:0;">' + esc + '</p>';
  }
  let html = md.render(raw);
  try { html = embedifyHtml(html); } catch { /* keep raw */ }
  return html;
}

/** Strip markdown syntax and truncate — for plain-text previews. */
export function plainExcerpt(text, max = 600) {
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
    .replace(/^\s*>\s+/gm, '');
  const s = stripped.trim();
  return s.length <= max ? s : s.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

export function shouldCollapse(text, max = 600) {
  return !!text && String(text).length > max;
}
