const API_HEADERS = {
  "cache-control": "no-store, private",
  "content-type": "application/json; charset=utf-8",
} as const;

export function handleRequest(request: Request): Response {
  const { pathname } = new URL(request.url);
  if (pathname === "/api/v1/health") {
    return new Response(JSON.stringify({ contractVersion: 1, status: "ok" }), {
      headers: API_HEADERS,
      status: 200,
    });
  }
  return new Response(JSON.stringify({ error: { code: "not_found" } }), {
    headers: API_HEADERS,
    status: 404,
  });
}
