import { jsonResponse } from "../../lib/http.js";
import { getModelIdFromSession } from "./login.js";

// Returns a list of the logged-in model's conversation threads — one
// entry per subscriber who has an active thread with her, each with a
// preview of the most recent message and the subscriber's phone number
// (subscribers don't have display names, so phone is what she'll
// recognize them by). Used by inbox.html so she can see who's messaged
// her and pick a conversation to open.
export async function handleGetModelInbox(request, env) {
  const modelId = await getModelIdFromSession(request, env);
  if (!modelId) {
    return jsonResponse({ error: "login_required", message: "Log in first." }, 401);
  }

  const { results } = await env.DB.prepare(
    `SELECT
       m.subscriber_id,
       s.phone AS subscriber_phone,
       m.body AS last_message,
       m.sender_type AS last_sender_type,
       m.sent_at AS last_sent_at
     FROM messages m
     INNER JOIN (
       SELECT subscriber_id, MAX(sent_at) AS max_sent_at
       FROM messages
       WHERE model_id = ?
       GROUP BY subscriber_id
     ) latest
       ON m.subscriber_id = latest.subscriber_id
       AND m.sent_at = latest.max_sent_at
     INNER JOIN subscribers s ON s.id = m.subscriber_id
     WHERE m.model_id = ?
     ORDER BY m.sent_at DESC`
  )
    .bind(modelId, modelId)
    .all();

  return jsonResponse({ threads: results });
}
