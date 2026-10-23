import { ImageResponse } from 'workers-og';
import { fetchTorch, fetchProfile } from '../lib/api.js';
import { pngHeaders, CACHE } from '../lib/cache.js';
import { bgFrame, brandRow, scoreBadge, truncate, COLORS, scoreColor } from '../lib/og-template.js';

const FALLBACK = 'https://traffictorch.net/images/traffic-torch-toolkit.webp';

function el(type, style, children) {
  return { type, props: { style, children } };
}

function torchCard(post, author) {
  const score = Number(post.score) || 0;
  const color = scoreColor(score);
  const domain = post.domain_mode === 'hidden'
    ? (post.domain_label || 'Hidden site')
    : (post.url ? new URL(post.url).hostname.replace(/^www\./, '') : 'Unknown');
  const titleText = truncate(
    (post.page_title && post.page_title.trim()) || domain,
    72
  );
  const note = post.note ? truncate(post.note, 130) : '';
  const authorName = author.display_name || author.username;

  return bgFrame([
    brandRow(),
    el('div', { display: 'flex', flex: 1, alignItems: 'center', gap: '56px', marginTop: '48px' }, [
      scoreBadge(score),
      el('div', { display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }, [
        el('div', {
          fontSize: '16px',
          fontWeight: 800,
          color: color,
          letterSpacing: '2px',
          textTransform: 'uppercase',
          marginBottom: '16px',
        }, `${post.tool || 'Audit'} · ${domain}`),
        el('div', {
          fontSize: '48px',
          fontWeight: 900,
          lineHeight: 1.15,
          letterSpacing: '-1.5px',
          marginBottom: '20px',
        }, titleText),
        note ? el('div', {
          fontSize: '22px',
          color: COLORS.dim,
          lineHeight: 1.4,
        }, note) : null,
      ].filter(Boolean)),
    ]),
    // Footer author chip
    el('div', {
      display: 'flex',
      alignItems: 'center',
      gap: '14px',
      marginTop: 'auto',
      paddingTop: '32px',
      borderTop: `2px solid ${COLORS.orange}33`,
    }, [
      el('div', {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '44px', height: '44px',
        borderRadius: '44px',
        background: `linear-gradient(135deg, ${COLORS.orange}, ${COLORS.pink})`,
        fontSize: '20px',
        fontWeight: 900,
      }, (authorName || '?').slice(0, 1).toUpperCase()),
      el('div', { display: 'flex', flexDirection: 'column' }, [
        el('div', { fontSize: '20px', fontWeight: 700 }, authorName),
        el('div', { fontSize: '14px', color: COLORS.dim }, `@${author.username}${author.total_points ? ' · ' + author.total_points + ' pts' : ''}`),
      ]),
    ]),
  ], { accent: color });
}

function profileCard(profile, username) {
  const display = profile.display_name || username;
  const initials = display.slice(0, 1).toUpperCase();
  const bio = truncate(profile.bio || 'Member of the Traffic Torch community.', 140);
  const points = profile.total_points || 0;
  const networkCount = profile.network_count || 0;

  return bgFrame([
    brandRow(),
    el('div', {
      display: 'flex',
      flex: 1,
      alignItems: 'center',
      gap: '56px',
      marginTop: '48px',
    }, [
      el('div', {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '220px', height: '220px',
        borderRadius: '220px',
        background: `linear-gradient(135deg, ${COLORS.orange}, ${COLORS.pink})`,
        fontSize: '110px',
        fontWeight: 900,
        flexShrink: 0,
      }, initials),
      el('div', { display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }, [
        el('div', {
          fontSize: '20px',
          fontWeight: 700,
          color: COLORS.orange,
          letterSpacing: '1px',
          marginBottom: '10px',
        }, `@${username}`),
        el('div', {
          fontSize: '64px',
          fontWeight: 900,
          lineHeight: 1.05,
          letterSpacing: '-2px',
          marginBottom: '20px',
        }, truncate(display, 32)),
        el('div', {
          fontSize: '22px',
          color: COLORS.dim,
          lineHeight: 1.35,
        }, bio),
      ]),
    ]),
    el('div', {
      display: 'flex',
      gap: '32px',
      marginTop: 'auto',
      paddingTop: '28px',
      borderTop: `2px solid ${COLORS.orange}33`,
    }, [
      el('div', { display: 'flex', flexDirection: 'column' }, [
        el('div', { fontSize: '36px', fontWeight: 900, color: COLORS.orange }, String(points)),
        el('div', { fontSize: '14px', color: COLORS.dim, letterSpacing: '1px', textTransform: 'uppercase' }, 'Points'),
      ]),
      el('div', { display: 'flex', flexDirection: 'column' }, [
        el('div', { fontSize: '36px', fontWeight: 900, color: COLORS.orange }, String(networkCount)),
        el('div', { fontSize: '14px', color: COLORS.dim, letterSpacing: '1px', textTransform: 'uppercase' }, 'Network'),
      ]),
      profile.role ? el('div', { display: 'flex', flexDirection: 'column' }, [
        el('div', { fontSize: '24px', fontWeight: 800, color: COLORS.text, textTransform: 'capitalize' }, String(profile.role)),
        el('div', { fontSize: '14px', color: COLORS.dim, letterSpacing: '1px', textTransform: 'uppercase' }, 'Role'),
      ]) : null,
    ].filter(Boolean)),
  ]);
}

export async function handleOgTorch(request, env) {
  const path = new URL(request.url).pathname;
  const idRaw = path.replace('/og/torch/', '').replace('.png', '').replace(/\/$/, '');
  const id = parseInt(idRaw, 10);

  if (!id) return Response.redirect(FALLBACK, 302);

  try {
    const data = await fetchTorch(env, id);
    return new ImageResponse(torchCard(data.post, data.author), {
      width: 1200,
      height: 630,
      headers: pngHeaders(CACHE.og),
    });
  } catch (err) {
    console.error('OG torch failed:', err.message);
    return Response.redirect(FALLBACK, 302);
  }
}

export async function handleOgProfile(request, env) {
  const path = new URL(request.url).pathname;
  const username = decodeURIComponent(path.replace('/og/profile/', '').replace('.png', '').replace(/\/$/, ''));

  if (!username) return Response.redirect(FALLBACK, 302);

  try {
    const data = await fetchProfile(env, username);
    const profile = { ...data.profile, network_count: data.network_count || 0 };
    return new ImageResponse(profileCard(profile, username), {
      width: 1200,
      height: 630,
      headers: pngHeaders(CACHE.og),
    });
  } catch (err) {
    console.error('OG profile failed:', err.message);
    return Response.redirect(FALLBACK, 302);
  }
}
