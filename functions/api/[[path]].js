export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  if (url.pathname === "/api/health") {
    return jsonResponse({
      ok: true,
      service: "izakaya-pages-functions",
      message: "Pages Functions is working.",
      time: new Date().toISOString()
    });
  }

  return jsonResponse({
    ok: false,
    error: "Not found",
    path: url.pathname
  }, 404);
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}
