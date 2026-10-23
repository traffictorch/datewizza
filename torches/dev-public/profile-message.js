// DateWizza — Send Message button on /torcher/:username/
// Uses native <dialog> + showModal() so the popup always centers on the viewport.
(function () {
  const API = 'https://datewizza-auth.traffictorch.workers.dev';

  const getToken = () => localStorage.getItem('authToken');
  const decodeJwt = t => {
    try { return JSON.parse(atob(t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))); }
    catch { return null; }
  };
  const esc = s => String(s ?? '').replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));

  function ensureDialogStyle() {
    if (document.getElementById('tt-dialog-style')) return;
    const st = document.createElement('style');
    st.id = 'tt-dialog-style';
    st.textContent = `
      dialog#tt-compose-modal {
        border:none; padding:0; background:transparent;
        max-width:none; max-height:none;
        inset: 0; margin: auto;
        width: fit-content; height: fit-content;
      }
      dialog#tt-compose-modal::backdrop { background:rgba(0,0,0,0.6); backdrop-filter:blur(4px); }
      dialog#tt-compose-modal .tt-card { animation: tt-dlg-in 0.18s ease-out; }
      @keyframes tt-dlg-in { from { opacity:0; transform:translateY(8px) scale(0.98); } to { opacity:1; transform:none; } }
    `;
    document.head.appendChild(st);
  }

  function toast(text, ok = true) {
    const el = document.createElement('div');
    el.style.cssText = `position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
      background:${ok ? '#111827' : '#ef4444'};color:#fff;padding:12px 20px;border-radius:12px;
      z-index:2147483647;font-size:14px;font-family:system-ui,sans-serif;
      box-shadow:0 10px 30px rgba(0,0,0,0.3);`;
    el.textContent = text;
    document.documentElement.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  function buildModal(recipient) {
    const dark = document.documentElement.classList.contains('dark');
    const bg = dark ? '#111827' : '#ffffff';
    const fg = dark ? '#f3f4f6' : '#111827';
    const inputBg = dark ? '#1f2937' : '#ffffff';
    const inputBd = dark ? '#4b5563' : '#d1d5db';

    ensureDialogStyle();

    const dlg = document.createElement('dialog');
    dlg.id = 'tt-compose-modal';
    dlg.setAttribute('aria-label', 'Send message');

    const card = document.createElement('div');
    card.className = 'tt-card';
    card.style.cssText = `background:${bg};color:${fg};width:min(520px, calc(100vw - 32px));
      border-radius:16px;padding:24px;box-sizing:border-box;
      box-shadow:0 20px 50px rgba(0,0,0,0.35);font-family:inherit;`;
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h3 style="margin:0;font-size:18px;font-weight:700;">
          Message ${esc(recipient.display_name || recipient.username)}
        </h3>
        <button type="button" data-tt-close style="background:none;border:none;font-size:26px;
                cursor:pointer;color:${fg};line-height:1;padding:0 4px;">&times;</button>
      </div>
      <textarea data-tt-body maxlength="6000" rows="6" placeholder="Write a message…"
        style="width:100%;box-sizing:border-box;padding:12px;border-radius:10px;
               border:1px solid ${inputBd};background:${inputBg};color:${fg};
               font-family:inherit;font-size:14px;resize:vertical;outline:none;"></textarea>
      <div data-tt-attachments style="margin:8px 0;"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin:6px 0 16px;font-size:12px;color:#9ca3af;">
        <label style="cursor:pointer;padding:4px 8px;border-radius:6px;border:1px solid ${inputBd};color:${fg};">
          📎 Attach<input data-tt-file type="file" style="display:none;" accept="image/*,application/pdf,.txt,.md,.csv,.html,.htm,.css,.js,.mjs,.json,.xml,.svg,.zip">
        </label>
        <span><span data-tt-count>0</span> / 2000</span>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button type="button" data-tt-cancel
          style="padding:10px 20px;border-radius:10px;border:1px solid ${inputBd};
                 background:transparent;color:${fg};cursor:pointer;font-weight:600;">Cancel</button>
        <button type="button" data-tt-send
          style="padding:10px 24px;border-radius:10px;border:none;
                 background:linear-gradient(135deg,#f97316,#ec4899);color:#fff;
                 font-weight:700;cursor:pointer;">Send</button>
      </div>
      <p data-tt-error style="color:#ef4444;font-size:13px;margin:12px 0 0;"></p>`;
    dlg.appendChild(card);
    return dlg;
  }

  function wireModal(dlg, recipient) {
    const body = dlg.querySelector('[data-tt-body]');
    const count = dlg.querySelector('[data-tt-count]');
    const send = dlg.querySelector('[data-tt-send]');
    const cancel = dlg.querySelector('[data-tt-cancel]');
    const close = dlg.querySelector('[data-tt-close]');
    const err = dlg.querySelector('[data-tt-error]');
    const fileInput = dlg.querySelector('[data-tt-file]');
    const attachWrap = dlg.querySelector('[data-tt-attachments]');
    const uploads = [];

    body.addEventListener('input', () => { count.textContent = body.value.length; });

    function renderAttachments() {
      attachWrap.innerHTML = uploads.map((a, i) =>
        `<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0;">
          <span>📎 ${esc(a.filename)}</span>
          <button type="button" data-tt-rm="${i}" style="background:none;border:none;color:#ef4444;cursor:pointer;font-family:inherit;">×</button>
        </div>`
      ).join('');
      attachWrap.querySelectorAll('[data-tt-rm]').forEach(b => b.addEventListener('click', () => {
        uploads.splice(parseInt(b.getAttribute('data-tt-rm')), 1);
        renderAttachments();
      }));
    }

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { err.textContent = 'Max 5 MB'; return; }
      if (uploads.length >= 3) { err.textContent = 'Max 3 files'; return; }
      const fd = new FormData(); fd.append('file', file);
      try {
        const r = await fetch(`${API}/api/messages/upload`, {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + getToken() },
          body: fd
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Upload failed');
        uploads.push(d);
        renderAttachments();
        err.textContent = '';
      } catch (e) { err.textContent = e.message; }
    });

    const dismiss = () => {
      try { dlg.close(); } catch {}
      dlg.remove();
    };

    dlg.addEventListener('cancel', (e) => { e.preventDefault(); dismiss(); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dismiss(); });

    cancel.addEventListener('click', dismiss);
    close.addEventListener('click', dismiss);

    send.addEventListener('click', async () => {
      const text = body.value.trim();
      if (!text) { err.textContent = 'Message cannot be empty'; return; }
      send.disabled = true;
      const orig = send.textContent;
      send.textContent = 'Sending…';
      err.textContent = '';
      try {
        const r = await fetch(`${API}/api/messages/send`, {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + getToken(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ to_user_id: recipient.id, body: text, attachment_keys: uploads.map(a => a.key) })
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Send failed');
        dismiss();
        toast('Message sent ✓');
      } catch (e) {
        err.textContent = e.message;
        send.disabled = false;
        send.textContent = orig;
      }
    });

    requestAnimationFrame(() => body.focus());
  }

  function findActionAnchor() {
    const nodes = document.querySelectorAll('a, button');
    for (const el of nodes) {
      const t = (el.textContent || '').trim().toLowerCase();
      if (t.includes('in your network')) return el;
      if (t.includes('add to network')) return el;
      if (t === 'follow' || t === 'unfollow') return el;
    }
    return null;
  }

  function install() {
    const recipient = window.__ttProfile;
    if (!recipient || !recipient.id) return;
    if (document.getElementById('tt-send-message-btn')) return;

    const token = getToken();
    if (!token) return;

    const me = decodeJwt(token);
    if (!me || !me.id) return;
    if (recipient.id === me.id) return;
    if (recipient.username && me.username && recipient.username === me.username) return;
    if (recipient.messages_blocked === 1) return;
    if (recipient.message_policy === 'none') return;

    const h1 = document.querySelector('main h1') || document.querySelector('h1');
    if (!h1) return;

    const btn = document.createElement('button');
    btn.id = 'tt-send-message-btn';
    btn.type = 'button';
    btn.innerHTML = '✉️ <span>Send Message</span>';
    btn.style.cssText = `
      display:inline-flex;align-items:center;gap:6px;
      padding:10px 18px;border-radius:12px;border:none;
      background:linear-gradient(135deg,#f97316,#ec4899);color:#fff;
      font-weight:700;cursor:pointer;font-size:14px;font-family:inherit;
      box-shadow:0 4px 14px rgba(249,115,22,0.35);
      transition:transform 0.15s ease,opacity 0.15s ease;
      white-space:nowrap;`;
    btn.addEventListener('mouseenter', () => { btn.style.transform = 'translateY(-1px)'; });
    btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
    btn.addEventListener('click', () => {
      const dlg = buildModal(recipient);
      wireModal(dlg, recipient);
      document.documentElement.appendChild(dlg);
      dlg.showModal();
    });

    const anchor = findActionAnchor();
    if (anchor && anchor.parentElement) {
      anchor.parentElement.insertBefore(btn, anchor);
      return;
    }
    if (h1.parentElement && h1.parentElement.tagName === 'H1') {
      h1.insertAdjacentElement('afterend', btn);
    } else {
      h1.insertAdjacentElement('afterend', btn);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install);
  } else {
    install();
  }
  document.addEventListener('loginStatusChanged', install);
})();