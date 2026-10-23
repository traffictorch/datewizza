
// ===== AUTH GUARD =====
(function() {
  const token = localStorage.getItem('authToken');
  const isLoginPage = window.location.pathname.includes('login') || window.location.pathname.includes('signup');
  
  if (!token && !isLoginPage) {
    // Redirect to login, preserving ?plan= params
    const search = window.location.search;
    window.location.replace('/login/' + search);
  }
})();

const API_BASE = 'https://datewizza-auth.traffictorch.workers.dev';
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

let state = { events: [], tasks: [], calendars: [], activeCalendarId: null };
let current = new Date();
let selectedDay = null;

function getToken() { return localStorage.getItem('authToken'); }

async function apiFetch(path, opts = {}) {
  const token = getToken();
  if (!token) throw new Error('No token');
  opts.headers = { ...opts.headers, 'Authorization': 'Bearer ' + token };
  if (opts.body) opts.headers['Content-Type'] = 'application/json';
  const res = await fetch(API_BASE + path, opts);
  if (!res.ok) throw new Error('API error ' + res.status);
  return res.json();
}

async function loadData() {
  if (!getToken()) return;
  try {
    const calRes = await apiFetch('/api/calendar/calendars');
    state.calendars = calRes.calendars || [];
    if (!state.activeCalendarId && state.calendars.length > 0) state.activeCalendarId = state.calendars[0].id;

    if (state.activeCalendarId) {
      const [evRes, taskRes] = await Promise.all([
        apiFetch('/api/calendar/events?calendar_id=' + state.activeCalendarId),
        apiFetch('/api/calendar/tasks?calendar_id=' + state.activeCalendarId)
      ]);
      state.events = (evRes.events || []).map(e => ({ ...e, date: e.start_at }));
      state.tasks = (taskRes.tasks || []).map(t => ({ ...t, date: t.due_at || t.created_at, notes: t.notes || '' }));
    }
  } catch (e) { console.error('Load failed', e); }
}

function eventsFor(y,m,d){ return state.events.filter(e => { const dt = new Date(e.date); return dt.getFullYear()===y && dt.getMonth()===m && dt.getDate()===d; }); }
function tasksFor(y,m,d){ return state.tasks.filter(t => { const dt = new Date(t.date); return dt.getFullYear()===y && dt.getMonth()===m && dt.getDate()===d; }); }

function renderWeekdayRow(){
  document.getElementById('weekdayRow').innerHTML = DAYS.map(d => `<div class="text-center text-[10px] md:text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 py-1">${d}</div>`).join('');
}

function renderGrid(){
  const y = current.getFullYear(), m = current.getMonth();
  document.getElementById('monthLabel').textContent = MONTHS[m] + ' ' + y;
  const grid = document.getElementById('calendarGrid');
  const firstDay = new Date(y,m,1).getDay();
  const daysInMonth = new Date(y,m+1,0).getDate();
  const daysInPrev = new Date(y,m,0).getDate();
  const today = new Date().toDateString();

  let html = '';
  for(let i=0; i<42; i++){
    let day, cellM = m, cellY = y, other = false;
    if(i < firstDay){ day = daysInPrev - firstDay + i + 1; cellM = m-1; if(cellM<0){cellM=11;cellY=y-1;} other = true; }
    else if(i >= firstDay + daysInMonth){ day = i - (firstDay + daysInMonth) + 1; cellM = m+1; if(cellM>11){cellM=0;cellY=y+1;} other = true; }
    else { day = i - firstDay + 1; }
    
    const dt = new Date(cellY, cellM, day);
    const isToday = dt.toDateString() === today;
    const evs = other ? [] : eventsFor(cellY, cellM, day);
    const tsks = other ? [] : tasksFor(cellY, cellM, day);
    const items = [...evs.map(e=>({type:'event',...e})), ...tsks.map(t=>({type:'task',...t}))].sort((a,b)=>a.date-b.date).slice(0,3);
    const more = (evs.length+tsks.length) - items.length;

    const cls = `dw-day-cell bg-white dark:bg-white/5 p-1.5 border border-gray-200 dark:border-gray-800 ${isToday?'dw-today':''} ${other?'dw-other':''}`;
    
    html += `<div class="${cls}" data-y="${cellY}" data-m="${cellM}" data-d="${day}">
      <div class="font-bold text-xs md:text-sm mb-0.5 ${isToday?'text-emerald-500':''}">${day}</div>
      ${items.map(it => {
        if (it.type === 'event') {
          const c = it.color || '#10b981';
          return `<div class="dw-event-pill" style="border-left-color:${c}; background:${c}22;">${fmtTime(it.date)} ${esc(it.title)}</div>`;
        } else {
          return `<div class="dw-event-pill dw-task-pill ${it.done?'done':''}">${it.done?'✓':'○'} ${esc(it.title)}</div>`;
        }
      }).join('')}
      ${more>0?`<div class="text-[10px] text-gray-500 font-bold">+${more} more</div>`:''}
    </div>`;
  }
  grid.innerHTML = html;
  grid.querySelectorAll('.dw-day-cell:not(.dw-other)').forEach(cell => {
    cell.addEventListener('click', () => openSheet(+cell.dataset.y, +cell.dataset.m, +cell.dataset.d));
  });
}

function fmtTime(ts){ return new Date(ts).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'}).replace(' ','').toLowerCase(); }
function esc(s){ return String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

function openSheet(y,m,d){
  // Inject Travel Mode fields if they don't exist yet
  setTimeout(() => {
    const form = document.querySelector('#tabAdd .add-form');
    if (form && !document.getElementById('addTravelMode')) {
      const div = document.createElement('div');
      div.className = 'row';
      div.style.display = 'flex';
      div.style.gap = '0.5rem';
      div.style.marginTop = '0.5rem';
      div.innerHTML = `
        <div style="flex:1">
          <label style="font-size:0.7rem;font-weight:600;color:#475569;">Travel Mode</label>
          <select id="addTravelMode" style="width:100%;padding:0.5rem;border-radius:60px;border:1px solid #fecdd3;background:rgba(255,255,255,0.6);font-size:0.85rem;color:inherit;">
            <option value="car">🚗 Car</option>
            <option value="walk">🚶 Walk</option>
            <option value="bike">🚴 Bike</option>
            <option value="transit">🚌 Transit</option>
            <option value="rideshare">🚕 Rideshare</option>
            <option value="flight">✈️ Flight</option>
          </select>
        </div>
        <div style="flex:1">
          <label style="font-size:0.7rem;font-weight:600;color:#475569;">Distance (km)</label>
          <input type="number" id="addDistance" step="0.1" placeholder="e.g. 5" style="width:100%;padding:0.5rem;border-radius:60px;border:1px solid #fecdd3;background:rgba(255,255,255,0.6);font-size:0.85rem;color:inherit;" />
        </div>
      `;
      const titleInput = document.getElementById('addTitle');
      if (titleInput) titleInput.insertAdjacentElement('afterend', div);
    }
  }, 100);

  selectedDay = {y,m,d};
  const dt = new Date(y,m,d);
  document.getElementById('sheetTitle').textContent = dt.toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'});
  renderSheetEvents(y,m,d);
  renderSheetTasks(y,m,d);
  document.getElementById('newEventTitle').value = '';
  document.getElementById('daySheet').classList.add('open');
  document.getElementById('daySheetOverlay').classList.add('open');
}

function renderSheetEvents(y,m,d){
  const list = document.getElementById('sheetEventsList');
  const evs = eventsFor(y,m,d);
  if(!evs.length){ list.innerHTML = `<p class="text-sm text-gray-500 italic">No events yet</p>`; return; }
  list.innerHTML = evs.sort((a,b)=>a.date-b.date).map(e=>`
    <div class="flex items-center justify-between py-2 border-b border-gray-200 dark:border-gray-800">
      <div class="min-w-0 flex-1">
        <div class="text-sm font-semibold" style="color:${e.color||'#10b981'}">${fmtTime(e.date)} · ${e.duration_min||30}m</div>
        <div class="text-sm truncate">${esc(e.title)}</div>
        <button class="text-xs text-blue-500 mt-1 hover:underline" onclick="window.openChat(${e.id}, '${esc(e.title)}')">💬 Chat</button>
      </div>
      <button class="text-lg text-red-500 ml-2" data-del-event="${e.id}">🗑️</button>
    </div>`).join('');
  list.querySelectorAll('[data-del-event]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if(!confirm('Delete?')) return;
      await apiFetch('/api/calendar/events/' + btn.dataset.delEvent, { method: 'DELETE' });
      await loadData(); renderSheetEvents(y,m,d); renderGrid();
    });
  });
}

function renderSheetTasks(y,m,d){
  const list = document.getElementById('sheetTasksList');
  const ts = tasksFor(y,m,d);
  if(!ts.length){ list.innerHTML = `<p class="text-sm text-gray-500 italic">No tasks yet</p>`; return; }
  list.innerHTML = ts.map(t=>`
    <div class="flex items-center gap-2 py-1">
      <input type="checkbox" ${t.done?'checked':''} data-task-toggle="${t.id}" class="w-4 h-4 accent-emerald-500">
      <span class="flex-1 text-sm ${t.done?'line-through text-gray-500':''}">${esc(t.title)}</span>
      <button class="text-red-500" data-task-del="${t.id}">×</button>
    </div>`).join('');
  list.querySelectorAll('[data-task-toggle]').forEach(cb => {
    cb.addEventListener('change', async () => {
      await apiFetch('/api/calendar/tasks/' + cb.dataset.taskToggle, { method: 'PATCH', body: JSON.stringify({ done: cb.checked }) });
      await loadData(); renderSheetTasks(y,m,d); renderGrid();
    });
  });
  list.querySelectorAll('[data-task-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await apiFetch('/api/calendar/tasks/' + btn.dataset.taskDel, { method: 'DELETE' });
      await loadData(); renderSheetTasks(y,m,d); renderGrid();
    });
  });
}

function closeSheet(){
  document.getElementById('daySheet').classList.remove('open');
  document.getElementById('daySheetOverlay').classList.remove('open');
}

async function addEvent(){
  const btn = document.getElementById('addEventBtn');
  if (btn) { btn.innerHTML = '⏳ Saving...'; btn.disabled = true; }

  const title = document.getElementById('newEventTitle').value.trim();
  if (!title) { alert('Please enter an event title.'); if(btn){btn.innerHTML='✨ Save Event'; btn.disabled=false;} return; }

  // Collect Invitees
  const invitees = Array.from(document.querySelectorAll('.invitee-chip')).map(chip => chip.dataset.email);

  const payload = {
    title: title,
    date: new Date(current.getFullYear(), current.getMonth(), selectedDay).getTime(),
    time: document.getElementById('newEventTime').value || '12:00',
    duration: parseInt(document.getElementById('newEventDuration').value) || 60,
    location: document.getElementById('addLocation').value.trim(),
    notes: document.getElementById('addDescription').value.trim(),
    is_public: document.getElementById('newEventPublic').checked ? 1 : 0,
    travel_mode: document.getElementById('addTravelMode').value,
    distance_km: parseFloat(document.getElementById('addDistance').value) || 0,
    reminder: document.getElementById('newEventReminder').value,
    invitees: invitees
  };

  try {
    // NOTE: Assuming your backend calendar.js expects these fields
    const res = await apiFetch('/api/calendar/events?calendar_id=' + state.activeCalendarId, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (res.error) throw new Error(res.error);

    // Reset form
    document.getElementById('newEventTitle').value = '';
    document.getElementById('addLocation').value = '';
    document.getElementById('addDescription').value = '';
    document.getElementById('addDistance').value = '';
    document.getElementById('newEventPublic').checked = false;
    document.getElementById('inviteeChips').innerHTML = '';
    
    // Close sheet & refresh
    closeSheet();
    await loadData();
    renderGrid();
    loadSavingsWidget(); // Refresh efficiency widget

  } catch (err) {
    alert('Failed to create event: ' + err.message);
  } finally {
    if (btn) { btn.innerHTML = '✨ Save Event'; btn.disabled = false; }
  }
}

// ===== INVITEES CHIP LOGIC =====
document.getElementById('addInviteeBtn')?.addEventListener('click', () => {
  const input = document.getElementById('addInviteesInput');
  const val = input.value.trim();
  if (!val) return;
  
  // Simple validation for email or phone
  const isEmail = val.includes('@');
  const isPhone = /^[+]*[(]{0,1}[0-9]{1,4}[)]{0,1}[-\s\./0-9]*$/.test(val);
  
  if (!isEmail && !isPhone) {
    alert('Please enter a valid email or phone number.');
    return;
  }

  const chips = document.getElementById('inviteeChips');
  const chip = document.createElement('div');
  chip.className = 'invitee-chip flex items-center gap-1 bg-violet-500/20 text-violet-600 dark:text-violet-300 px-2 py-1 rounded-md text-xs font-bold';
  chip.dataset.email = val;
  chip.innerHTML = `${val} <button class="hover:text-red-500 font-black ml-1">&times;</button>`;
  
  chip.querySelector('button').onclick = () => chip.remove();
  
  chips.appendChild(chip);
  input.value = '';
});

// ===== AI DRAFT LOGIC =====
document.getElementById('aiDraftBtn')?.addEventListener('click', async () => {
  const title = document.getElementById('newEventTitle').value.trim();
  const textarea = document.getElementById('addDescription');
  if (!title) { alert('Please enter an event title first so the AI knows what to write about.'); return; }
  
  const originalText = document.getElementById('aiDraftBtn').innerHTML;
  document.getElementById('aiDraftBtn').innerHTML = '⏳ Thinking...';
  
  try {
    // Placeholder for backend AI endpoint. If you have /api/ai/generate, swap the URL.
    setTimeout(() => {
      textarea.value = `Hey everyone! 👋\n\nJust a quick reminder about ${title}. We'd love to see you there!\n\nLet me know if you can make it.`;
      document.getElementById('aiDraftBtn').innerHTML = originalText;
    }, 800);
  } catch (e) {
    alert('AI Draft failed.');
    document.getElementById('aiDraftBtn').innerHTML = originalText;
  }
});


async function addTask(){
  if(!selectedDay) return;
  const title = document.getElementById('newTaskTitle').value.trim();
  if(!title) return;
  const dateObj = new Date(selectedDay.y, selectedDay.m, selectedDay.d, 0, 0);
  await apiFetch('/api/calendar/tasks', { method: 'POST', body: JSON.stringify({ title, due_at: dateObj.getTime(), calendar_id: state.activeCalendarId }) });
  await loadData(); renderSheetTasks(selectedDay.y, selectedDay.m, selectedDay.d); renderGrid();
  document.getElementById('newTaskTitle').value = '';
}

async function activateTab(name){
  document.querySelectorAll('.dw-tab-panel').forEach(p => p.classList.remove('active'));
  const el = document.getElementById('tab-' + name);
  if(el) el.classList.add('active');
  
  if (name === 'calendars') renderCalendarsTab();
  if (name === 'community') loadPublicEvents();
  if (name === 'insights' && getToken()) {
    try {
      const data = await apiFetch('/api/calendar/insights?calendar_id=' + state.activeCalendarId);
      const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      setTxt('insightCost', '€' + (data.totalCost || 0).toFixed(2));
      setTxt('insightCo2', (data.co2Kg || 0).toFixed(1) + ' kg');
      setTxt('insightLoad', data.loadScore || 0);

      const suggList = document.getElementById('insightSuggestions');
      if (!suggList) return;
      const parts = [];

      const sv = data.savings || { co2Kg: 0, eur: 0, km: 0 };
      if (sv.co2Kg > 0 || sv.eur > 0 || sv.km > 0) {
        parts.push('<div class="p-4 bg-gradient-to-br from-emerald-500/20 to-blue-500/10 border border-emerald-500/30 rounded-xl mb-3">'
          + '<div class="text-xs uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-bold mb-1">This month you saved</div>'
          + '<div class="grid grid-cols-3 gap-3 mt-2">'
          + '<div><div class="text-2xl font-black text-emerald-500">' + sv.km.toFixed(1) + '</div><div class="text-xs text-gray-500">km not driven</div></div>'
          + '<div><div class="text-2xl font-black text-blue-500">€' + sv.eur.toFixed(2) + '</div><div class="text-xs text-gray-500">saved</div></div>'
          + '<div><div class="text-2xl font-black text-teal-500">' + sv.co2Kg.toFixed(2) + '</div><div class="text-xs text-gray-500">kg CO₂ avoided</div></div>'
          + '</div></div>');
      }

      const modes = Object.entries(data.byMode || {});
      if (modes.length > 0) {
        const icons = { walk: '🚶', bike: '🚴', transit: '🚌', car: '🚗', rideshare: '🚕', flight: '✈️' };
        let mh = '<div class="p-3 bg-white/5 border border-gray-200 dark:border-gray-800 rounded-lg mb-3">'
          + '<div class="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Travel modes</div>';
        modes.forEach(([mode, m]) => {
          mh += '<div class="flex items-center justify-between py-1 text-sm"><span>' + (icons[mode] || '📍') + ' ' + mode + '</span><span class="text-gray-500">' + m.count + ' event' + (m.count === 1 ? '' : 's') + (m.km > 0 ? ' · ' + m.km.toFixed(1) + ' km' : '') + '</span></div>';
        });
        if (data.totals && data.totals.eventsWithoutDistance > 0) {
          mh += '<div class="text-xs text-amber-500 mt-2">⚠️ ' + data.totals.eventsWithoutDistance + ' event' + (data.totals.eventsWithoutDistance === 1 ? '' : 's') + ' without distance — add travel mode + distance to unlock savings.</div>';
        }
        mh += '</div>';
        parts.push(mh);
      }

      const tm = data.tripMerge || {};
      if (tm.groups && tm.groups.length > 0) {
        let th = '<div class="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg mb-3">'
          + '<div class="flex items-center justify-between mb-2"><strong class="text-emerald-500">💡 Trip Merge Potential</strong><span class="text-xs text-gray-500">' + tm.groupCount + ' group' + (tm.groupCount === 1 ? '' : 's') + '</span></div>'
          + '<div class="text-sm mb-2">Merge these to save <strong>' + tm.potentialCo2Kg.toFixed(2) + ' kg CO₂</strong> and <strong>€' + tm.potentialEur.toFixed(2) + '</strong>.</div>';
        tm.groups.forEach(g => {
          th += '<div class="text-xs text-gray-600 dark:text-gray-400 py-1 border-t border-emerald-500/10">📍 ' + esc(g.location) + ' on ' + new Date(g.day).toLocaleDateString(undefined, {month:'short', day:'numeric'}) + ' — ' + g.events.length + ' trips</div>';
        });
        th += '</div>';
        parts.push(th);
      }

      if (data.suggestions && data.suggestions.length > 0) {
        data.suggestions.forEach(s => {
          parts.push('<div class="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg mb-2"><strong class="text-emerald-500">💡 Trip Merge</strong><p class="text-sm mt-1">' + s.message + '</p><p class="text-xs text-gray-500 mt-1">Est. savings: ' + s.savings + '</p></div>');
        });
      }

      if (parts.length === 0) {
        parts.push('<p class="text-sm text-gray-500">No insights yet. Add travel mode + distance to events to see savings.</p>');
      }

      suggList.innerHTML = parts.join('');
    } catch(e) { console.error(e); }
  }
}

function renderCalendarsTab(){
  const list = document.getElementById('calendarsList');
  list.innerHTML = state.calendars.map(c => `
    <div class="flex items-center justify-between p-3 rounded-lg mb-2 border ${c.id === state.activeCalendarId ? 'border-emerald-500 bg-emerald-500/10' : 'border-gray-200 dark:border-gray-800 bg-white/5'}">
      <div class="flex items-center gap-3">
        <div class="w-4 h-4 rounded-full" style="background:${c.color || '#10b981'}"></div>
        <span class="font-bold">${esc(c.name)}</span>
        <span class="text-xs text-gray-500 uppercase">${c.role}</span>
      </div>
      <div class="flex gap-2">
        ${c.id !== state.activeCalendarId ? `<button onclick="window.switchCalendar(${c.id})" class="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-800 rounded hover:bg-gray-300 transition">Switch</button>` : ''}
        ${c.role === 'owner' ? `<button onclick="window.inviteToCalendar(${c.id})" class="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition">Invite</button>` : ''}
      </div>
    </div>
  `).join('');
}

window.switchCalendar = async (id) => { state.activeCalendarId = id; await loadData(); renderGrid(); renderCalendarsTab(); };
window.inviteToCalendar = async (id) => {
  try {
    const res = await apiFetch('/api/calendar/calendars/' + id + '/invite', { method: 'POST' });
    prompt('Copy this invite link:', res.invite_url);
  } catch(e) { alert('Failed'); }
};
window.createCalendar = async () => {
  const name = prompt("New Calendar Name:");
  if (!name) return;
  await apiFetch('/api/calendar/calendars', { method: 'POST', body: JSON.stringify({ name, color: '#' + Math.floor(Math.random()*16777215).toString(16) }) });
  await loadData(); renderCalendarsTab();
};

// ── CHAT ──
window.openChat = async (eventId, title) => {
  document.getElementById('chatTitle').textContent = 'Chat: ' + title;
  document.getElementById('chatEventId').value = eventId;
  document.getElementById('chatModal').classList.replace('hidden', 'flex');
  await loadChat(eventId);
};

async function loadChat(eventId) {
  const list = document.getElementById('chatMessages');
  list.innerHTML = '<p class="text-sm text-gray-500">Loading...</p>';
  try {
    const res = await apiFetch('/api/calendar/events/' + eventId + '/comments');
    if (!res.comments.length) {
      list.innerHTML = '<p class="text-sm text-gray-500 italic">No messages yet.</p>';
    } else {
      list.innerHTML = res.comments.map(c => `
        <div class="mb-3">
          <div class="text-xs font-bold text-gray-500">${esc(c.user_name || 'User')} · ${new Date(c.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div>
          <div class="text-sm">${esc(c.body)}</div>
        </div>
      `).join('');
    }
    list.scrollTop = list.scrollHeight;
  } catch(e) { list.innerHTML = '<p class="text-sm text-red-500">Failed to load.</p>'; }
}

window.sendChat = async () => {
  const eventId = document.getElementById('chatEventId').value;
  const input = document.getElementById('chatInput');
  const body = input.value.trim();
  if (!body) return;
  input.value = '';
  await apiFetch('/api/calendar/events/' + eventId + '/comments', { method: 'POST', body: JSON.stringify({ body }) });
  await loadChat(eventId);
};

// ── FIND TIME ──
window.openFindTime = () => {
  document.getElementById('findTimeDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('findTimeResults').innerHTML = '';
  document.getElementById('findTimeModal').classList.replace('hidden', 'flex');
};

window.searchFreeTime = async () => {
  const date = document.getElementById('findTimeDate').value;
  const dur = document.getElementById('findTimeDuration').value;
  const resContainer = document.getElementById('findTimeResults');
  
  if (!date) return alert('Pick a date');
  resContainer.innerHTML = '<p class="text-sm text-gray-500">Searching...</p>';
  
  try {
    const data = await apiFetch('/api/calendar/find-time?calendar_id=' + state.activeCalendarId + '&date=' + date + '&duration=' + dur);
    
    if (!data.slots || data.slots.length === 0) {
      resContainer.innerHTML = '<p class="text-sm text-red-500">No free slots found for this day.</p>';
      return;
    }
    
    resContainer.innerHTML = data.slots.map(s => {
      const start = new Date(s.start).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      const end = new Date(s.end).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      return `
        <div class="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex justify-between items-center cursor-pointer hover:bg-emerald-500/20 transition" onclick="window.applyFreeSlot('${date}', '${start}')">
          <span class="font-bold text-emerald-600 dark:text-emerald-400">${start} - ${end}</span>
          <span class="text-xs text-gray-500">Select</span>
        </div>
      `;
    }).join('');
  } catch(e) {
    resContainer.innerHTML = '<p class="text-sm text-red-500">Error finding slots.</p>';
  }
};

window.applyFreeSlot = (dateStr, timeStr) => {
  document.getElementById('findTimeModal').classList.replace('flex', 'hidden');
  
  const [y, m, d] = dateStr.split('-');
  const [hh, mm] = timeStr.split(':');
  
  let hour = parseInt(hh);
  if (timeStr.includes('PM') && hour < 12) hour += 12;
  if (timeStr.includes('AM') && hour === 12) hour = 0;
  
  const dateObj = new Date(y, m-1, d);
  openSheet(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
  
  document.getElementById('newEventTime').value = `${String(hour).padStart(2,'0')}:${mm}`;
  document.getElementById('newEventTitle').focus();
};


async function loadPublicEvents() {
  const container = document.querySelector('#tab-community') || document.getElementById('communityContent');
  if (!container) return;
  
  try {
    const data = await apiFetch('/api/calendar/public-events');
    const events = data.events || [];
    
    // Preserve the existing header if there is one, just update the content below it
    const header = container.querySelector('h1');
    const headerHTML = header ? header.outerHTML : '<h1 class="text-2xl font-black mb-4">Public Events</h1>';
    
    if (events.length === 0) {
      container.innerHTML = headerHTML + '<p class="text-gray-500">No public events yet. Create one and check "Make this event public" to share it!</p>';
      return;
    }
    
    container.innerHTML = headerHTML + events.map(e => `
      <div class="p-4 mb-3 bg-white/5 border border-gray-200 dark:border-gray-800 rounded-xl">
        <div class="font-bold text-lg text-emerald-500">${esc(e.title)}</div>
        <div class="text-sm text-gray-500">📅 ${new Date(e.start_at).toLocaleString()}</div>
        ${e.location ? `<div class="text-sm text-gray-500">📍 ${esc(e.location)}</div>` : ''}
        ${e.notes ? `<div class="text-sm mt-2 text-gray-400">${esc(e.notes)}</div>` : ''}
      </div>
    `).join('');
  } catch(e) {
    console.error('Community error:', e);
  }
}

function handleHash(){
  // Inject Stripe Upgrade Button
  if (!document.getElementById('upgradeBtn')) {
    
  // Load Stripe.js if not already present
  if (!window.Stripe) {
    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3/';
    script.async = true;
    document.head.appendChild(script);
  }


    const btn = document.createElement('button');
    btn.id = 'upgradeBtn';
    // FIX: text-slate-900 for dark text in light mode, text-white for dark mode
    btn.className = 'bg-gradient-to-r from-amber-400 to-orange-500 text-slate-900 dark:text-white font-bold py-1 px-3 rounded-full text-xs ml-2 shadow-lg hover:scale-105 transition';
    btn.innerHTML = '✨ Upgrade to Pro';
    document.querySelector('header .header-right, header > div:last-child')?.appendChild(btn) || document.querySelector('header')?.appendChild(btn);

    btn.onclick = () => {
      // 1. Show Plan Selector
      const planModal = document.createElement('div');
      planModal.id = 'planSelectorModal';
      planModal.style.cssText = `
        position: fixed; inset: 0; z-index: 9998;
        background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
        display: flex; align-items: center; justify-content: center;
        padding: 1rem;
      `;
      planModal.innerHTML = `
        <div style="background: #fff; border-radius: 1rem; max-width: 420px; width: 100%; padding: 1.5rem; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);">
          <h2 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 0.5rem; text-align: center; color: #0f172a;">Choose your plan</h2>
          <p style="font-size: 0.875rem; color: #64748b; text-align: center; margin-bottom: 1.5rem;">Upgrade to save more time, money, and CO₂.</p>
          
          <div style="display: flex; flex-direction: column; gap: 0.75rem;">
            <button class="plan-opt" data-plan="pro_6month" style="padding: 1rem; border: 2px solid #e2e8f0; border-radius: 0.75rem; background: #f8fafc; cursor: pointer; text-align: left; transition: 0.2s;">
              <div style="font-weight: 700; color: #0f172a;">Pro (6-Month)</div>
              <div style="font-size: 0.875rem; color: #64748b;">$24 billed every 6 months</div>
            </button>
            <button class="plan-opt" data-plan="pro_yearly" style="padding: 1rem; border: 2px solid #e2e8f0; border-radius: 0.75rem; background: #f8fafc; cursor: pointer; text-align: left; transition: 0.2s;">
              <div style="font-weight: 700; color: #0f172a;">Pro (Yearly) <span style="background: #10b981; color: white; font-size: 0.65rem; padding: 0.1rem 0.4rem; border-radius: 9999px; margin-left: 0.5rem;">Save 30%</span></div>
              <div style="font-size: 0.875rem; color: #64748b;">$40 billed yearly</div>
            </button>
            <button class="plan-opt" data-plan="pro_lifetime" style="padding: 1rem; border: 2px solid #e2e8f0; border-radius: 0.75rem; background: #f8fafc; cursor: pointer; text-align: left; transition: 0.2s;">
              <div style="font-weight: 700; color: #0f172a;">Pro (Lifetime)</div>
              <div style="font-size: 0.875rem; color: #64748b;">$120 one-time payment</div>
            </button>
            <button class="plan-opt" data-plan="enterprise_monthly" style="padding: 1rem; border: 2px solid #e2e8f0; border-radius: 0.75rem; background: #f8fafc; cursor: pointer; text-align: left; transition: 0.2s;">
              <div style="font-weight: 700; color: #0f172a;">Expert (Monthly)</div>
              <div style="font-size: 0.875rem; color: #64748b;">$12 billed monthly</div>
            </button>
            <button class="plan-opt" data-plan="enterprise_yearly" style="padding: 1rem; border: 2px solid #e2e8f0; border-radius: 0.75rem; background: #f8fafc; cursor: pointer; text-align: left; transition: 0.2s;">
              <div style="font-weight: 700; color: #0f172a;">Expert (Yearly)</div>
              <div style="font-size: 0.875rem; color: #64748b;">$120 billed yearly</div>
            </button>
          </div>
          
          <button id="closePlanModal" style="margin-top: 1.5rem; width: 100%; padding: 0.75rem; background: transparent; border: none; color: #64748b; font-weight: 600; cursor: pointer;">Cancel</button>
        </div>
      `;
      document.body.appendChild(planModal);

      document.getElementById('closePlanModal').onclick = () => planModal.remove();

      // 2. Handle Plan Selection
      document.querySelectorAll('.plan-opt').forEach(opt => {
        opt.onmouseenter = () => { opt.style.borderColor = '#10b981'; opt.style.background = '#ecfdf5'; };
        opt.onmouseleave = () => { opt.style.borderColor = '#e2e8f0'; opt.style.background = '#f8fafc'; };
        
        opt.onclick = async () => {
          planModal.remove();
          const plan = opt.dataset.plan;
          await startCheckout(plan, btn);
        };
      });
    };
    
    // 3. The Checkout Function
    async function startCheckout(plan, btn) {
      btn.innerHTML = '⏳ Loading...';
      btn.disabled = true;
      
      try {
        const res = await fetch('https://api.datewizza.com/api/upgrade', {
          method: 'POST',
          headers: { 
            'Authorization': 'Bearer ' + getToken(),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ plan: plan })
        });
        const data = await res.json();
        
        if (data.error) {
          alert('Upgrade failed: ' + data.error);
          btn.innerHTML = '✨ Upgrade to Pro';
          btn.disabled = false;
          return;
        }

        if (data.clientSecret) {
          // Mount Stripe Embedded Checkout in a modal
          const modal = document.createElement('div');
          modal.id = 'stripeCheckoutModal';
          modal.style.cssText = `
            position: fixed; inset: 0; z-index: 9999;
            background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
            display: flex; align-items: center; justify-content: center;
            padding: 1rem;
          `;
          modal.innerHTML = `
            <div style="position: relative; background: #fff; border-radius: 1rem; max-width: 500px; width: 100%; max-height: 90vh; overflow-y: auto; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);">
              <button id="closeCheckoutModal" style="position: absolute; top: 0.75rem; right: 0.75rem; z-index: 10; background: rgba(0,0,0,0.1); border: none; border-radius: 9999px; width: 2rem; height: 2rem; cursor: pointer; font-size: 1.25rem; display: flex; align-items: center; justify-content: center;">✕</button>
              <div id="checkout-container" style="padding: 1rem;"></div>
            </div>
          `;
          document.body.appendChild(modal);

          document.getElementById('closeCheckoutModal').onclick = () => {
            modal.remove();
            btn.innerHTML = '✨ Upgrade to Pro';
            btn.disabled = false;
          };

          // Initialize Stripe Embedded Checkout
          const initStripe = async () => {
            if (window.Stripe) {
              const stripe = Stripe('pk_live_51UTT391v9AW4q34J8raxszcqwSZGvOehAzGwQUmrJ7MNTy8kNZqQb52h2lLx4GR2zFGcFCrz1aWJLvCbv6QlFCNF00fmqR45kD');
              const checkout = await stripe.initEmbeddedCheckout({ clientSecret: data.clientSecret });
              checkout.mount('#checkout-container');
            } else {
              setTimeout(initStripe, 100);
            }
          };
          initStripe();

        } else {
          alert('Upgrade failed: no client secret returned.');
          btn.innerHTML = '✨ Upgrade to Pro';
          btn.disabled = false;
        }
      } catch (err) {
        alert('Error: ' + err.message);
        btn.innerHTML = '✨ Upgrade to Pro';
        btn.disabled = false;
      }
    }
  }

  const h = (location.hash || '#calendar').replace('#','');
  activateTab(h);
}



// ===== EMPTY STATE LOGIC =====
function checkEmptyState() {
  const grid = document.querySelector('.calendar-grid');
  if (!grid) return;
  
  // Check if there are any events rendered in the grid
  const hasEvents = document.querySelector('.event-pill') !== null;
  const existingEmptyState = document.getElementById('globalEmptyState');
  
  if (!hasEvents && !existingEmptyState) {
    // Inject Empty State Overlay
    const overlay = document.createElement('div');
    overlay.id = 'globalEmptyState';
    overlay.className = 'absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/80 dark:bg-slate-900/80 backdrop-blur-md rounded-2xl transition-opacity duration-500';
    overlay.innerHTML = `
      <div class="text-6xl mb-4 animate-bounce">📅</div>
      <h2 class="text-2xl font-black text-slate-900 dark:text-white mb-2 font-display">Your calendar is empty</h2>
      <p class="text-sm text-slate-500 mb-6 max-w-xs text-center">Plan your first date, task, or trip merge to start saving time, money, and CO₂.</p>
      <button onclick="document.querySelector('.day-cell.today')?.click()" class="btn-primary px-8 py-3 rounded-full font-bold text-white shadow-glow flex items-center gap-2">
        ✨ Create your first date
      </button>
    `;
    
    // Make sure the calendar wrapper is relative
    const wrapper = document.querySelector('.calendar-wrapper') || grid.parentElement;
    wrapper.style.position = 'relative';
    wrapper.appendChild(overlay);
    
  } else if (hasEvents && existingEmptyState) {
    // Remove empty state if events exist
    existingEmptyState.remove();
  }
}

// ===== TRIP MERGE SAVINGS WIDGET =====
function injectSavingsWidget() {
  if (document.getElementById('savingsWidget')) return;
  const container = document.querySelector('main') || document.body;
  
  const widget = document.createElement('div');
  widget.id = 'savingsWidget';
  widget.className = 'flex mx-4 mt-2 mb-1 p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 to-violet-500/10 border border-emerald-500/20 backdrop-blur-md flex justify-between items-center shadow-lg transition-all duration-300';
  widget.innerHTML = `
    <div class="flex items-center gap-3">
      <div class="text-3xl drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]">⚡</div>
      <div>
        <div class="text-[10px] font-bold uppercase tracking-widest text-emerald-500">Monthly Efficiency</div>
        <div class="text-xl font-black text-slate-900 dark:text-white" id="widgetCo2">0 kg CO₂</div>
        <div class="text-[10px] font-medium text-slate-500">carbon footprint avoided</div>
      </div>
    </div>
    <div class="text-right">
      <div class="text-sm font-bold text-slate-900 dark:text-white" id="widgetEur">€0.00 saved</div>
      <div class="text-sm font-bold text-emerald-600 dark:text-emerald-400" id="widgetKm">0 km optimized</div>
    </div>
  `;
  // Insert at top of main content
  const main = document.querySelector('main');
  if (main) {
    main.insertBefore(widget, main.firstChild);
  }
}

async function loadSavingsWidget() {
  if (!getToken() || !state.activeCalendarId) return;
  try {
    const data = await apiFetch('/api/calendar/insights?calendar_id=' + state.activeCalendarId);
    const sv = data.savings || { co2Kg: 0, eur: 0, km: 0 };
    const w = document.getElementById('savingsWidget');
    
    if (w) {
      // Always show the widget on the dashboard, even if 0
      w.classList.remove('hidden');
      document.getElementById('widgetCo2').textContent = (sv.co2Kg || 0).toFixed(1) + ' kg CO₂';
      document.getElementById('widgetEur').textContent = '€' + (sv.eur || 0).toFixed(2);
      document.getElementById('widgetKm').textContent = (sv.km || 0).toFixed(1) + ' km';
    }
  } catch (e) {
    console.error("Savings widget error:", e);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  injectSavingsWidget();
  await loadData();
  renderWeekdayRow();
  renderGrid();
  loadSavingsWidget();
  setTimeout(checkEmptyState, 100);
  document.getElementById('prevMonth').addEventListener('click', () => { current.setMonth(current.getMonth()-1); renderGrid(); });
  document.getElementById('nextMonth').addEventListener('click', () => { current.setMonth(current.getMonth()+1); renderGrid(); });
  document.getElementById('closeSheet').addEventListener('click', closeSheet);
  document.getElementById('daySheetOverlay').addEventListener('click', closeSheet);
  document.getElementById('addEventBtn').addEventListener('click', addEvent);
  document.getElementById('addTaskBtn').addEventListener('click', addTask);
  window.addEventListener('hashchange', handleHash);
  handleHash();
});

// ── MEMOS ──
async function loadMemos() {
  if (!getToken()) return;
  const list = document.getElementById('memosList');
  list.innerHTML = '<p class="text-sm text-gray-500">Loading...</p>';
  try {
    const res = await apiFetch('/api/calendar/memos?calendar_id=' + state.activeCalendarId);
    if (!res.memos || res.memos.length === 0) {
      list.innerHTML = '<p class="text-sm text-gray-500 italic">No memos yet. Jot down an idea above!</p>';
      return;
    }
    list.innerHTML = res.memos.map(m => `
      <div class="flex justify-between items-center p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-gray-900 dark:text-white">${esc(m.title)}</p>
          <p class="text-xs text-gray-500 mt-1">Added ${new Date(m.created_at).toLocaleDateString()}</p>
        </div>
        <div class="flex gap-2 ml-4">
          <button onclick="window.scheduleMemo('${esc(m.title)}')" class="text-xs px-3 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold rounded hover:bg-emerald-500/20 transition">Schedule</button>
          <button onclick="window.deleteMemo(${m.id})" class="text-xs text-red-500 hover:text-red-700 font-bold px-2">✕</button>
        </div>
      </div>
    `).join('');
  } catch (e) {
    list.innerHTML = '<p class="text-sm text-red-500">Failed to load memos.</p>';
  }
}

window.addMemo = async () => {
  const input = document.getElementById('newMemoInput');
  const title = input.value.trim();
  if (!title) return;
  input.value = '';
  await apiFetch('/api/calendar/memos', { method: 'POST', body: JSON.stringify({ title, calendar_id: state.activeCalendarId }) });
  await loadMemos();
};

window.deleteMemo = async (id) => {
  if (!confirm('Delete this memo?')) return;
  await apiFetch('/api/calendar/memos/' + id, { method: 'DELETE' });
  await loadMemos();
};

window.scheduleMemo = (title) => {
  // Find today's date
  const today = new Date();
  openSheet(today.getFullYear(), today.getMonth(), today.getDate());
  document.getElementById('newEventTitle').value = title;
  document.getElementById('newEventTime').focus();
};



// Theme & Menu logic (Replacing main.js)


// Ensure hash routing works with the new static sidebar links
window.addEventListener('hashchange', () => {
  const h = (location.hash || '#calendar').replace('#','');
  window.activateTab(h);
});

// ── ICAL SYNC ──
window.syncIcal = async () => {
  const input = document.getElementById('icalUrlInput');
  const url = input.value.trim();
  if (!url || !url.startsWith('http')) return alert('Please enter a valid URL starting with http.');
  
  const btn = event.target;
  btn.textContent = 'Syncing...';
  btn.disabled = true;
  
  try {
    const res = await apiFetch('/api/calendar/feeds/sync', {
      method: 'POST',
      body: JSON.stringify({ url, calendar_id: state.activeCalendarId })
    });
    alert(`✅ Successfully imported ${res.count} events!`);
    input.value = '';
    await loadData();
    renderGrid();
    renderCalendarsTab();
  } catch (e) {
    alert('❌ Failed to sync. Make sure the URL is a valid, public .ics link.');
  } finally {
    btn.textContent = 'Sync Feed';
    btn.disabled = false;
  }
};

async function loadFeeds() {
  if (!getToken()) return;
  const list = document.getElementById('feedsList');
  try {
    const res = await apiFetch('/api/calendar/feeds?calendar_id=' + state.activeCalendarId);
    if (!res.feeds || res.feeds.length === 0) {
      list.innerHTML = '';
      return;
    }
    list.innerHTML = res.feeds.map(f => `
      <div class="flex justify-between items-center text-sm p-2 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
        <span class="truncate text-gray-600 dark:text-gray-300 max-w-[80%]">${esc(f.url)}</span>
        <button onclick="window.deleteFeed(${f.id})" class="text-red-500 font-bold hover:text-red-700 px-2">Remove</button>
      </div>
    `).join('');
  } catch (e) { console.error('Failed to load feeds'); }
}

window.deleteFeed = async (id) => {
  if (!confirm('Remove this feed and all its imported events?')) return;
  await apiFetch('/api/calendar/feeds/' + id, { method: 'DELETE' });
  await loadData();
  renderGrid();
  renderCalendarsTab();
};

// Override renderCalendarsTab to include feeds
const originalRenderCalendars = renderCalendarsTab;
window.renderCalendarsTab = () => {
  originalRenderCalendars();
  loadFeeds();
};

// ── RESOURCES & BOOKING ──
async function loadResources() {
  if (!getToken()) return;
  const list = document.getElementById('resourcesList');
  list.innerHTML = '<p class="text-sm text-gray-500">Loading...</p>';
  try {
    const res = await apiFetch('/api/calendar/resources?calendar_id=' + state.activeCalendarId);
    if (!res.resources || res.resources.length === 0) {
      list.innerHTML = '<p class="text-sm text-gray-500 italic col-span-2">No resources added yet. Add your first one!</p>';
      return;
    }
    list.innerHTML = res.resources.map(r => `
      <div class="p-5 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm flex flex-col justify-between">
        <div class="flex items-center gap-3 mb-4">
          <span class="text-3xl">${r.icon}</span>
          <h3 class="font-bold text-lg">${esc(r.name)}</h3>
        </div>
        <div class="flex gap-2">
          <button onclick="window.openBooking(${r.id}, '${esc(r.name)}')" class="flex-1 dw-btn-primary text-sm py-2">Book</button>
          <button onclick="window.viewBookings(${r.id}, '${esc(r.name)}')" class="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold rounded-lg hover:bg-gray-200 transition">Schedule</button>
        </div>
      </div>
    `).join('');
  } catch (e) { list.innerHTML = '<p class="text-sm text-red-500">Failed to load resources.</p>'; }
}

window.addResource = async () => {
  const name = prompt("Resource name (e.g., 'Family Car', 'Meeting Room'):");
  if (!name) return;
  const icon = prompt("Emoji icon (e.g., 🚗, 🏢, 🍳):", "🔑") || "🔑";
  await apiFetch('/api/calendar/resources', { method: 'POST', body: JSON.stringify({ name, icon, calendar_id: state.activeCalendarId }) });
  loadResources();
};

window.openBooking = (id, name) => {
  const title = prompt(`What are you doing with the ${name}? (e.g., 'Drive to work')`);
  if (!title) return;
  
  // Default to today, next hour
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 60 * 60000); // 1 hour block
  
  // You could replace this prompt with a nice modal, but this keeps it fast
  apiFetch(`/api/calendar/resources/${id}/bookings`, {
    method: 'POST',
    body: JSON.stringify({ title, start_at: start.getTime(), end_at: end.getTime() })
  }).then(() => {
    alert(`✅ Booked ${name} for 1 hour starting at ${start.toLocaleTimeString()}`);
    loadResources();
  }).catch(err => {
    alert(`❌ Booking failed: ${err.message}`);
  });
};

window.viewBookings = async (id, name) => {
  const res = await apiFetch(`/api/calendar/resources/${id}/bookings`);
  if (!res.bookings.length) return alert(`No bookings for ${name} yet.`);
  
  const txt = res.bookings.map(b => {
    const s = new Date(b.start_at).toLocaleString();
    return `• ${s}: ${b.title} (by ${b.user_name || 'User'})`;
  }).join('\\n');
  
  alert(`Bookings for ${name}:\\n\\n${txt}`);
};

// Hook into tab activation
const originalActivateTabResources = window.activateTab;
window.activateTab = async (name) => {
  await originalActivateTabResources(name);
  if (name === 'resources') loadResources();
};


// ===== FUNNEL: Handle ?plan= params =====
setTimeout(() => {
  const urlParams = new URLSearchParams(window.location.search);
  const plan = urlParams.get('plan');
  if (plan) {
    const token = getToken();
    if (!token) {
      // Not logged in? Send to login, preserving the intent
      window.location.href = '/login/?plan=' + plan;
      return;
    }
    // Logged in? Trigger upgrade automatically
    const btn = document.getElementById('upgradeBtn');
    if (btn) {
      if (plan === 'expert') {
        startCheckout('enterprise_monthly', btn);
      } else if (plan === 'pro') {
        // Show the plan selector modal by default
        btn.click();
      } else if (['pro_6month', 'pro_yearly', 'pro_lifetime', 'enterprise_monthly', 'enterprise_yearly'].includes(plan)) {
        startCheckout(plan, btn);
      } else {
        btn.click();
      }
    }
  }
}, 600);


// ===== MAGIC AUTO-FILL & AI DRAFT LOGIC =====

// 1. Magic Auto-fill
document.getElementById('magicPromptBtn')?.addEventListener('click', () => {
  const prompt = document.getElementById('magicPromptInput').value.trim();
  if (!prompt) return;

  const btn = document.getElementById('magicPromptBtn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '⏳ Parsing...';

  // Simulate AI parsing delay
  setTimeout(() => {
    // Extract Location (look for "at [location]" or "in [location]")
    let location = '';
    const locMatch = prompt.match(/\b(?:at|in)\s+([^.,]+)/i);
    if (locMatch) location = locMatch[1].trim();

    // Extract Title (look for "invite to [title]" or "for [title]")
    let title = '';
    const titleMatch = prompt.match(/(?:invite\s+(?:to|for)|write\s+(?:an\s+)?invite\s+to)\s+([^.,]+?)(?:\s+on|\s+at|$)/i);
    if (titleMatch) {
      title = titleMatch[1].trim();
      // Capitalize first letter
      title = title.charAt(0).toUpperCase() + title.slice(1);
    }

    // Populate fields
    if (title) document.getElementById('newEventTitle').value = title;
    if (location) document.getElementById('addLocation').value = location;

    // Generate Description
    const desc = `Hey everyone! 👋\n\nYou're invited to ${title || 'our event'}!\n\n📍 Location: ${location || 'TBD'}\n\nLet me know if you can make it. Looking forward to seeing you there!`;
    document.getElementById('addDescription').value = desc;

    btn.innerHTML = '✅ Filled!';
    setTimeout(() => btn.innerHTML = originalText, 2000);
  }, 800);
});

// 2. AI Assistant Draft (Reads the form fields)
document.getElementById('aiDraftBtn')?.addEventListener('click', () => {
  const title = document.getElementById('newEventTitle').value.trim();
  const location = document.getElementById('addLocation').value.trim();
  const time = document.getElementById('newEventTime').value;
  
  if (!title) { alert('Please enter a title first.'); return; }

  const btn = document.getElementById('aiDraftBtn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '⏳ Writing...';

  setTimeout(() => {
    // Check for themes to change the tone
    let tone = "Hey everyone! 👋";
    if (title.toLowerCase().includes('birthday')) tone = "🎉 You're invited to a birthday celebration!";
    if (title.toLowerCase().includes('wedding')) tone = "💍 Join us for a beautiful wedding!";
    if (title.toLowerCase().includes('meeting') || title.toLowerCase().includes('work')) tone = "Hi team,";

    const desc = `${tone}\n\nJust a reminder about ${title}.\n\n📍 Where: ${location || 'TBD'}\n⏰ When: ${time || 'TBD'}\n\nPlease RSVP so we can plan accordingly.`;
    
    document.getElementById('addDescription').value = desc;
    btn.innerHTML = originalText;
  }, 1000);
});


// ===== MOBILE SWIPE =====
let touchStartX = 0;
let touchEndX = 0;
document.addEventListener('DOMContentLoaded', () => {
  const wrapper = document.querySelector('.calendar-grid') || document.querySelector('main');
  if (wrapper) {
    wrapper.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; }, {passive: true});
    wrapper.addEventListener('touchend', e => {
      touchEndX = e.changedTouches[0].screenX;
      if (touchEndX < touchStartX - 50) { current.setMonth(current.getMonth() + 1); renderGrid(); } // Swipe left
      if (touchEndX > touchStartX + 50) { current.setMonth(current.getMonth() - 1); renderGrid(); } // Swipe right
    }, {passive: true});
  }
});


// Listen for tab switches from main.js
document.addEventListener('switchTab', (e) => {
  const tab = e.detail.tab;
  if (tab === 'memos' && typeof loadMemos === 'function') loadMemos();
  if (tab === 'tasks' && typeof loadTasks === 'function') loadTasks();
  if (tab === 'calendars' && typeof loadCalendars === 'function') loadCalendars();
  if (tab === 'insights' && typeof loadInsights === 'function') loadInsights();
});
