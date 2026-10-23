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
  if(!selectedDay) return;
  const title = document.getElementById('newEventTitle').value.trim();
  if(!title) return;
  const time = document.getElementById('newEventTime').value || '09:00';
  const dur = parseInt(document.getElementById('newEventDuration').value) || 60;
  const [h,min] = time.split(':').map(Number);
  const dateObj = new Date(selectedDay.y, selectedDay.m, selectedDay.d, h, min);
  
  const reminderOffset = parseInt(document.getElementById('newEventReminder').value) || -60;
  
  await apiFetch('/api/calendar/events', {
    method: 'POST',
    body: JSON.stringify({
      travel_mode: document.getElementById('addTravelMode')?.value || 'car',
      distance_km: parseFloat(document.getElementById('addDistance')?.value) || 0,
      is_public: document.getElementById('newEventPublic')?.checked || false, 
      title, 
      start_at: dateObj.getTime(), 
      duration_min: dur, 
      color: '#10b981', 
      calendar_id: state.activeCalendarId,
      reminders: [{ offset: reminderOffset, channel: 'email' }]
    })
  });
  await loadData(); renderSheetEvents(selectedDay.y, selectedDay.m, selectedDay.d); renderGrid();
  document.getElementById('newEventTitle').value = '';
}

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
  setTimeout(() => {
    if (!document.getElementById('upgradeBtn')) {
      const sidebar = document.querySelector('aside') || document.querySelector('.sidebar') || document.body;
      const btn = document.createElement('button');
      btn.id = 'upgradeBtn';
      btn.innerHTML = '✨ Upgrade to Pro';
      btn.className = 'mt-4 w-full bg-gradient-to-r from-amber-400 to-orange-500 text-white font-bold py-3 px-4 rounded-xl shadow-lg hover:scale-105 transition-transform';
      btn.onclick = async () => {
        try {
          btn.innerHTML = 'Loading...';
          const token = getToken();
          const res = await fetch('https://api.datewizza.com/api/upgrade', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan: 'pro_yearly' })
          });
          const data = await res.json();
          if (data.clientSecret) {
            // If you have Stripe.js loaded, it would mount here. 
            // For now, alert the secret to prove the backend works.
            alert('Stripe Session Created! Client Secret: ' + data.clientSecret.substring(0, 20) + '...');
          } else {
            alert('Error: ' + (data.error || 'Unknown'));
          }
        } catch(e) { alert('Fetch failed'); }
        btn.innerHTML = '✨ Upgrade to Pro';
      };
      sidebar.appendChild(btn);
    }
  }, 500);

  const h = (location.hash || '#calendar').replace('#','');
  activateTab(h);
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  renderWeekdayRow();
  renderGrid();
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

// Override activateTab to load memos when clicked
const originalActivateTab = activateTab;
window.activateTab = async (name) => {
  await originalActivateTab(name);
  if (name === 'memos') loadMemos();
};

// Theme & Menu logic (Replacing main.js)
document.getElementById('themeToggle').addEventListener('click', () => {
  const isDark = document.documentElement.classList.contains('dark');
  if (isDark) {
    document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', 'light');
    document.getElementById('themeToggle').textContent = '🌙';
  } else {
    document.documentElement.classList.add('dark');
    localStorage.setItem('theme', 'dark');
    document.getElementById('themeToggle').textContent = '☀️';
  }
});

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
