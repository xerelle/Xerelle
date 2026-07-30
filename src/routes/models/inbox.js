import { jsonResponse } from "../../lib/http.js";
import { getModelIdFromSession } from "./login.js";

// Returns a list of the logged-in model's conversation threads — one
// entry per subscriber who has an active thread with her, each with a
// preview of the most recent message, her name (falling back to phone
// for older accounts), and her avatar photo if she's uploaded one.
export async function handleGetModelInbox(request, env) {
  const modelId = await getModelIdFromSession(request, env);
  if (!modelId) {
    return jsonResponse({ error: "login_required", message: "Log in first." }, 401);
  }

  const { results } = await env.DB.prepare(
    `SELECT
       m.subscriber_id,
       COALESCE(s.display_name, s.phone) AS subscriber_label,
       s.avatar_url,
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
