import { jsonResponse } from "../../lib/http.js";
import { getModelIdFromSession } from "./login.js";

// Returns the current active (non-expired) Stories from every member
// who currently has an active subscription to the logged-in model.
// Mirrors handleGetFollowedStories exactly (the subscriber-side
// equivalent, gated by "follows"), but gated by an actual paid
// subscription rather than a free follow — matching the agreed rule
// that a member's updates are only visible to models he genuinely
// subscribes to, and to none at all if he has no active subscription.
export async function handleGetSubscriberStoriesForModel(request, env) {
  const modelId = await getModelIdFromSession(request, env);
  if (!modelId) {
    return jsonResponse({ error: "login_required", message: "Log in first." }, 401);
  }

  const nowSeconds = Math.floor(Date.now() / 1000);

  const { results } = await env.DB.prepare(
    `SELECT
       ss.id AS story_id,
       ss.media_type,
       ss.media_url,
       ss.caption,
       ss.posted_at,
       s.username AS subscriber_username,
       COALESCE(s.display_name, s.phone) AS subscriber_label,
       s.avatar_url
     FROM subscriber_stories ss
     INNER JOIN subscriptions sub
       ON sub.subscriber_id = ss.subscriber_id
       AND sub.model_id = ?
       AND sub.status = 'active'
       AND sub.current_period_end > unixepoch()
     INNER JOIN subscribers s ON s.id = ss.subscriber_id
     WHERE ss.expires_at > ?
     ORDER BY ss.posted_at DESC`
  )
    .bind(modelId, nowSeconds)
    .all();

  return jsonResponse({ stories: results });
}
