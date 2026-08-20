import { jsonResponse } from "../../lib/http.js";
import { getSubscriberIdFromSession } from "./login.js";
import { getEffectiveStreak } from "../lib/streaks.js";

// Returns a list of the logged-in subscriber's conversation threads —
// one entry per model she has an active thread with, each showing the
// model's name/avatar, a preview of the most recent message, and the
// current streak with this model. Mirrors handleGetModelInbox, just
// from the subscriber's side.
export async function handleGetSubscriberInbox(request, env) {
  const subscriberId = await getSubscriberIdFromSession(request, env);
  if (!subscriberId) {
    return jsonResponse({ error: "login_required", message: "Log in first." }, 401);
  }

  const { results } = await env.DB.prepare(
    `SELECT
       m.model_id,
       mo.username AS model_username,
       mo.display_name AS model_display_name,
       mo.age AS model_age,
       mo.teaser_media_url,
       m.body AS last_message,
       m.sender_type AS last_sender_type,
       m.sent_at AS last_sent_at,
       cs.streak_count, cs.last_credited_date
     FROM messages m
     INNER JOIN (
       SELECT model_id, MAX(sent_at) AS max_sent_at
       FROM messages
       WHERE subscriber_id = ?
       GROUP BY model_id
     ) latest
       ON m.model_id = latest.model_id
       AND m.sent_at = latest.max_sent_at
     INNER JOIN models mo ON mo.id = m.model_id
     LEFT JOIN chat_streaks cs ON cs.subscriber_id = m.subscriber_id AND cs.model_id = m.model_id
     WHERE m.subscriber_id = ?
     ORDER BY m.sent_at DESC`
  )
    .bind(subscriberId, subscriberId)
    .all();

  const threads = results.map((row) => ({
    ...row,
    streak: getEffectiveStreak(row),
  }));

  return jsonResponse({ threads });
}
