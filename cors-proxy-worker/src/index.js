import puppeteer from '@cloudflare/puppeteer';

// cors-proxy.datewizza.workers.dev – UPDATED WITH BROWSER RENDERING (Dec 2025)
export default {
  async fetch(request, env) {  // Note: added env for browser binding
    const url = new URL(request.url);
    let targetUrl = url.searchParams.get('url') || url.searchParams.get('__url');
    if (!targetUrl) {
      return new Response('Add ?url= or ?__url= with the target', { status: 400 });
    }
    targetUrl = decodeURIComponent(targetUrl);
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      return new Response('Invalid URL', { status: 400 });
    }

    // New: Dedicated rendering endpoint (/render?url=...) for JS-heavy sites
    if (url.pathname === '/render') {
      try {
        const browser = await puppeteer.launch(env.BROWSER);
        const page = await browser.newPage();

        // Anti-bot: Realistic headers/viewport
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36');
        await page.setViewport({ width: 1920, height: 1080 });

        await page.goto(targetUrl, { waitUntil: 'networkidle0', timeout: 15000 });

        const renderedHtml = await page.content();

        await browser.close();

        return new Response(renderedHtml, {
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Expose-Headers': '*',
            'Content-Type': 'text/html; charset=utf-8',
            'X-Rendered-By': 'Cloudflare-Browser'
          }
        });
      } catch (error) {
        return new Response(`Render failed: ${error.message}`, { status: 500 });
      }
    }

    // Existing: Your full CORS proxy logic (unchanged – works for / or /proxy)
    const newHeaders = new Headers(request.headers);
    newHeaders.delete('Origin'); // Key fix for GTmetrix/etc.

    const modifiedRequest = new Request(targetUrl, {
      method: request.method,
      headers: newHeaders,
      body: request.body,
      redirect: 'follow'
    });

    const response = await fetch(modifiedRequest);

    const corsHeaders = new Headers(response.headers);
    corsHeaders.set('Access-Control-Allow-Origin', '*');
    corsHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    corsHeaders.set('Access-Control-Allow-Headers', '*');
    corsHeaders.set('Access-Control-Expose-Headers', '*');

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: corsHeaders
    });
  }
};