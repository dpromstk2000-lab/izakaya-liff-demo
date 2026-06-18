const SHOP_ID = "11111111-1111-1111-1111-111111111111";

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(env),
    });
  }

  try {
    if (url.pathname === "/api/health" && request.method === "GET") {
      return jsonResponse({
        ok: true,
        service: "izakaya-pages-functions",
        message: "Pages Functions is working.",
        shopId: SHOP_ID,
        time: new Date().toISOString(),
      }, env);
    }

    if (url.pathname === "/api/public/status" && request.method === "GET") {
      return await getPublicStatus(env);
    }

    if (url.pathname === "/api/public/settings" && request.method === "GET") {
      return await getPublicSettings(env);
    }

    return jsonResponse({
      ok: false,
      error: "Not found",
      path: url.pathname,
    }, env, 404);

  } catch (err) {
    return jsonResponse({
      ok: false,
      error: err.message || "Internal error",
    }, env, 500);
  }
}

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Token",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonResponse(data, env, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      ...corsHeaders(env),
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function requireEnv(env, key) {
  const value = env[key];

  if (!value) {
    throw new Error(`Pages環境変数 ${key} が未設定です`);
  }

  return value;
}

async function supabaseFetch(env, path, options = {}) {
  const supabaseUrl = requireEnv(env, "SUPABASE_URL");
  const serviceKey = requireEnv(env, "SUPABASE_SERVICE_ROLE_KEY");

  const res = await fetch(`${supabaseUrl}${path}`, {
    ...options,
    headers: {
      "apikey": serviceKey,
      "Authorization": `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const message =
      data?.message ||
      data?.hint ||
      data?.details ||
      text ||
      `Supabase error: ${res.status}`;

    throw new Error(message);
  }

  return data;
}

async function getPublicStatus(env) {
  const data = await supabaseFetch(
    env,
    `/rest/v1/iz_demo_shop_status?shop_id=eq.${SHOP_ID}&select=status,message,updated_at`
  );

  return jsonResponse({
    ok: true,
    status: data?.[0] || null,
  }, env);
}

async function getPublicSettings(env) {
  const shop = await supabaseFetch(
    env,
    `/rest/v1/iz_demo_shops?id=eq.${SHOP_ID}&select=id,name,demo_key,timezone,booking_window_months,max_active_reservations_per_user,default_duration_minutes`
  );

  const businessHours = await supabaseFetch(
    env,
    `/rest/v1/iz_demo_business_hours?shop_id=eq.${SHOP_ID}&select=dow,is_closed,open_time,close_time,last_order_time,slot_interval_minutes,max_guests_per_slot,max_groups_per_slot,note&order=dow.asc`
  );

  const specialDays = await supabaseFetch(
    env,
    `/rest/v1/iz_demo_special_days?shop_id=eq.${SHOP_ID}&select=target_date,is_closed,open_time,close_time,last_order_time,slot_interval_minutes,max_guests_per_slot,max_groups_per_slot,note&order=target_date.asc`
  );

  return jsonResponse({
    ok: true,
    shop: shop?.[0] || null,
    businessHours,
    specialDays,
  }, env);
}
