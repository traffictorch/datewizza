import { fetchProfile } from '../lib/api.js';
import { getShell } from '../lib/shell.js';
import { buildProfileMeta, renderHeadTags } from '../lib/meta.js';
import { profileJsonLd, jsonLdScript } from '../lib/jsonld.js';
import { htmlHeaders, CACHE } from '../lib/cache.js';

function injectShell(html, { headTags, jsonLd, profile }) {
  let out = html;

  // Strip existing <title>, meta description, canonical, robots to avoid dupes
  out = out.replace(/<title>[^<]*<\/title>/i, '');
  out = out.replace(/<meta\s+name="description"[^>]*>/gi, '');
  out = out.replace(/<link\s+rel="canonical"[^>]*>/gi, '');
  out = out.replace(/<meta\s+name="robots"[^>]*>/gi, '');

  // Inject before </head>
  const block = `\n${headTags}\n${jsonLd}\n</head>`;
  if (out.includes('</head>')) out = out.replace('</head>', block);
  else out = out.replace('<body', `${block}\n<body`); // fallback

  // Inject public profile data for client scripts (Send Message button, etc.)
  // Only safe public fields — never email, tokens, or private settings.
  if (profile && profile.id) {
    const safe = {
      id: profile.id,
      username: profile.username || null,
      display_name: profile.display_name || null,
      avatar_preset: profile.avatar_preset || 'owner',
      avatar_url: profile.avatar_url || null,
      role: profile.role || null,
      message_policy: profile.message_policy || 'all',
      messages_blocked: profile.messages_blocked || 0,
    };
    // Escape </script> sequences just in case (JSON.stringify won't add them,
    // but user-controlled display_name could theoretically contain one)
    const json = JSON.stringify(safe).replace(/</g, '\\u003c');
    const injection = `<script>window.__ttProfile=${json};</script>\n</body>`;
    if (out.includes('</body>')) out = out.replace('</body>', injection);
    else out += injection;
  }

  return out;
}

export async function handleProfile(request, env) {
  const username = new URL(request.url).pathname
    .replace('/torcher/', '')
    .replace(/\/$/, '');

  if (!username || username.includes('/')) {
    return new Response('Not found', { status: 404, headers: htmlHeaders('public, s-maxage=60') });
  }

  let data;
  try {
    data = await fetchProfile(env, username);
  } catch (err) {
    if (err.status === 404) {
      const shell = await getShell(env, '/profile.html');
      const notFound = shell
        .replace(/<title>[^<]*<\/title>/i, '<title>Profile not found · DateWizza</title>')
        .replace(/<link\s+rel="canonical"[^>]*>/gi, '')
        .replace('</head>', `<meta name="robots" content="noindex, follow">\n</head>`);
      return new Response(notFound, { status: 404, headers: htmlHeaders('public, s-maxage=60') });
    }
    throw err;
  }

  const profile = data.profile || {};
  const posts = data.posts || [];

  const meta = buildProfileMeta(profile, username);
  const jsonLd = jsonLdScript(profileJsonLd(profile, username));

  // Thin-content rule: no posts, no bio, no socials → noindex
  const isThin = posts.length === 0
    && !profile.bio
    && !profile.website_url
    && !profile.social1_url
    && !profile.social2_url;

  const headTags = renderHeadTags(meta, { index: !isThin, type: 'profile' });

  const shell = await getShell(env, '/profile.html');
  const html = injectShell(shell, { headTags, jsonLd, profile });

  return new Response(html, { status: 200, headers: htmlHeaders(CACHE.profile) });
}
