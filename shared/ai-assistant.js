// shared/ai-assistant.js
// Governance AI: per-card interpret + streaming Ask AI.
// Self-contained, no dependencies, no Alpine.
(function () {
  if (window.__ttAI) return;
  window.__ttAI = true;

  var API_BASE = 'https://datewizza-auth.traffictorch.workers.dev';

  function injectStyles() {
    if (document.getElementById('tt-ai-styles')) return;
    var st = document.createElement('style');
    st.id = 'tt-ai-styles';
    st.textContent = [
      '.tt-ai-interp-btn{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;font-size:12px;font-weight:700;border-radius:8px;border:1px solid #fb923c;background:transparent;color:#f97316;cursor:pointer;transition:background .15s,color .15s;}',
      '.tt-ai-interp-btn:hover:not(:disabled){background:#f97316;color:#fff;}',
      '.tt-ai-interp-btn:disabled{opacity:.5;cursor:wait;}',
      '.dark .tt-ai-interp-btn{color:#fb923c;border-color:#fb923c;}',
      '.tt-ai-panel{margin-top:12px;padding:16px 18px;border-radius:12px;background:#fff;border:1px solid #e5e7eb;font-size:14px;line-height:1.6;}',
      '.dark .tt-ai-panel{background:#111827;border-color:#1f2937;color:#e5e7eb;}',
      '.tt-ai-panel h4{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#f97316;margin:0 0 10px;display:flex;align-items:center;gap:6px;}',
      '.tt-ai-panel p{margin:0 0 .8em;}',
      '.tt-ai-panel p:last-of-type{margin-bottom:0;}',
      '.tt-ai-panel .tt-ai-cached{font-size:10px;font-weight:700;color:#6b7280;margin-left:auto;padding:2px 8px;border-radius:9999px;background:#f3f4f6;}',
      '.dark .tt-ai-panel .tt-ai-cached{background:#1f2937;color:#9ca3af;}',
      '.tt-ai-copy{font-size:11px;font-weight:600;color:#6b7280;background:none;border:none;cursor:pointer;padding:0;margin-top:10px;}',
      '.tt-ai-copy:hover{color:#f97316;}',
      '.tt-ai-skeleton{display:block;width:100%;height:12px;background:linear-gradient(90deg,#f3f4f6 0%,#e5e7eb 50%,#f3f4f6 100%);background-size:200% 100%;animation:tt-ai-shimmer 1.4s infinite;border-radius:6px;margin:6px 0;}',
      '.dark .tt-ai-skeleton{background:linear-gradient(90deg,#1f2937 0%,#374151 50%,#1f2937 100%);background-size:200% 100%;}',
      '@keyframes tt-ai-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}',
      '.tt-ai-ask{max-width:720px;width:100%;box-sizing:border-box;margin:0 auto;padding:20px;border-radius:16px;background:#fff;border:1px solid #e5e7eb;}',
      '.dark .tt-ai-ask{background:#111827;border-color:#1f2937;color:#e5e7eb;}',
      '.tt-ai-ask h3{font-size:18px;font-weight:800;margin:0 0 4px;color:#111827;}',
      '.dark .tt-ai-ask h3{color:#f3f4f6;}',
      '.tt-ai-ask .tt-ai-sub{font-size:13px;color:#6b7280;margin:0 0 14px;}',
      '.tt-ai-suggestions{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;}',
      '.tt-ai-suggestion{font-size:11px;font-weight:600;padding:5px 10px;border-radius:9999px;border:1px solid #e5e7eb;background:#f9fafb;color:#6b7280;cursor:pointer;transition:all .15s;}',
      '.tt-ai-suggestion:hover{border-color:#fb923c;color:#f97316;background:#fff7ed;}',
      '.dark .tt-ai-suggestion{background:#1f2937;border-color:#374151;color:#9ca3af;}',
      '.dark .tt-ai-suggestion:hover{border-color:#fb923c;color:#fb923c;background:#7c2d12;}',
      '.tt-ai-input-row{display:flex;gap:8px;max-width:100%;}',
      '.tt-ai-input{flex:1 1 0;min-width:0;box-sizing:border-box;padding:10px 14px;font-size:14px;border:1px solid #e5e7eb;border-radius:10px;outline:none;background:#fff;color:#111827;font-family:inherit;}',
      '.tt-ai-input:focus{border-color:#fb923c;box-shadow:0 0 0 3px rgba(251,146,60,0.15);}',
      '.dark .tt-ai-input{background:#0f172a;border-color:#374151;color:#f3f4f6;}',
      '.tt-ai-submit{flex:0 0 auto;box-sizing:border-box;padding:10px 16px;font-size:13px;font-weight:700;border-radius:10px;border:none;background:linear-gradient(135deg,#f97316,#ec4899);color:#fff;cursor:pointer;white-space:nowrap;}',
      '.tt-ai-submit:disabled{opacity:.5;cursor:wait;}',
      '.tt-ai-answer{margin-top:16px;padding:16px;border-radius:12px;background:#f9fafb;border:1px solid #e5e7eb;font-size:14px;line-height:1.7;white-space:pre-wrap;}',
      '.dark .tt-ai-answer{background:#0f172a;border-color:#1f2937;color:#e5e7eb;}',
      '.tt-ai-answer:empty{display:none;}',
      '.tt-ai-cursor{display:inline-block;width:8px;height:14px;background:#f97316;animation:tt-ai-blink 1s steps(2) infinite;vertical-align:middle;margin-left:2px;}',
      '@keyframes tt-ai-blink{50%{opacity:0}}',
      '.tt-ai-error{margin-top:12px;padding:10px 14px;border-radius:8px;background:#fef2f2;border:1px solid #fecaca;color:#991b1b;font-size:13px;}',
      '.dark .tt-ai-error{background:rgba(153,27,27,0.15);border-color:#7f1d1d;color:#fca5a5;}',
      '@media (max-width:640px){.tt-ai-input-row{flex-direction:column;gap:10px;}.tt-ai-input{font-size:16px;width:100%;}.tt-ai-ask{padding:16px;}.tt-ai-submit{width:100%;padding:12px 16px;}}'
    ].join('\n');
    document.head.appendChild(st);
  }

  injectStyles();

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function ensurePanel(btn, id) {
    var panel = document.getElementById(id);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = id;
      panel.className = 'tt-ai-panel';
      panel.style.display = 'none';
      btn.parentElement.insertAdjacentElement('afterend', panel);
    }
    return panel;
  }

  function renderPanel(panel, summary, cached) {
    var safe = escapeHtml(summary).replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br>');
    panel.innerHTML =
      '<h4>🤖 Interpretation ' + (cached ? '<span class="tt-ai-cached">cached</span>' : '') + '</h4>' +
      '<p>' + safe + '</p>' +
      '<button type="button" class="tt-ai-copy">📋 Copy</button>';
    var copyBtn = panel.querySelector('.tt-ai-copy');
    copyBtn.addEventListener('click', function () {
      navigator.clipboard.writeText(summary).then(function () {
        copyBtn.textContent = '✓ Copied';
        setTimeout(function () { copyBtn.textContent = '📋 Copy'; }, 2000);
      });
    });
  }

  function renderError(panel, msg) {
    panel.innerHTML = '<h4>⚠️ Error</h4><div class="tt-ai-error">' + escapeHtml(msg) + '</div>';
  }

  function showLoading(panel, label) {
    panel.innerHTML =
      '<h4>🤖 ' + escapeHtml(label) + '</h4>' +
      '<div class="tt-ai-skeleton"></div>' +
      '<div class="tt-ai-skeleton" style="width:92%;"></div>' +
      '<div class="tt-ai-skeleton" style="width:78%;"></div>';
  }

  async function ttInterpretProposal(proposal, btn) {
    var panelId = 'tt-ai-panel-' + (proposal.id || proposal.proposal_id || 'x' + Math.random().toString(36).slice(2, 8));
    var panel = ensurePanel(btn, panelId);

    if (panel.style.display !== 'none') {
      panel.style.display = 'none';
      return;
    }

    panel.style.display = '';
    showLoading(panel, 'Interpreting proposal…');

    var origText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Interpreting…';

    try {
      var payload = {
        proposal_id: proposal.id || proposal.proposal_id,
        title: proposal.title || '',
        description: proposal.description || proposal.body_md || '',
        category: proposal.category || '',
        phase: proposal.phase || proposal.status || '',
        votes_for: proposal.votes_for || proposal.yes_count || 0,
        votes_against: proposal.votes_against || proposal.no_count || 0,
        votes_abstain: proposal.votes_abstain || proposal.abstain_count || 0,
        quorum_pct: proposal.quorum_pct,
        threshold_pct: proposal.threshold_pct,
        block_pct: proposal.block_pct,
        objections: proposal.objections || [],
        resolution_summary: proposal.resolution_summary || '',
        is_meta: proposal.is_meta || proposal.category === 'constitution' || proposal.category === 'meta'
      };

      var res = await fetch(API_BASE + '/api/public/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system: 'governance-proposal', payload: payload })
      });
      var data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Interpret failed');
      renderPanel(panel, data.summary, data.cached);
    } catch (e) {
      renderError(panel, 'Could not interpret: ' + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = origText;
    }
  }

  async function ttInterpretSim(sim, btn) {
    var panelId = 'tt-ai-sim-panel';
    var panel = ensurePanel(btn, panelId);

    if (panel.style.display !== 'none') {
      panel.style.display = 'none';
      return;
    }

    panel.style.display = '';
    showLoading(panel, 'Interpreting simulation…');

    var origText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Interpreting…';

    try {
      var res = await fetch(API_BASE + '/api/public/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system: 'governance-sim', payload: sim })
      });
      var data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Interpret failed');
      renderPanel(panel, data.summary, data.cached);
    } catch (e) {
      renderError(panel, 'Could not interpret: ' + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = origText;
    }
  }

  function mountAskAI(selector, opts) {
    opts = opts || {};
    var root = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!root) return;

    var suggestions = opts.suggestions || [
      'How does quorum work?',
      'What happens if a proposal fails?',
      'Can a resolution be reconsidered?',
      'How do objections get resolved?'
    ];

    var sugHtml = suggestions.map(function (s) {
      return '<button type="button" class="tt-ai-suggestion" data-q="' + escapeHtml(s) + '">' + escapeHtml(s) + '</button>';
    }).join('');

    root.innerHTML =
      '<div class="tt-ai-ask">' +
        '<h3>🤖 Ask about governance</h3>' +
        '<p class="tt-ai-sub">Questions about the Round Table rules, quorum, voting, or proposals.</p>' +
        '<div class="tt-ai-suggestions">' + sugHtml + '</div>' +
        '<form class="tt-ai-form">' +
          '<div class="tt-ai-input-row">' +
            '<input type="text" class="tt-ai-input" placeholder="Ask a question…" maxlength="500" autocomplete="off">' +
            '<button type="submit" class="tt-ai-submit">Ask →</button>' +
          '</div>' +
        '</form>' +
        '<div class="tt-ai-answer"></div>' +
        '<div class="tt-ai-error" style="display:none;"></div>' +
      '</div>';

    var form = root.querySelector('.tt-ai-form');
    var input = root.querySelector('.tt-ai-input');
    var submit = root.querySelector('.tt-ai-submit');
    var answer = root.querySelector('.tt-ai-answer');
    var errorBox = root.querySelector('.tt-ai-error');
    var suggestionBtns = root.querySelectorAll('.tt-ai-suggestion');

    suggestionBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        input.value = b.getAttribute('data-q');
        form.requestSubmit();
      });
    });

    var streaming = false;

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (streaming) return;
      var question = input.value.trim();
      if (!question) return;

      streaming = true;
      submit.disabled = true;
      submit.textContent = '…';
      answer.textContent = '';
      errorBox.style.display = 'none';

      var fullText = '';
      var cursor = document.createElement('span');
      cursor.className = 'tt-ai-cursor';
      answer.appendChild(cursor);

      try {
        var res = await fetch(API_BASE + '/api/public/ask-governance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: question })
        });
        if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);

        var reader = res.body.getReader();
        var decoder = new TextDecoder();
        var buffer = '';

        while (true) {
          var r = await reader.read();
          if (r.done) break;
          buffer += decoder.decode(r.value, { stream: true });
          var idx;
          while ((idx = buffer.indexOf('\n\n')) >= 0) {
            var raw = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            if (raw.indexOf('data: ') !== 0) continue;
            var payload = raw.slice(6).trim();
            if (payload === '[DONE]' || !payload) continue;
            try {
              var json = JSON.parse(payload);
              if (json.error) throw new Error(json.error);
              var delta = json.choices && json.choices[0] && json.choices[0].delta && json.choices[0].delta.content;
              var chunk = delta || json.response || '';
              if (chunk) {
                fullText += chunk;
                cursor.remove();
                answer.textContent = fullText;
                answer.appendChild(cursor);
              }
            } catch (pe) {
              if (pe.message && pe.message.indexOf('Unexpected') !== 0) throw pe;
            }
          }
        }
        cursor.remove();
      } catch (err) {
        cursor.remove();
        errorBox.textContent = 'Error: ' + err.message;
        errorBox.style.display = '';
      } finally {
        streaming = false;
        submit.disabled = false;
        submit.textContent = 'Ask →';
      }
    });
  }

  window.ttInterpretProposal = ttInterpretProposal;
  window.ttInterpretSim = ttInterpretSim;
  window.mountAskAI = mountAskAI;
})();
