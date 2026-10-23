// Traffic Torch — torches-page-render

import { htmlHeaders, xmlHeaders, textHeaders, pngHeaders } from './lib/cache.js';
import { handleProfile as handleProfileReal } from './handlers/profile.js';
import { handleTorch as handleTorchReal, TORCH_PAGE_JS } from './handlers/torch.js';
import { handleCommunity as handleCommunityReal } from './handlers/community.js';
import { handleToolFeed as handleToolFeedReal } from './handlers/toolFeed.js';
import { handleSitemapIndex as handleSitemapIndexReal, handleSitemap as handleSitemapReal } from './handlers/sitemap.js';
import { handleLlms as handleLlmsReal } from './handlers/llms.js';
import { handleGlobalRss as handleGlobalRssReal, handleUserRss as handleUserRssReal, handleToolRss as handleToolRssReal } from './handlers/rss.js';
import { handleOgTorch as handleOgTorchReal, handleOgProfile as handleOgProfileReal, handleOgDiscussion as handleOgDiscussionReal } from './handlers/og.js';
import { handlePurge as handlePurgeReal } from './handlers/purge.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/__render' || path === '/__render/') {
        return new Response(JSON.stringify({
          ok: true,
          worker: 'torches-page-render',
          time: new Date().toISOString(),
        }), { headers: { 'Content-Type': 'application/json' } });
      }

      if (path === '/api/internal/purge') return handlePurgeReal(request, env);
      if (path === '/llms.txt') return handleLlmsReal(request, env);
      if (path === '/sitemap.xml') return handleSitemapIndexReal(request, env);
      if (path === '/sitemap-static.xml') return handleSitemapReal(request, env, 'static');
      if (path === '/sitemap-profiles.xml') return handleSitemapReal(request, env, 'profiles');
      if (path === '/sitemap-torches.xml') return handleSitemapReal(request, env, 'torches');

      if (path === '/torches/feed.xml') return handleGlobalRssReal(request, env);
      if (/^\/torcher\/[^/]+\/feed\.xml$/.test(path)) return handleUserRssReal(request, env);
      if (/^\/tools\/[^/]+\/torches\/feed\.xml$/.test(path)) return handleToolRssReal(request, env);

      if (path.startsWith('/og/torch/')) return handleOgTorchReal(request, env);
      if (path.startsWith('/og/profile/')) return handleOgProfileReal(request, env);
      if (path.startsWith('/og/discussion/')) return handleOgDiscussionReal(request, env);
      if (path === '/torch-page.js') return new Response(TORCH_PAGE_JS, { headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });


      if (path.startsWith('/torcher/')) return handleProfileReal(request, env);
      if (path.startsWith('/torch/')) return handleTorchReal(request, env);
      if (/^\/community\/?$/.test(path)) return handleCommunityReal(request, env);
      if (/^\/tools\/[^/]+\/torches\/?$/.test(path)) return handleToolFeedReal(request, env);
      if (path.startsWith('/tools/')) return fetch(request);

      return new Response('Not found', { status: 404 });
    } catch (err) {
      console.error('[torches-page-render] error:', err.message, err.stack);
      return new Response(`Render error: ${err.message}`, {
        status: 500,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  },

  async scheduled(event, env, ctx) {
    try {
      const res = await fetch('https://traffic-torch-auth.traffictorch.workers.dev/api/internal/cleanup-messages', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + env.PURGE_SECRET },
      });
      const body = await res.text();
      console.log('[cron/cleanup-messages]', res.status, body);
    } catch (err) {
      console.error('[cron/cleanup-messages] error:', err.message);
    }
  },
};