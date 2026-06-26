/**
 * cloudflare-save-proxy.js  — SAME-ORIGIN SAVE RELAY (root fix for blocked saves)
 *
 * PROBLEM THIS SOLVES
 *   Some learners' environments (privacy/ad-block extensions, corporate or
 *   school networks, VPNs) drop the browser's cross-origin request to
 *   `script.google.com` — so their completed work never reaches the GAS
 *   backend, even though login (a tiny request) still works. Symptom seen
 *   with 前田様: reads OK, large writes (answers / recordings) silently
 *   dropped, history "reverts".
 *
 * WHY A RELAY FIXES IT
 *   Blockers key on the DESTINATION DOMAIN (`script.google.com` / `*.google.com`).
 *   If the browser instead talks to YOUR OWN domain
 *   (e.g. https://api.tckworkshop.co.jp/...), the request is not on any
 *   blocklist, so it goes through. This Worker receives that request and
 *   forwards it to GAS server-to-server (Cloudflare → Google is not subject
 *   to the learner's extensions / network filter). The audio/answers then
 *   land in the sheet as usual.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * DEPLOY (one time)
 *   1. Cloudflare Dashboard → Workers & Pages → Create Worker. Paste this file.
 *   2. Set GAS_EXEC_URL below to the SAME value as API_URL in js/api.js.
 *   3. Add a route on YOUR domain, e.g.:
 *        Route:  api.tckworkshop.co.jp/*        (or  apps.tckworkshop.co.jp/save/*)
 *      Workers → your worker → Triggers → Add Custom Domain / Route.
 *   4. Confirm: open  https://api.tckworkshop.co.jp/?action=ping  → should
 *      reach GAS (or return GAS's response). CORS headers are added below.
 *   5. In js/api.js set  SAVE_PROXY_URL = 'https://api.tckworkshop.co.jp/';
 *      (frontend already falls back to direct GAS if the proxy is empty or
 *      errors, so deploying the Worker first then flipping the constant is safe.)
 *
 * SECURITY
 *   This relay is a dumb forwarder: it carries the same params the app
 *   already sends (userId/pass are validated by GAS, exactly as today). It
 *   adds no new trust — it only changes the network path. No secrets are
 *   stored here. CORS is permissive because requests carry no cookies
 *   (credentials are in the body, validated server-side by GAS).
 * ──────────────────────────────────────────────────────────────────────────
 */

const GAS_EXEC_URL = 'https://script.google.com/macros/s/AKfycbwjI8n86Cu1ar1IsPffyq9mboDrUNpG-SsVpFtURjP6AmCFHD3Zbw5_qcJJUksz_UDyyw/exec';

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '*';

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    try {
      const inUrl = new URL(request.url);
      // Forward the query string (GET-style actions: getMyHistory, etc.)
      const target = GAS_EXEC_URL + (inUrl.search || '');

      const init = { method: request.method, redirect: 'follow' };
      if (request.method === 'POST') {
        // Pass the body + content-type straight through (form-urlencoded
        // saveAnswers / uploadRecording payloads, possibly large).
        init.body = await request.text();
        init.headers = {
          'Content-Type': request.headers.get('Content-Type') || 'application/x-www-form-urlencoded'
        };
      }

      const gasRes = await fetch(target, init);
      const body = await gasRes.text();

      // Preserve GAS's content-type (JSON / JSONP / text) and add CORS.
      const headers = corsHeaders(origin);
      headers['Content-Type'] = gasRes.headers.get('Content-Type') || 'text/plain; charset=utf-8';
      return new Response(body, { status: gasRes.status, headers });
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: 'proxy_error', detail: String(err) }), {
        status: 502,
        headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders(origin))
      });
    }
  }
};
