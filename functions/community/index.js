// functions/community/index.js
// Cloudflare Pages Function — SSR for /community/.
// Injects DiscussionForumPosting schema (real counts) + <noscript> feed
// so non-JS crawlers (ChatGPT-User, ClaudeBot, PerplexityBot, CCBot) see content.
// Cache 60s at edge. Any error → next() → original HTML. Users never break.

const API_BASE = 'https://datewizza-auth.traffictorch.workers.dev';
const POSTS_TO_PRERENDER = 10;
const CACHE_SECONDS = 60;

export async function onRequestGet(context) {
  const { request, next } = context;
  const url = new URL(request.url);

  if (url.pathname !== '/community/' && url.pathname !== '/community') {
    return next();
  }

  try {
    const [htmlRes, postsRes] = await Promise.all([
      next(),
      fetch(`${API_BASE}/api/feed?limit=${POSTS_TO_PRERENDER}`)
    ]);

    if (!htmlRes.ok) return next();
    const html = await htmlRes.text();

    let posts = [];
    if (postsRes.ok) {
      try {
        const data = await postsRes.json();
        posts = data.posts || [];
      } catch { /* not JSON, leave posts empty */ }
    }

    const injected = injectCommunityContent(html, posts);

    return new Response(injected, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=300`,
        'X-Community-SSR': '1'
      }
    });
  } catch (e) {
    return next();
  }
}

function injectCommunityContent(html, posts) {
  if (!posts.length) return html;

  const schema = {
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    "@id": "https://datewizza.com/community/#forum",
    "headline": "DateWizza Community Feed",
    "url": "https://datewizza.com/community/",
    "inLanguage": "en",
    "isPartOf": { "@id": "https://datewizza.com/community/#webpage" },
    "interactionStatistic": posts.map(p => ({
      "@type": "InteractionCounter",
      "interactionType": "https://schema.org/CommentAction",
      "userInteractionCount": p.comment_count || 0
    })),
    "hasPart": posts.map(p => ({
      "@type": "DiscussionForumPosting",
      "headline": (p.title || p.page_title || 'Post').slice(0, 110),
      "url": `https://datewizza.com/torch/${p.id}/`,
      "dateCreated": new Date(p.created_at).toISOString(),
      "author": {
        "@type": "Person",
        "name": p.display_name || p.username || 'Member',
        ...(p.username ? { "url": `https://datewizza.com/torcher/${p.username}/` } : {})
      },
      "interactionStatistic": {
        "@type": "InteractionCounter",
        "interactionType": "https://schema.org/CommentAction",
        "userInteractionCount": p.comment_count || 0
      }
    }))
  };

  const schemaTag = `<script type="application/ld+json">${JSON.stringify(schema)}</script>`;

  const items = posts.map(p => {
    const title = escapeHtml(p.title || p.page_title || 'Post');
    const author = escapeHtml(p.display_name || p.username || 'Member');
    const type = p.post_type || 'post';
    const cat = p.category || '';
    const date = new Date(p.created_at).toLocaleDateString('en-AU', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
    const url = `/torch/${p.id}/`;
    const body = escapeHtml((p.body_md || p.note || '').slice(0, 280));
    const meta = `${type}${cat ? ' · ' + cat : ''} by ${author} · ${date}`;
    return `<li><a href="${url}"><strong>${title}</strong></a> — ${meta}${body ? '<p>' + body + '…</p>' : ''}</li>`;
  }).join('');

  const noscript = `<noscript id="ssr-feed"><h2>Latest Community Posts</h2><ul>${items}</ul></noscript>`;

  let result = html;
  if (result.includes('</head>')) {
    result = result.replace('</head>', schemaTag + '\n</head>');
  }
  if (result.includes('</main>')) {
    result = result.replace('</main>', noscript + '\n</main>');
  }
  return result;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}
