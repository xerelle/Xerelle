import { jsonResponse, badRequest, generateId } from "../lib/http.js";
import { getActorFromSession } from "../lib/actor.js";

async function lookupIdByUsername(type, username, env) {
  const table = type === "model" ? "models" : "subscribers";
  const row = await env.DB.prepare(`SELECT id FROM ${table} WHERE username = ?`)
    .bind(username)
    .first();
  return row ? row.id : null;
}

// Files a report against a model or subscriber. Unlike a block, this
// doesn't restrict anything automatically — it just creates a record
// (status: pending) for later review. Always requires a reason.
export async function handleCreateReport(request, env) {
  const actor = await getActorFromSession(request, env);
  if (!actor) {
    return jsonResponse({ error: "login_required", message: "Log in first." }, 401);
  }

  const body = await request.json();
  const { reported_type, reported_username, reason } = body;

  if (!reported_type || !["model", "subscriber"].includes(reported_type)) {
    return badRequest("reported_type must be 'model' or 'subscriber'");
  }
  if (!reported_username) {
    return badRequest("reported_username is required");
  }
  if (!reason || !reason.trim()) {
    return badRequest("A reason is required to file a report.");
  }

  const reportedId = await lookupIdByUsername(reported_type, reported_username, env);
  if (!reportedId) {
    return badRequest("No account found with that username.");
  }

  const id = generateId();
  await env.DB.prepare(
    `INSERT INTO reports (id, reporter_type, reporter_id, reported_type, reported_id, reason)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(id, actor.type, actor.id, reported_type, reportedId, reason.trim())
    .run();

  return jsonResponse({ message: "Report submitted. Our team will review it." });
}
