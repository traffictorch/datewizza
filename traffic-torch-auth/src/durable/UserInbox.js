// ============================================================
// UserInbox Durable Object
// One instance per user ID. Handles WebSocket connections.
// Uses WebSocket Hibernation so idle users cost $0.
// Phase 3: typing indicator relay (ephemeral, no persistence)
// ============================================================

export class UserInbox {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/push') {
      let body;
      try { body = await request.json(); } catch { return new Response('Bad JSON', { status: 400 }); }
      const payload = JSON.stringify(body);
      let delivered = 0;
      for (const ws of this.state.getWebSockets()) {
        try { ws.send(payload); delivered++; }
        catch {}
      }
      return Response.json({ ok: true, delivered });
    }

    if (url.pathname === '/ping') {
      return Response.json({
        ok: true,
        sessions: this.state.getWebSockets().length,
        id: this.state.id.toString()
      });
    }

    const upgrade = (request.headers.get('Upgrade') || '').toLowerCase();
    if (upgrade === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.state.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('Not found', { status: 404 });
  }

  async webSocketMessage(ws, message) {
    try {
      const data = JSON.parse(message);

      if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', t: Date.now() }));
        return;
      }

      if (data.type === 'typing') {
        const myUserId = parseInt(this.state.id.name, 10);
        const toId = parseInt(data.to_user_id, 10);
        if (!myUserId || !toId || toId === myUserId) return;
        if (!this.env.USER_INBOX) return;

        // Fire-and-forget forward to the recipient's DO.
        // No DB write — typing is ephemeral and must never persist.
        try {
          const doId = this.env.USER_INBOX.idFromName(String(toId));
          const stub = this.env.USER_INBOX.get(doId);
          await stub.fetch('https://do/push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'typing',
              from_user_id: myUserId,
              active: data.active !== false
            })
          });
        } catch (e) {
          // Silent — typing failures are invisible to the user by design
        }
        return;
      }
    } catch {}
  }

  async webSocketClose(ws, code, reason, wasClean) {}
  async webSocketError(ws, error) {}
}