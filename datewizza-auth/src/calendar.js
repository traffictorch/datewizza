import { verifyJWT } from './index.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}

async function getUserId(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return null;
  try {
    const payload = await verifyJWT(token, env.JWT_SECRET);
    return payload.userId || payload.sub || payload.id;
  } catch {
    return null;
  }
}

// Helper: Check if user has access to a calendar (Owner or Member)
async function checkAccess(env, userId, calendarId) {
  const { results } = await env.CALENDAR_DB.prepare(
    'SELECT id FROM calendars WHERE id = ? AND owner_id = ? UNION SELECT calendar_id FROM calendar_members WHERE calendar_id = ? AND user_id = ?'
  ).bind(calendarId, userId, calendarId, userId).all();
  return results.length > 0;
}

// Helper: Get user's primary calendar, or create one if they have none
async function getDefaultCalendar(env, userId) {
  const { results } = await env.CALENDAR_DB.prepare(
    'SELECT id FROM calendars WHERE owner_id = ? OR id IN (SELECT calendar_id FROM calendar_members WHERE user_id = ?) LIMIT 1'
  ).bind(userId, userId).all();
  
  if (results.length > 0) return results[0].id;
  
  const now = Date.now();
  const { meta } = await env.CALENDAR_DB.prepare(
    'INSERT INTO calendars (owner_id, name, color, is_default, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(userId, 'Personal', '#10b981', 1, now).run();
  return meta.last_row_id;
}

export async function handleCalendarRequest(request, env, url) {
  // BYPASS AUTH FOR PUBLIC EVENTS
  if (url.pathname === '/api/calendar/public-events' && request.method === 'GET') {
    const { results } = await env.CALENDAR_DB.prepare(
      'SELECT * FROM events WHERE is_public = 1 ORDER BY start_at ASC LIMIT 50'
    ).all();
    return json({ events: results });
  }

  const userId = await getUserId(request, env);
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  const path = url.pathname;

  // ── CALENDARS ──
  if (path === '/api/calendar/calendars' && request.method === 'GET') {
    const { results } = await env.CALENDAR_DB.prepare(`
      SELECT c.*, 
      CASE WHEN c.owner_id = ? THEN 'owner' ELSE 'member' END as role
      FROM calendars c
      LEFT JOIN calendar_members m ON c.id = m.calendar_id
      WHERE c.owner_id = ? OR m.user_id = ?
      GROUP BY c.id ORDER BY c.created_at ASC
    `).bind(userId, userId, userId).all();
    return json({ calendars: results });
  }

  if (path === '/api/calendar/calendars' && request.method === 'POST') {
    const body = await request.json();
    const now = Date.now();
    const { meta } = await env.CALENDAR_DB.prepare(
      'INSERT INTO calendars (owner_id, name, color, created_at) VALUES (?, ?, ?, ?)'
    ).bind(userId, body.name || 'New Calendar', body.color || '#3b82f6', now).run();
    return json({ id: meta.last_row_id, ...body }, 201);
  }

  const inviteMatch = path.match(/^\/api\/calendar\/calendars\/(\d+)\/invite$/);
  if (inviteMatch && request.method === 'POST') {
    const calId = parseInt(inviteMatch[1]);
    if (!(await checkAccess(env, userId, calId))) return json({ error: 'Forbidden' }, 403);
    const token = crypto.randomUUID();
    await env.CALENDAR_DB.prepare('UPDATE calendars SET invite_token = ? WHERE id = ?').bind(token, calId).run();
    return json({ invite_url: `https://datewizza-frontend.traffictorch.workers.dev/dashboard/?join=${token}` });
  }

  if (path === '/api/calendar/join' && request.method === 'POST') {
    const body = await request.json();
    if (!body.token) return json({ error: 'Token required' }, 400);
    
    const { results } = await env.CALENDAR_DB.prepare('SELECT id FROM calendars WHERE invite_token = ?').bind(body.token).all();
    if (!results.length) return json({ error: 'Invalid invite link' }, 404);
    
    const calId = results[0].id;
    const now = Date.now();
    await env.CALENDAR_DB.prepare(
      'INSERT OR IGNORE INTO calendar_members (calendar_id, user_id, added_at) VALUES (?, ?, ?)'
    ).bind(calId, userId, now).run();
    
    return json({ success: true, calendar_id: calId });
  }

  // ── EVENTS ──
  if (path === '/api/calendar/events' && request.method === 'GET') {
    const from = parseInt(url.searchParams.get('from') || '0');
    const to = parseInt(url.searchParams.get('to') || '9999999999999');
    const calId = parseInt(url.searchParams.get('calendar_id')) || await getDefaultCalendar(env, userId);
    if (!(await checkAccess(env, userId, calId))) return json({ error: 'Forbidden' }, 403);
    
    const { results } = await env.CALENDAR_DB.prepare(`
      SELECT id, title, start_at, duration_min, color, 'local' as type FROM events WHERE calendar_id = ? AND start_at >= ? AND start_at <= ?
      UNION ALL
      SELECT e.id, e.title, e.start_at, (e.end_at - e.start_at)/60000 as duration_min, '#8b5cf6' as color, 'external' as type 
      FROM external_events e JOIN calendar_feeds f ON e.feed_id = f.id WHERE f.calendar_id = ? AND e.start_at >= ? AND e.start_at <= ?
      ORDER BY start_at ASC
    `).bind(calId, from, to, calId, from, to).all();
    return json({ events: results });
  }

  if (path === '/api/calendar/events' && request.method === 'POST') {
    const body = await request.json();
    const calId = body.calendar_id ? parseInt(body.calendar_id) : await getDefaultCalendar(env, userId);
    if (!(await checkAccess(env, userId, calId))) return json({ error: 'Forbidden' }, 403);
    
    const now = Date.now();
    const { meta } = await env.CALENDAR_DB.prepare(
      `INSERT INTO events (
        calendar_id, created_by, title, start_at, duration_min, timezone, 
        location, notes, tag, purpose, cost_estimate_cents, co2_grams, 
        travel_mode, distance_km, status, color, is_public, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?)`
    ).bind(
      calId, userId, body.title, body.start_at, body.duration_min || 30, body.timezone || 'UTC', 
      body.location || null, body.notes || null, body.tag || null, body.purpose || 'custom', body.cost_estimate_cents || 0, body.co2_grams || 0, 
      body.travel_mode || 'car', body.distance_km || 0, body.color || '#10b981', body.is_public ? 1 : 0, now, now
    ).run();
    
    // Default to 60 mins before if no custom reminders provided
    const reminders = body.reminders || [{ offset: -60, channel: 'email' }];
    
    for (const r of reminders) {
      await env.CALENDAR_DB.prepare(
        'INSERT INTO reminders (event_id, offset_min, channel) VALUES (?, ?, ?)'
      ).bind(meta.last_row_id, r.offset, r.channel || 'email').run();
    }
    
    
    // ===== MAILCHANNELS INVITE LOGIC =====
    if (body.invitees && body.invitees.length > 0) {
      const emailPromises = body.invitees.map(email => {
        // Ignore phone numbers for now (needs Twilio), only send to valid emails
        if (!email.includes('@')) return Promise.resolve(); 

        const emailPayload = {
          personalizations: [{ to: [{ email: email }] }],
          from: { email: "hello@datewizza.com", name: "DateWizza" },
          subject: `You're invited: ${body.title || 'New Event'}`,
          content: [{
            type: "text/html",
            value: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="color: #10b981;">✨ You're invited!</h2>
                <h3>${body.title}</h3>
                <p><strong>When:</strong> ${new Date(body.date).toLocaleString()}</p>
                ${body.location ? `<p><strong>Where:</strong> ${body.location}</p>` : ''}
                ${body.notes ? `<p><strong>Details:</strong><br/>${body.notes}</p>` : ''}
                <br/>
                <a href="https://datewizza.com/e/${meta.last_row_id}" style="background: #10b981; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">View Event Page</a>
              </div>
            `
          }]
        };

        return fetch('https://api.mailchannels.net/tx/v1/send', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(emailPayload)
        });
      });

      // Fire and forget (don't block the response)
      Promise.all(emailPromises).catch(err => console.error('Mailer error:', err));
    }
    // ===== END MAILCHANNELS =====

    return json({ id: meta.last_row_id, ...body }, 201);
  }

  const eventMatch = path.match(/^\/api\/calendar\/events\/(\d+)$/);
  if (eventMatch && request.method === 'DELETE') {
    const evId = parseInt(eventMatch[1]);
    const { results } = await env.CALENDAR_DB.prepare('SELECT calendar_id FROM events WHERE id = ?').bind(evId).all();
    if (!results.length || !(await checkAccess(env, userId, results[0].calendar_id))) return json({ error: 'Forbidden' }, 403);
    
    await env.CALENDAR_DB.prepare('DELETE FROM events WHERE id = ?').bind(evId).run();
    return json({ success: true });
  }

  // ── TASKS (Similar logic) ──
  if (path === '/api/calendar/tasks' && request.method === 'GET') {
    const from = parseInt(url.searchParams.get('from') || '0');
    const to = parseInt(url.searchParams.get('to') || '9999999999999');
    const calId = parseInt(url.searchParams.get('calendar_id')) || await getDefaultCalendar(env, userId);
    if (!(await checkAccess(env, userId, calId))) return json({ error: 'Forbidden' }, 403);
    
    const { results } = await env.CALENDAR_DB.prepare(
      'SELECT * FROM tasks WHERE calendar_id = ? AND (due_at >= ? AND due_at <= ?) ORDER BY due_at ASC'
    ).bind(calId, from, to).all();
    return json({ tasks: results });
  }

  if (path === '/api/calendar/tasks' && request.method === 'POST') {
    const body = await request.json();
    const calId = body.calendar_id ? parseInt(body.calendar_id) : await getDefaultCalendar(env, userId);
    if (!(await checkAccess(env, userId, calId))) return json({ error: 'Forbidden' }, 403);
    
    const now = Date.now();
    const { meta } = await env.CALENDAR_DB.prepare(
      'INSERT INTO tasks (calendar_id, created_by, title, due_at, effort_min, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(calId, userId, body.title, body.due_at || null, body.effort_min || null, now).run();
    return json({ id: meta.last_row_id, ...body }, 201);
  }

  const taskMatch = path.match(/^\/api\/calendar\/tasks\/(\d+)$/);
  if (taskMatch && request.method === 'PATCH') {
    const body = await request.json();
    const { results } = await env.CALENDAR_DB.prepare('SELECT calendar_id FROM tasks WHERE id = ?').bind(parseInt(taskMatch[1])).all();
    if (!results.length || !(await checkAccess(env, userId, results[0].calendar_id))) return json({ error: 'Forbidden' }, 403);
    
    await env.CALENDAR_DB.prepare('UPDATE tasks SET done = ? WHERE id = ?').bind(body.done ? 1 : 0, parseInt(taskMatch[1])).run();
    return json({ success: true });
  }

  if (taskMatch && request.method === 'DELETE') {
    const { results } = await env.CALENDAR_DB.prepare('SELECT calendar_id FROM tasks WHERE id = ?').bind(parseInt(taskMatch[1])).all();
    if (!results.length || !(await checkAccess(env, userId, results[0].calendar_id))) return json({ error: 'Forbidden' }, 403);
    await env.CALENDAR_DB.prepare('DELETE FROM tasks WHERE id = ?').bind(parseInt(taskMatch[1])).run();
    return json({ success: true });
  }

  // ── INSIGHTS ──
  if (path === '/api/calendar/insights' && request.method === 'GET') {
    const calId = parseInt(url.searchParams.get('calendar_id')) || await getDefaultCalendar(env, userId);
    if (!(await checkAccess(env, userId, calId))) return json({ error: 'Forbidden' }, 403);

    const start = parseInt(url.searchParams.get('from') || '0');
    const end = parseInt(url.searchParams.get('to') || '9999999999999');
    const { results: events } = await env.CALENDAR_DB.prepare(
      'SELECT * FROM events WHERE calendar_id = ? AND start_at >= ? AND start_at <= ? ORDER BY start_at ASC'
    ).bind(calId, start, end).all();

    // Load emission factors
    const { results: factorRows } = await env.CALENDAR_DB.prepare(
      'SELECT mode, co2_g_per_km, cost_per_km FROM emission_factors'
    ).all();
    const factors = {};
    (factorRows || []).forEach(f => { factors[f.mode] = f; });
    const carFactor = factors.car || { co2_g_per_km: 170, cost_per_km: 0.28 };

    let totalCostCents = 0, totalCo2Grams = 0, loadScore = 0;
    let totalKm = 0, eventsWithDistance = 0, eventsWithoutDistance = 0;
    let savedCo2Grams = 0, savedCents = 0, notDrivenKm = 0;
    const byMode = {};
    const suggestions = [], days = {};

    events.forEach(e => {
      totalCostCents += (e.cost_estimate_cents || 0);
      totalCo2Grams += (e.co2_grams || 0);
      const dayStr = new Date(e.start_at).toDateString();
      if (!days[dayStr]) days[dayStr] = [];
      days[dayStr].push(e);

      const mode = e.travel_mode || 'car';
      const km = parseFloat(e.distance_km) || 0;
      const factor = factors[mode] || carFactor;

      if (!byMode[mode]) byMode[mode] = { km: 0, co2Kg: 0, eur: 0, count: 0 };
      byMode[mode].count += 1;

      if (km > 0) {
        eventsWithDistance += 1;
        totalKm += km;
        byMode[mode].km += km;
        byMode[mode].co2Kg += (km * factor.co2_g_per_km) / 1000;
        byMode[mode].eur += km * factor.cost_per_km;

        if (mode !== 'car') {
          savedCo2Grams += km * (carFactor.co2_g_per_km - factor.co2_g_per_km);
          savedCents += km * (carFactor.cost_per_km - factor.cost_per_km) * 100;
          notDrivenKm += km;
        }
      } else {
        eventsWithoutDistance += 1;
      }
    });

    // Load score + basic trip merge suggestions (unchanged behaviour)
    Object.keys(days).forEach(dayStr => {
      const dayEvents = days[dayStr];
      let dayLoad = dayEvents.length;
      for (let i = 1; i < dayEvents.length; i++) {
        if (dayEvents[i-1].location !== dayEvents[i].location) dayLoad += 2;
      }
      loadScore += dayLoad;
      if (dayEvents.length >= 2) {
        suggestions.push({
          type: 'trip_merge',
          day: dayStr,
          message: 'You have ' + dayEvents.length + ' events on ' + dayStr + '. Merge these trips to save fuel.',
          savings: '~30 mins / €4'
        });
      }
    });

    // Trip merge potential: same day + same location = redundant round-trips
    const groups = {};
    events.forEach(e => {
      const km = parseFloat(e.distance_km) || 0;
      if (!e.location || km <= 0) return;
      const dayStr = new Date(e.start_at).toDateString();
      const key = dayStr + '::' + e.location;
      if (!groups[key]) groups[key] = { day: dayStr, location: e.location, events: [] };
      groups[key].events.push({
        id: e.id, title: e.title, start_at: e.start_at,
        distance_km: km, travel_mode: e.travel_mode || 'car'
      });
    });

    let potentialCo2Grams = 0, potentialCents = 0;
    const tripMergeGroups = [];
    Object.values(groups).forEach(g => {
      if (g.events.length < 2) return;
      const redundant = g.events.length - 1;
      const avgKm = g.events.reduce((s, e) => s + e.distance_km, 0) / g.events.length;
      const savedKm = redundant * avgKm * 2;
      potentialCo2Grams += savedKm * carFactor.co2_g_per_km;
      potentialCents += savedKm * carFactor.cost_per_km * 100;
      tripMergeGroups.push(g);
    });

    return json({
      // Preserved fields (frontend already reads these)
      totalCost: totalCostCents / 100,
      co2Kg: totalCo2Grams / 1000,
      loadScore,
      suggestions,
      // New — Step 3 will surface these in the UI
      savings: {
        co2Kg: savedCo2Grams / 1000,
        eur: savedCents / 100,
        km: notDrivenKm
      },
      byMode,
      totals: {
        km: totalKm,
        events: events.length,
        eventsWithDistance,
        eventsWithoutDistance
      },
      tripMerge: {
        potentialCo2Kg: potentialCo2Grams / 1000,
        potentialEur: potentialCents / 100,
        groupCount: tripMergeGroups.length,
        groups: tripMergeGroups.slice(0, 10)
      }
    });
  }

  // ── EVENT COMMENTS ──
  const commentMatch = path.match(/^\/api\/calendar\/events\/(\d+)\/comments$/);
  if (commentMatch) {
    const evId = parseInt(commentMatch[1]);
    const { results: ev } = await env.CALENDAR_DB.prepare('SELECT calendar_id FROM events WHERE id = ?').bind(evId).all();
    if (!ev.length || !(await checkAccess(env, userId, ev[0].calendar_id))) return json({ error: 'Forbidden' }, 403);

    if (request.method === 'GET') {
      const { results } = await env.CALENDAR_DB.prepare(`
        SELECT c.*, u.name as user_name 
        FROM event_comments c 
        LEFT JOIN users u ON c.user_id = u.id 
        WHERE c.event_id = ? ORDER BY c.created_at ASC
      `).bind(evId).all();
      return json({ comments: results });
    }

    if (request.method === 'POST') {
      const body = await request.json();
      if (!body.body) return json({ error: 'Message required' }, 400);
      const { meta } = await env.CALENDAR_DB.prepare(
        'INSERT INTO event_comments (event_id, user_id, body, created_at) VALUES (?, ?, ?, ?)'
      ).bind(evId, userId, body.body, Date.now()).run();
      return json({ id: meta.last_row_id, body: body.body }, 201);
    }
  }

  // ── FIND A TIME ──
  if (path === '/api/calendar/find-time' && request.method === 'GET') {
    const calId = parseInt(url.searchParams.get('calendar_id')) || await getDefaultCalendar(env, userId);
    if (!(await checkAccess(env, userId, calId))) return json({ error: 'Forbidden' }, 403);
    
    const dateStr = url.searchParams.get('date'); // YYYY-MM-DD
    const dur = parseInt(url.searchParams.get('duration') || '60');
    if (!dateStr) return json({ error: 'Date required' }, 400);

    const startOfDay = new Date(dateStr + 'T00:00:00').getTime();
    const endOfDay = startOfDay + 86400000;

    const { results: events } = await env.CALENDAR_DB.prepare(
      'SELECT start_at, duration_min FROM events WHERE calendar_id = ? AND start_at >= ? AND start_at < ? ORDER BY start_at ASC'
    ).bind(calId, startOfDay, endOfDay).all();

    // Working hours: 8 AM to 8 PM
    const workStart = new Date(dateStr + 'T08:00:00').getTime();
    const workEnd = new Date(dateStr + 'T20:00:00').getTime();
    
    let freeSlots = [];
    let currentPointer = workStart;

    events.forEach(e => {
      const evStart = e.start_at;
      const evEnd = evStart + (e.duration_min * 60000);
      
      if (evStart > currentPointer) {
        const gap = evStart - currentPointer;
        if (gap >= dur * 60000) {
          freeSlots.push({ start: currentPointer, end: evStart });
        }
      }
      if (evEnd > currentPointer) currentPointer = evEnd;
    });

    if (currentPointer < workEnd) {
      const gap = workEnd - currentPointer;
      if (gap >= dur * 60000) {
        freeSlots.push({ start: currentPointer, end: workEnd });
      }
    }

    return json({ slots: freeSlots.slice(0, 3) });
  }

  // ── MEMOS ──
  if (path === '/api/calendar/memos' && request.method === 'GET') {
    const calId = parseInt(url.searchParams.get('calendar_id')) || await getDefaultCalendar(env, userId);
    if (!(await checkAccess(env, userId, calId))) return json({ error: 'Forbidden' }, 403);
    const { results } = await env.CALENDAR_DB.prepare(
      'SELECT * FROM memos WHERE calendar_id = ? ORDER BY created_at DESC'
    ).bind(calId).all();
    return json({ memos: results });
  }

  if (path === '/api/calendar/memos' && request.method === 'POST') {
    const body = await request.json();
    const calId = body.calendar_id ? parseInt(body.calendar_id) : await getDefaultCalendar(env, userId);
    if (!(await checkAccess(env, userId, calId))) return json({ error: 'Forbidden' }, 403);
    const { meta } = await env.CALENDAR_DB.prepare(
      'INSERT INTO memos (calendar_id, created_by, title, created_at) VALUES (?, ?, ?, ?)'
    ).bind(calId, userId, body.title, Date.now()).run();
    return json({ id: meta.last_row_id, title: body.title }, 201);
  }

  const memoMatch = path.match(/^\/api\/calendar\/memos\/(\d+)$/);
  if (memoMatch && request.method === 'DELETE') {
    const memoId = parseInt(memoMatch[1]);
    const { results } = await env.CALENDAR_DB.prepare('SELECT calendar_id FROM memos WHERE id = ?').bind(memoId).all();
    if (!results.length || !(await checkAccess(env, userId, results[0].calendar_id))) return json({ error: 'Forbidden' }, 403);
    await env.CALENDAR_DB.prepare('DELETE FROM memos WHERE id = ?').bind(memoId).run();
    return json({ success: true });
  }

  // ── ICAL SYNC ──
  function parseICS(icsText) {
    const events = [];
    const blocks = icsText.split('BEGIN:VEVENT');
    for (let i = 1; i < blocks.length; i++) {
      const block = blocks[i].split('END:VEVENT')[0];
      const getVal = (key) => {
        const match = block.match(new RegExp(key + '(?:;[^:]*)?:([^\\r\\n]+)'));
        return match ? match[1].trim() : null;
      };
      const summary = getVal('SUMMARY');
      const dtstart = getVal('DTSTART');
      const dtend = getVal('DTEND');
      const uid = getVal('UID');

      if (summary && dtstart) {
        const parseDate = (str) => {
          if (!str) return null;
          const y = str.slice(0,4), m = str.slice(4,6)-1, d = str.slice(6,8);
          const h = str.slice(9,11) || '00', min = str.slice(11,13) || '00', s = str.slice(13,15) || '00';
          return new Date(Date.UTC(y, m, d, h, min, s)).getTime();
        };
        events.push({
          id: uid || Math.random().toString(36),
          title: summary.replace(/\\,/g, ','),
          start_at: parseDate(dtstart),
          end_at: parseDate(dtend)
        });
      }
    }
    return events;
  }

  if (path === '/api/calendar/feeds/sync' && request.method === 'POST') {
    const body = await request.json();
    const calId = body.calendar_id ? parseInt(body.calendar_id) : await getDefaultCalendar(env, userId);
    if (!(await checkAccess(env, userId, calId))) return json({ error: 'Forbidden' }, 403);

    try {
      const icsRes = await fetch(body.url);
      if (!icsRes.ok) throw new Error('Failed to fetch URL');
      const icsText = await icsRes.text();
      const parsedEvents = parseICS(icsText);

      // Create the feed
      const now = Date.now();
      const { meta } = await env.CALENDAR_DB.prepare(
        'INSERT INTO calendar_feeds (calendar_id, url, created_at) VALUES (?, ?, ?)'
      ).bind(calId, body.url, now).run();
      const feedId = meta.last_row_id;

      // Insert events
      if (parsedEvents.length > 0) {
        const stmt = env.CALENDAR_DB.prepare(
          'INSERT OR REPLACE INTO external_events (id, feed_id, title, start_at, end_at) VALUES (?, ?, ?, ?, ?)'
        );
        const batch = parsedEvents.map(e => stmt.bind(e.id, feedId, e.title, e.start_at, e.end_at));
        await env.CALENDAR_DB.batch(batch);
      }

      return json({ success: true, feed_id: feedId, count: parsedEvents.length }, 201);
    } catch (err) {
      return json({ error: err.message }, 400);
    }
  }

  if (path === '/api/calendar/feeds' && request.method === 'GET') {
    const calId = parseInt(url.searchParams.get('calendar_id')) || await getDefaultCalendar(env, userId);
    if (!(await checkAccess(env, userId, calId))) return json({ error: 'Forbidden' }, 403);
    const { results } = await env.CALENDAR_DB.prepare(
      'SELECT * FROM calendar_feeds WHERE calendar_id = ?'
    ).bind(calId).all();
    return json({ feeds: results });
  }

  const feedMatch = path.match(/^\/api\/calendar\/feeds\/(\d+)$/);
  if (feedMatch && request.method === 'DELETE') {
    const feedId = parseInt(feedMatch[1]);
    const { results } = await env.CALENDAR_DB.prepare(
      'SELECT calendar_id FROM calendar_feeds WHERE id = ?'
    ).bind(feedId).all();
    if (!results.length || !(await checkAccess(env, userId, results[0].calendar_id))) return json({ error: 'Forbidden' }, 403);
    
    await env.CALENDAR_DB.prepare('DELETE FROM calendar_feeds WHERE id = ?').bind(feedId).run();
    return json({ success: true });
  }


  if (path === '/api/calendar/public-events' && request.method === 'GET') {
    const now = Date.now() - 86400000; // Include yesterday onwards
    const { results } = await env.CALENDAR_DB.prepare(`
      SELECT e.id, e.title, e.start_at, e.duration_min, e.color, e.location, e.notes, c.name as calendar_name
      FROM events e 
      JOIN calendars c ON e.calendar_id = c.id 
      WHERE e.is_public = 1 AND e.start_at >= ? 
      ORDER BY e.start_at ASC LIMIT 50
    `).bind(now).all();
    return json({ events: results });
  }


  // ── RESOURCES ──
  if (path === '/api/calendar/resources' && request.method === 'GET') {
    const calId = parseInt(url.searchParams.get('calendar_id')) || await getDefaultCalendar(env, userId);
    if (!(await checkAccess(env, userId, calId))) return json({ error: 'Forbidden' }, 403);
    const { results } = await env.CALENDAR_DB.prepare('SELECT * FROM resources WHERE calendar_id = ? ORDER BY created_at ASC').bind(calId).all();
    return json({ resources: results });
  }

  if (path === '/api/calendar/resources' && request.method === 'POST') {
    const body = await request.json();
    const calId = body.calendar_id ? parseInt(body.calendar_id) : await getDefaultCalendar(env, userId);
    if (!(await checkAccess(env, userId, calId))) return json({ error: 'Forbidden' }, 403);
    const { meta } = await env.CALENDAR_DB.prepare('INSERT INTO resources (calendar_id, name, icon, created_at) VALUES (?, ?, ?, ?)')
      .bind(calId, body.name, body.icon || '🔑', Date.now()).run();
    return json({ id: meta.last_row_id, name: body.name, icon: body.icon }, 201);
  }

  const resourceMatch = path.match(/^\/api\/calendar\/resources\/(\d+)\/bookings$/);
  if (resourceMatch) {
    const resId = parseInt(resourceMatch[1]);
    const { results: res } = await env.CALENDAR_DB.prepare('SELECT calendar_id FROM resources WHERE id = ?').bind(resId).all();
    if (!res.length || !(await checkAccess(env, userId, res[0].calendar_id))) return json({ error: 'Forbidden' }, 403);

    if (request.method === 'GET') {
      const { results } = await env.CALENDAR_DB.prepare('SELECT b.*, u.name as user_name FROM resource_bookings b LEFT JOIN users u ON b.user_id = u.id WHERE b.resource_id = ? ORDER BY b.start_at ASC').bind(resId).all();
      return json({ bookings: results });
    }

    if (request.method === 'POST') {
      const body = await request.json();
      // Conflict check
      const { results: conflicts } = await env.CALENDAR_DB.prepare(
        'SELECT id FROM resource_bookings WHERE resource_id = ? AND start_at < ? AND end_at > ?'
      ).bind(resId, body.end_at, body.start_at).all();
      
      if (conflicts.length > 0) return json({ error: 'Time slot overlaps with an existing booking' }, 409);

      const { meta } = await env.CALENDAR_DB.prepare('INSERT INTO resource_bookings (resource_id, user_id, title, start_at, end_at, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(resId, userId, body.title, body.start_at, body.end_at, Date.now()).run();
      return json({ id: meta.last_row_id, ...body }, 201);
    }
  }

  const bookingMatch = path.match(/^\/api\/calendar\/bookings\/(\d+)$/);
  if (bookingMatch && request.method === 'DELETE') {
    await env.CALENDAR_DB.prepare('DELETE FROM resource_bookings WHERE id = ? AND user_id = ?').bind(parseInt(bookingMatch[1]), userId).run();
    return json({ success: true });
  }

  return json({ error: 'Not found' }, 404);
}
