import { jsonResponse, badRequest, generateId } from "../lib/http.js";
import { getActorFromSession } from "./lib/actor.js";

// Files a report against a model or subscriber. Unlike a block, this
// doesn't restrict anything automatically — it just creates a record
// (status: pending) for later review. Always requires a reason.
//
// Takes reported_id directly, same reasoning as blocks.js — reporting
// happens from within an existing conversation where the id is already known.
export async function handleCreateReport(request, env) {
  const actor = await getActorFromSession(request, env);
  if (!actor) {
    return jsonResponse({ error: "login_required", message: "Log in first." }, 401);
  }

  const body = await request.json();
  const { reported_type, reported_id, reason } = body;

  if (!reported_type || !["model", "subscriber"].includes(reported_type)) {
    return badRequest("reported_type must be 'model' or 'subscriber'");
  }
  if (!reported_id) {
    return badRequest("reported_id is required");
  }
  if (!reason || !reason.trim()) {
    return badRequest("A reason is required to file a report.");
  }

  const id = generateId();
  await env.DB.prepare(
    `INSERT INTO reports (id, reporter_type, reporter_id, reported_type, reported_id, reason)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(id, actor.type, actor.id, reported_type, reported_id, reason.trim())
    .run();

  return jsonResponse({ message: "Report submitted. Our team will review it." });
}

