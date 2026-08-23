import { buildSystemCheck, jsonResponse } from "../_shared/dpro-ready.js";

export async function onRequestGet(context) {
  const check = await buildSystemCheck(context.env);
  return jsonResponse({
    ok: check.ok,
    systemCode: check.systemCode,
    service: "izakaya-pages-functions",
    status: check.status,
    version: check.workerVersion,
    workerVersion: check.workerVersion,
    databaseVersion: check.databaseVersion,
    frontendVersion: check.frontendVersion,
    adapterVersion: check.adapterVersion,
    facilityCode: check.facilityCode,
    environment: check.environment,
    productionGuard: check.productionGuard,
    dbOk: check.dbOk,
    blockingFailCount: check.blockingFailCount,
    time: check.checkedAt,
  }, check.ok ? 200 : 503);
}
