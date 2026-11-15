// assets is injected by scripts/build-worker.mjs; no runtime credentials are embedded.
const BACKEND = 'https://picme-ai.onrender.com';
const publicPaths = /^\/api\/(?:styles(?:\/[a-z0-9-]+)?|collections|home\/config|app-config\/watermark)$/;
const privatePaths = /^\/api\/(?:auth\/(?:login|register|google|refresh|logout|me|forgot-password)|profile\/(?:style-preference|appearance|photo)|me\/(?:favorites(?:\/[a-z0-9-]+)?|credit-history|purchases)|generations(?:\/(?:gallery|by-key\/[a-zA-Z0-9_-]+|[a-f0-9]{24}(?:\/(?:result|thumbnail|viewed))?))?|generate|feedback)$/;
const csp = "default-src 'self'; script-src 'self' https://accounts.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://res.cloudinary.com https://*.googleusercontent.com; connect-src 'self' https://picme-ai.onrender.com https://res.cloudinary.com https://accounts.google.com; frame-src https://accounts.google.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      if (!publicPaths.test(url.pathname) && !privatePaths.test(url.pathname)) return new Response('Not found', { status: 404 });
      const origin = request.headers.get('Origin');
      if (origin && origin !== url.origin) return new Response('Origin not allowed', { status: 403 });
      if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return new Response('Method not allowed', { status: 405 });
      const headers = new Headers();
      for (const name of ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Generation-Recovery', 'Accept', 'User-Agent']) {
        const value = request.headers.get(name); if (value) headers.set(name, value);
      }
      try {
        // Fixed upstream and allowlisted endpoints: never a general-purpose URL proxy.
        const response = await fetch(`${BACKEND}${url.pathname}${url.search}`, { method: request.method, headers, body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body, redirect: 'manual' });
        const output = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        for (const name of ['Content-Type', 'Retry-After']) { const value = response.headers.get(name); if (value) output.set(name, value); }
        return new Response(response.body, { status: response.status, headers: output });
      } catch { return Response.json({ error: 'Madds is temporarily unavailable. Please try again.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
    }
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 });
    const asset = assets[url.pathname === '/' ? '/index.html' : url.pathname] || (!/\.[a-z0-9]+$/i.test(url.pathname) ? assets['/index.html'] : null);
    if (!asset) return new Response('Not found', { status: 404 });
    const immutable = /\/assets\/index-[a-zA-Z0-9_-]+\.(?:js|css)$/.test(url.pathname);
    const headers = { 'Content-Type': asset.type, 'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache', 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Opener-Policy': 'same-origin-allow-popups', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' };
    const bytes = Uint8Array.from(atob(asset.body), character => character.charCodeAt(0));
    return new Response(request.method === 'HEAD' ? null : bytes, { headers });
  }
};
