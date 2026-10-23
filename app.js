// app.js – Final clean version for Google Trends module (Dec 2025)

// Show/hide modules – keep this function
function showModule(id) {
  document.querySelectorAll('.module').forEach(el => el.classList.add('hidden'));
  const module = document.getElementById(id);
  if (module) module.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' }); // nice UX
}

// Single unified click handler – no duplicates
document.addEventListener('click', async (e) => {
  const link = e.target.closest('[data-module="google-trends"]');
  if (link) {
    e.preventDefault();
    showModule('google-trends');

    // Load module only once, dynamically (best practice for GitHub Pages)
    const module = await import('./modules/google-trends.js');
    module.initGoogleTrends();
  }
});

// Support direct URL like ?module=google-trends
if (new URLSearchParams(window.location.search).get('module') === 'google-trends') {
  showModule('google-trends');
  import('./modules/google-trends.js').then(m => m.initGoogleTrends());
}

// Force preventDefault on all forms (debug for reload bug)
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('form').forEach(form => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      e.stopImmediatePropagation(); // Stops other listeners
      console.log('Form submit blocked – no reload'); // Check F12 console
    });
  });
});