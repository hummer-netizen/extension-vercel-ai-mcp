export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      }});
    }
    const origin = env.ORIGIN_URL;
    if (!origin) return new Response('{"error":"no origin"}', { status: 503 });
    const resp = await fetch(`${origin}${url.pathname}${url.search}`, {
      method: request.method, headers: request.headers,
      body: request.method === "POST" ? request.body : undefined,
    });
    const newResp = new Response(resp.body, { status: resp.status, headers: resp.headers });
    newResp.headers.set("Access-Control-Allow-Origin", "*");
    return newResp;
  },
};
