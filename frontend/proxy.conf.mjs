// Middleware de sincronización de sesión única entre distintos navegadores (Chrome, Edge, Firefox, Incógnito)
const activeBrowserSessions = new Map();
const SESSION_TTL_MS = 20 * 1000;

export default {
  '/session-lock': {
    target: 'http://localhost:8080',
    secure: false,
    bypass(req, res) {
      const url = new URL(req.url || '/session-lock', 'http://localhost:4200');
      const action = url.searchParams.get('action') || 'check';
      const email = (url.searchParams.get('email') || '').trim().toLowerCase();
      const tabId = (url.searchParams.get('tabId') || '').trim();
      const now = Date.now();

      for (const [key, entry] of activeBrowserSessions.entries()) {
        if (now - entry.lastActiveAt >= SESSION_TTL_MS) {
          activeBrowserSessions.delete(key);
        }
      }

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');

      if (!email) {
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true }));
        return req.url || '/session-lock';
      }

      const current = activeBrowserSessions.get(email);

      if (action === 'claim') {
        if (current && current.tabId !== tabId && now - current.lastActiveAt < SESSION_TTL_MS) {
          res.statusCode = 409;
          res.end(
            JSON.stringify({
              status: 409,
              message:
                'No se puede iniciar sesión: esta cuenta ya tiene una sesión activa en este u otro navegador. Cierra la otra sesión primero.',
            }),
          );
          return req.url || '/session-lock';
        }
        activeBrowserSessions.set(email, { email, tabId, lastActiveAt: now });
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true }));
        return req.url || '/session-lock';
      }

      if (action === 'heartbeat') {
        if (current && current.tabId === tabId) {
          current.lastActiveAt = now;
          activeBrowserSessions.set(email, current);
        } else if (!current && tabId) {
          activeBrowserSessions.set(email, { email, tabId, lastActiveAt: now });
        }
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true }));
        return req.url || '/session-lock';
      }

      if (action === 'release') {
        if (!current || !tabId || current.tabId === tabId) {
          activeBrowserSessions.delete(email);
        }
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true }));
        return req.url || '/session-lock';
      }

      const locked = Boolean(current && current.tabId !== tabId && now - current.lastActiveAt < SESSION_TTL_MS);
      res.statusCode = locked ? 409 : 200;
      res.end(JSON.stringify({ locked }));
      return req.url || '/session-lock';
    },
  },
};
