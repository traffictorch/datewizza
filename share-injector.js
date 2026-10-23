// share-injector.js – runs after OFUX audit, creates share dashboard

export function injectShareModule() {
  // Wait for the audit to complete (cards + summaries)
  const checkInterval = setInterval(() => {
    const aiContainer = document.getElementById('homepage-ai-container');
    const summaries = window._homepageSummaries;
    if (aiContainer && summaries && summaries.length === 3) {
      clearInterval(checkInterval);
      createShareModule(aiContainer, summaries);
    }
  }, 500);

  // Fallback: if not triggered within 30s, stop
  setTimeout(() => clearInterval(checkInterval), 30000);
}

async function createShareModule(aiContainer, summaries) {
  // Remove any previous container
  document.getElementById('share-module-container')?.remove();

  const container = document.createElement('div');
  container.id = 'share-module-container';
  aiContainer.insertAdjacentElement('afterend', container);

  const overall = Math.round((summaries[0].score + summaries[1].score + summaries[2].score) / 3);
  const data = {
    toolName: 'OFUX Report',
    url: window._homepageUrl,
    pageTitle: document.title || window._homepageUrl,
    overallScore: overall,
    moduleScores: [
      { name: 'UX Health', score: summaries[0].score },
      { name: 'SEO Intent', score: summaries[1].score },
      { name: 'AI Search', score: summaries[2].score }
    ],
    passedMetrics: [...summaries[0].passed, ...summaries[1].passed, ...summaries[2].passed],
    failedMetrics: [...summaries[0].failed, ...summaries[1].failed, ...summaries[2].failed],
    rawData: { ux: summaries[0], seo: summaries[1], ai: summaries[2] }
  };

  try {
    const module = await import('/share-module.js');
    module.initShareModule(container, data);
    console.log('[Injector] Share module created successfully');
  } catch (err) {
    console.error('[Injector] Failed to load share-module.js:', err);
    container.innerHTML = `<div style="color:red;padding:1rem;">Share module failed to load: ${err.message}</div>`;
  }
}