import { buildSystemCheck, jsonResponse } from "../_shared/dpro-ready.js";

export async function onRequestGet(context) {
  const check = await buildSystemCheck(context.env);
  return jsonResponse(check, check.ok ? 200 : 503);
}
