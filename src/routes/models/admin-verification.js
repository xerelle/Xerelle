import { jsonResponse, badRequest } from "../../lib/http.js";

// Returns all models currently pending verification, along with the
// OCR name-match signal, so an admin can quickly triage which ones look
// clean versus which need closer attention — this is a decision-support
// list, not an automatic approval mechanism.
//
// Protected by a simple shared admin key, sent via the X-Admin-Key
// header ONLY — never accepted via URL query string, since a URL with a
// secret in it can end up saved in browser history, server logs, or
// accidentally shared/screenshotted.
export async function handleListPendingVerifications(request, env) {
  const adminKey = request.headers.get("X-Admin-Key");

  if (!adminKey || adminKey !== env.ADMIN_REVIEW_KEY) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const { results } = await env.DB.prepare(
    `SELECT id, username, display_name, phone, age,
       id_document_url, liveness_selfie_url,
       id_extracted_name, name_match_status,
       created_at
     FROM models
     WHERE verification_status = 'pending'
     ORDER BY created_at ASC`
  )
    .all();

  return jsonResponse({ pending: results });
}

// Approves or rejects a model's verification.
export async function handleReviewVerification(request, env, modelId) {
  const adminKey = request.headers.get("X-Admin-Key");

  if (!adminKey || adminKey !== env.ADMIN_REVIEW_KEY) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const body = await request.json();
  const { decision } = body; // 'verified' or 'rejected'

  if (!decision || !["verified", "rejected"].includes(decision)) {
    return badRequest("decision must be 'verified' or 'rejected'");
  }

  await env.DB.prepare(
    `UPDATE models SET verification_status = ?, verified_at = CASE WHEN ? = 'verified' THEN unixepoch() ELSE NULL END
     WHERE id = ?`
  )
    .bind(decision, decision, modelId)
    .run();

  return jsonResponse({ model_id: modelId, verification_status: decision });
}
