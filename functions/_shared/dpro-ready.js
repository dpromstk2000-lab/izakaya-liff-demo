const DEMO_SHOP_ID = "11111111-1111-1111-1111-111111111111";

export const DPRO_READY = Object.freeze({
  systemCode: "IZAKAYA",
  adapterVersion: "DPRO-CONTROL-ADAPTER-1.0",
  workerVersion: "IZAKAYA-PR1-20260823",
  databaseVersion: "IZAKAYA-DB-PR1-20260823",
  frontendVersion: "IZAKAYA-PR1-20260823",
  demoShopId: DEMO_SHOP_ID,
});

function jsonHeaders(extra = {}) {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
    ...extra,
  };
}

export function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: jsonHeaders(extraHeaders),
  });
}

function normalizeEnvironment(value) {
  const v = String(value || "demo").trim().toLowerCase();
  if (v === "prod") return "production";
  if (v === "production") return "production";
  if (v === "staging") return "staging";
  if (v === "test") return "test";
  return "demo";
}

function normalizeFacilityCode(value) {
  return String(value || "").trim().toUpperCase();
}

export function getRuntimeIdentity(env) {
  const environment = normalizeEnvironment(env.DPRO_ENVIRONMENT);
  const facilityCode = normalizeFacilityCode(env.DPRO_FACILITY_CODE) ||
    (environment === "demo" ? "IZAKAYA-DEMO" : "");

  const productionGuard =
    environment !== "production" ||
    (
      facilityCode.length > 0 &&
      !facilityCode.includes("DEMO") &&
      String(env.DPRO_SHOP_ID || "").trim().length > 0 &&
      String(env.DPRO_SHOP_ID || "").trim() !== DEMO_SHOP_ID
    );

  return {
    environment,
    facilityCode,
    productionGuard,
  };
}

function requireEnv(env, key) {
  const value = env[key];
  if (!value) throw new Error(`required environment variable is missing: ${key}`);
  return value;
}

async function supabaseFetch(env, path) {
  const supabaseUrl = requireEnv(env, "SUPABASE_URL");
  const serviceKey = requireEnv(env, "SUPABASE_SERVICE_ROLE_KEY");

  const response = await fetch(`${supabaseUrl}${path}`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }

  if (!response.ok) {
    const message =
      data?.message || data?.hint || data?.details ||
      `database request failed: ${response.status}`;
    throw new Error(message);
  }
  return data;
}

async function getDatabaseVersion(env) {
  const rows = await supabaseFetch(
    env,
    `/rest/v1/iz_demo_schema_versions?select=version_code,applied_at&order=applied_at.desc&limit=1`
  );
  return rows?.[0]?.version_code || null;
}

async function getDemoShop(env) {
  const rows = await supabaseFetch(
    env,
    `/rest/v1/iz_demo_shops?id=eq.${DEMO_SHOP_ID}&select=id,name,demo_key,timezone&limit=1`
  );
  return rows?.[0] || null;
}

async function getIntervalEvidence(env) {
  const endpoints = [
    ["business_hours", "/rest/v1/iz_demo_business_hours?select=slot_interval_minutes,is_closed"],
    ["business_shifts", "/rest/v1/iz_demo_business_shifts?select=slot_interval_minutes,is_enabled"],
    ["special_days", "/rest/v1/iz_demo_special_days?select=slot_interval_minutes,is_closed"],
    ["special_day_shifts", "/rest/v1/iz_demo_special_day_shifts?select=slot_interval_minutes,is_enabled"],
  ];

  const result = {};
  let violationCount = 0;

  for (const [name, path] of endpoints) {
    const rows = await supabaseFetch(env, path);
    let checked = 0;
    let violations = 0;

    for (const row of rows || []) {
      const disabled =
        row.is_closed === true ||
        row.is_enabled === false;
      if (disabled && row.slot_interval_minutes == null) continue;
      checked += 1;
      if (Number(row.slot_interval_minutes) !== 30) violations += 1;
    }

    result[name] = { checked, violations };
    violationCount += violations;
  }

  return { groups: result, violationCount };
}

function publicCheck(id, ok, detail) {
  return { id, ok: Boolean(ok), detail };
}

export async function buildSystemCheck(env) {
  const identity = getRuntimeIdentity(env);
  const checks = [];
  let dbOk = false;
  let databaseVersion = null;
  let intervalEvidence = null;
  let shop = null;

  try {
    [databaseVersion, intervalEvidence, shop] = await Promise.all([
      getDatabaseVersion(env),
      getIntervalEvidence(env),
      getDemoShop(env),
    ]);
    dbOk = true;
  } catch (error) {
    checks.push(publicCheck("database_connection", false, String(error?.message || "database check failed")));
  }

  if (dbOk) {
    checks.push(publicCheck("database_connection", true, "Supabase connection OK"));
    checks.push(publicCheck(
      "database_version",
      databaseVersion === DPRO_READY.databaseVersion,
      databaseVersion || "database version unavailable"
    ));
    checks.push(publicCheck(
      "reservation_30min_guard",
      intervalEvidence?.violationCount === 0,
      `violations=${intervalEvidence?.violationCount ?? "unknown"}`
    ));
    checks.push(publicCheck(
      "demo_shop_boundary",
      Boolean(shop?.id === DEMO_SHOP_ID),
      shop?.id ? "fixed demo shop resolved" : "demo shop not resolved"
    ));
  }

  checks.push(publicCheck(
    "production_guard",
    identity.productionGuard,
    identity.productionGuard
      ? `safe for environment=${identity.environment}`
      : "production configuration still points at demo/fixed-shop settings"
  ));

  checks.push(publicCheck(
    "versions",
    databaseVersion === DPRO_READY.databaseVersion,
    `worker=${DPRO_READY.workerVersion}; database=${databaseVersion || "unknown"}; frontend=${DPRO_READY.frontendVersion}`
  ));

  const blockingFailCount = checks.filter((item) => !item.ok).length;
  const versionsAligned =
    databaseVersion === DPRO_READY.databaseVersion &&
    DPRO_READY.workerVersion === DPRO_READY.frontendVersion;

  return {
    ok: blockingFailCount === 0,
    systemCode: DPRO_READY.systemCode,
    status: blockingFailCount === 0 ? "ready" : "blocked",
    version: DPRO_READY.workerVersion,
    workerVersion: DPRO_READY.workerVersion,
    databaseVersion: databaseVersion || "unknown",
    frontendVersion: DPRO_READY.frontendVersion,
    adapterVersion: DPRO_READY.adapterVersion,
    facilityCode: identity.facilityCode,
    environment: identity.environment,
    productionGuard: identity.productionGuard,
    dbOk,
    versionsAligned,
    blockingFailCount,
    demoPreparePath: "/api/admin/demo-reset",
    releaseManifestPath: "/dpro-release.json",
    checks,
    checkedAt: new Date().toISOString(),
  };
}
