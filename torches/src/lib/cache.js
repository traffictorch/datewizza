export const CACHE = {
  profile:    'public, s-maxage=600,  stale-while-revalidate=86400',
  torch:      'public, s-maxage=3600, stale-while-revalidate=86400',
  torchHidden:'public, s-maxage=60,   stale-while-revalidate=600',
  community:  'public, s-maxage=120,  stale-while-revalidate=600',
  toolFeed:   'public, s-maxage=600,  stale-while-revalidate=3600',
  sitemap:    'public, s-maxage=3600, stale-while-revalidate=86400',
  rss:        'public, s-maxage=300,  stale-while-revalidate=600',
  og:         'public, max-age=31536000, immutable',
  llms:       'public, s-maxage=3600',
};

const base = (ct, cache) => ({
  'Content-Type': ct,
  'Cache-Control': cache,
  'X-Content-Type-Options': 'nosniff',
});

export const htmlHeaders = (cache) => base('text/html; charset=utf-8', cache);
export const xmlHeaders  = (cache) => base('application/xml; charset=utf-8', cache);
export const textHeaders = (cache) => base('text/plain; charset=utf-8', cache);
export const pngHeaders  = (cache) => base('image/png', cache);
export const jsonHeaders = (cache) => base('application/json; charset=utf-8', cache);
