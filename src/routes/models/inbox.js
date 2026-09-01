import { jsonResponse } from "../../lib/http.js";
import { getModelIdFromSession } from "./login.js";
import { getEffectiveStreak } from "../lib/streaks.js";

// Returns a list of the logged-in model's conversation threads — one
// entry per subscriber who has an active thread with her, each with a
// preview of the most recent message, her name (falling back to phone
// for older accounts), her avatar photo if she's uploaded one, the
// current streak with this subscriber, and whether SHE already likes
// this subscriber back — powers the heart toggle shown next to each
// thread, which feeds the mutual-like signal on room.html.
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
       m.sent_at AS last_sent_at,
       cs.streak_count, cs.last_credited_date,
       CASE WHEN mls.id IS NOT NULL THEN 1 ELSE 0 END AS model_likes_this_subscriber
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
     LEFT JOIN chat_streaks cs ON cs.subscriber_id = m.subscriber_id AND cs.model_id = m.model_id
     LEFT JOIN model_likes_subscriber mls ON mls.subscriber_id = m.subscriber_id AND mls.model_id = m.model_id
     WHERE m.model_id = ?
     ORDER BY m.sent_at DESC`
  )
    .bind(modelId, modelId)
    .all();

  const threads = results.map((row) => ({
    ...row,
    streak: getEffectiveStreak(row),
    model_likes_this_subscriber: !!row.model_likes_this_subscriber,
  }));

  return jsonResponse({ threads });
}
