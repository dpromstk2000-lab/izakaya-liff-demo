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
    // =========================
    // Health Check
    // =========================
    if (url.pathname === "/api/health" && request.method === "GET") {
      return jsonResponse({
        ok: true,
        service: "izakaya-pages-functions",
        message: "Pages Functions is working.",
        shopId: SHOP_ID,
        time: new Date().toISOString(),
      }, env);
    }

    // =========================
    // Public APIs
    // =========================
    if (url.pathname === "/api/public/status" && request.method === "GET") {
      return await getPublicStatus(env);
    }

    if (url.pathname === "/api/public/settings" && request.method === "GET") {
      return await getPublicSettings(env);
    }

    // =========================
    // Customer Reservation APIs
    // =========================
    if (url.pathname === "/api/reservations/create" && request.method === "POST") {
      return await createReservation(request, env);
    }

    if (url.pathname === "/api/reservations/my" && request.method === "GET") {
      return await getMyReservations(request, env);
    }

    // =========================
    // Admin APIs
    // =========================
    if (url.pathname === "/api/admin/day" && request.method === "GET") {
      return await getAdminDay(request, env, url);
    }

    if (url.pathname === "/api/admin/reservations/status" && request.method === "POST") {
      return await updateReservationStatus(request, env);
    }

    if (url.pathname === "/api/admin/shop-status" && request.method === "POST") {
      return await updateShopStatus(request, env);
    }

    return jsonResponse({
      ok: false,
      error: "Not found",
      path: url.pathname,
    }, env, 404);

  } catch (err) {
    console.error("API Error:", err);

    return jsonResponse({
      ok: false,
      error: err.message || "Internal error",
    }, env, 500);
  }
}

// =========================================================
// Common Helpers
// =========================================================

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

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new Error("JSONの形式が不正です");
  }
}

function requireEnv(env, key) {
  const value = env[key];

  if (!value) {
    throw new Error(`Pages環境変数 ${key} が未設定です`);
  }

  return value;
}

function requireAdmin(request, env) {
  const token = request.headers.get("X-Admin-Token");
  const expected = requireEnv(env, "ADMIN_TOKEN");

  if (!token || token !== expected) {
    throw new Error("管理者認証に失敗しました");
  }
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

async function verifyLineIdToken(env, idToken) {
  if (!idToken) {
    throw new Error("LINE IDトークンがありません");
  }

  const channelId = requireEnv(env, "LINE_CHANNEL_ID");

  const params = new URLSearchParams();
  params.set("id_token", idToken);
  params.set("client_id", channelId);

  const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error_description || data.error || "LINE IDトークン検証に失敗しました");
  }

  return {
    lineUserId: data.sub,
    lineName: data.name || "LINEユーザー",
    picture: data.picture || null,
  };
}

// =========================================================
// Public APIs
// =========================================================

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
    businessHours: businessHours || [],
    specialDays: specialDays || [],
  }, env);
}

// =========================================================
// Customer Reservation APIs
// =========================================================

async function createReservation(request, env) {
  const body = await readJson(request);

  const profile = await verifyLineIdToken(env, body.idToken);

  const result = await supabaseFetch(
    env,
    "/rest/v1/rpc/iz_demo_create_reservation",
    {
      method: "POST",
      body: JSON.stringify({
        p_shop_id: SHOP_ID,
        p_line_user_id: profile.lineUserId,
        p_line_name: profile.lineName,
        p_reserve_date: body.reserveDate,
        p_reserve_time: body.reserveTime,
        p_party_size: Number(body.partySize),
        p_seat_type: body.seatType || "any",
        p_preferences: Array.isArray(body.preferences) ? body.preferences : [],
        p_customer_note: body.customerNote || null,
      }),
    }
  );

  return jsonResponse({
    ok: true,
    profile,
    result: Array.isArray(result) ? result[0] : result,
  }, env);
}

async function getMyReservations(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const idToken = auth.startsWith("Bearer ") ? auth.slice(7) : null;

  const profile = await verifyLineIdToken(env, idToken);

  const lineUserId = encodeURIComponent(profile.lineUserId);

  const data = await supabaseFetch(
    env,
    `/rest/v1/iz_demo_reservations?shop_id=eq.${SHOP_ID}&line_user_id=eq.${lineUserId}&status=in.(pending,confirmed)&select=id,reserve_date,reserve_time,party_size,seat_type,preferences,status,customer_note,created_at,updated_at&order=reserve_date.asc&order=reserve_time.asc`
  );

  return jsonResponse({
    ok: true,
    profile,
    reservations: data || [],
  }, env);
}

// =========================================================
// Admin APIs
// =========================================================

async function getAdminDay(request, env, url) {
  requireAdmin(request, env);

  const date = url.searchParams.get("date");

  if (!date) {
    throw new Error("date が必要です");
  }

  const encodedDate = encodeURIComponent(date);

  const reservations = await supabaseFetch(
    env,
    `/rest/v1/iz_demo_reservations?shop_id=eq.${SHOP_ID}&reserve_date=eq.${encodedDate}&select=id,line_user_id,line_name,reserve_date,reserve_time,party_size,seat_type,preferences,status,source,customer_note,admin_note,cancel_reason,created_at,updated_at,customer:iz_demo_customers(status,memo,visit_count,no_show_count)&order=reserve_time.asc&order=created_at.asc`
  );

  const activeReservations = (reservations || []).filter((reservation) => {
    return ["pending", "confirmed"].includes(reservation.status);
  });

  const summary = {
    count: activeReservations.length,
    guests: activeReservations.reduce((sum, reservation) => {
      return sum + Number(reservation.party_size || 0);
    }, 0),
    pending: activeReservations.filter((reservation) => reservation.status === "pending").length,
    confirmed: activeReservations.filter((reservation) => reservation.status === "confirmed").length,
  };

  return jsonResponse({
    ok: true,
    date,
    summary,
    reservations: reservations || [],
  }, env);
}

async function updateReservationStatus(request, env) {
  requireAdmin(request, env);

  const body = await readJson(request);

  if (!body.reservationId) {
    throw new Error("reservationId が必要です");
  }

  if (!body.status) {
    throw new Error("status が必要です");
  }

  const allowedStatuses = [
    "pending",
    "confirmed",
    "cancelled_customer",
    "cancelled_shop",
    "completed",
    "no_show",
  ];

  if (!allowedStatuses.includes(body.status)) {
    throw new Error("不正な予約ステータスです");
  }

  const result = await supabaseFetch(
    env,
    "/rest/v1/rpc/iz_demo_update_reservation_status",
    {
      method: "POST",
      body: JSON.stringify({
        p_shop_id: SHOP_ID,
        p_reservation_id: body.reservationId,
        p_new_status: body.status,
        p_actor_id: body.actorId || "admin",
        p_reason: body.reason || null,
      }),
    }
  );

  return jsonResponse({
    ok: true,
    result: Array.isArray(result) ? result[0] : result,
  }, env);
}

async function updateShopStatus(request, env) {
  requireAdmin(request, env);

  const body = await readJson(request);

  if (!body.status) {
    throw new Error("status が必要です");
  }

  const allowedStatuses = [
    "open",
    "few",
    "full",
    "closed",
  ];

  if (!allowedStatuses.includes(body.status)) {
    throw new Error("不正な店舗ステータスです");
  }

  const result = await supabaseFetch(
    env,
    "/rest/v1/rpc/iz_demo_update_shop_status",
    {
      method: "POST",
      body: JSON.stringify({
        p_shop_id: SHOP_ID,
        p_status: body.status,
        p_message: body.message || null,
        p_actor_id: body.actorId || "admin",
      }),
    }
  );

  return jsonResponse({
    ok: true,
    result: Array.isArray(result) ? result[0] : result,
  }, env);
}
