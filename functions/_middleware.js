import { getRuntimeIdentity, jsonResponse } from "./_shared/dpro-ready.js";

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (!url.pathname.startsWith("/api/")) {
    return context.next();
  }

  const method = request.method.toUpperCase();
  const isMutation = !["GET", "HEAD", "OPTIONS"].includes(method);
  const identity = getRuntimeIdentity(env);

  if (isMutation && identity.environment === "production" && !identity.productionGuard) {
    return jsonResponse({
      ok: false,
      error: "PRODUCTION_GUARD_BLOCKED",
      message: "本番環境の施設識別子がDEMO/固定設定のため更新処理を停止しました。",
      systemCode: "IZAKAYA",
      environment: identity.environment,
      productionGuard: false,
    }, 503);
  }

  return context.next();
}
