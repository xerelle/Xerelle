import { jsonResponse } from "../../lib/http.js";
import { getSubscriberIdFromSession } from "./login.js";

// Returns the current active (non-expired) Stories from every model the
// logged-in subscriber follows. Used by home.html's Update tab.
export async function handleGetFollowedStories(request, env) {
  const subscriberId = await getSubscriberIdFromSession(request, env);
  if (!subscriberId) {
    return jsonResponse({ error: "login_required", message: "Log in first." }, 401);
  }

  const nowSeconds = Math.floor(Date.now() / 1000);

  const { results } = await env.DB.prepare(
    `SELECT
       s.id AS story_id,
       s.media_type,
       s.media_url,
       s.caption,
       s.posted_at,
       m.username AS model_username,
       m.display_name AS model_display_name,
       m.age AS model_age,
       m.teaser_media_url
     FROM stories s
     INNER JOIN model_follows f ON f.model_id = s.model_id
     INNER JOIN models m ON m.id = s.model_id
     WHERE f.subscriber_id = ?
       AND s.expires_at > ?
     ORDER BY s.posted_at DESC`
  )
    .bind(subscriberId, nowSeconds)
    .all();

  return jsonResponse({ stories: results });
}
