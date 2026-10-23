// ============================================================
// UserInbox Durable Object
// One instance per user ID (idFromName(String(userId))).
// Handles WebSocket connections for real-time message delivery.
// Uses WebSocket Hibernation so idle users cost $0.
// ============================================================

export class UserInbox {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    // POST /push — worker tells us to broadcast a payload to this user's tabs
    if (request.method === 'POST' && url.pathname === '/push') {
      let body;
      try { body = await request.json(); } catch { return new Response('Bad JSON', { status: 400 }); }
      const payload = JSON.stringify(body);
      let delivered = 0;
      for (const ws of this.state.getWebSockets()) {
        try { ws.send(payload); delivered++; }
        catch { /* socket dead — CF cleans up */ }
      }
      return Response.json({ ok: true, delivered });
    }

    // GET /ping — health check
    if (url.pathname === '/ping') {
      return Response.json({
        ok: true,
        sessions: this.state.getWebSockets().length,
        id: this.state.id.toString()
      });
    }

    // WebSocket upgrade
    const upgrade = (request.headers.get('Upgrade') || '').toLowerCase();
    if (upgrade === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      // acceptWebSocket enables hibernation — the DO can sleep between messages
      this.state.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('Not found', { status: 404 });
  }

  // --- Hibernation API handlers ---

  async webSocketMessage(ws, message) {
    // Client sends { type: 'ping' } to keep connection alive
    try {
      const data = JSON.parse(message);
      if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', t: Date.now() }));
      }
    } catch { /* ignore malformed */ }
  }

  async webSocketClose(ws, code, reason, wasClean) {
    // Hibernation API removes the socket from state automatically
  }

  async webSocketError(ws, error) {
    // Same — no cleanup needed
  }
}