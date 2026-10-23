export const onRequest = () => {
  const customRobots = `User-agent: *
Allow: /

Sitemap: https://datewizza.com/sitemap.xml`;

  return new Response(customRobots, {
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'public, max-age=3600'  // cache for 1 hour
    }
  });
};