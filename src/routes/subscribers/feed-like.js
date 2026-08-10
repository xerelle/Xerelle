import { jsonResponse, badRequest, generateId } from "../../lib/http.js";
import { getSubscriberIdFromSession } from "./login.js";

// Toggles a like on a Feed post. Like Follow/Like elsewhere on the
// platform, the COUNT is visible but WHO liked stays private — this
// endpoint doesn't expose that, and no endpoint anywhere lists likers.
export async function handleToggleFeedLike(request, env, postId) {
  const subscriberId = await getSubscriberIdFromSession(request, env);
  if (!subscriberId) {
    return jsonResponse({ error: "login_required", message: "Log in first." }, 401);
  }

  const post = await env.DB.prepare("SELECT id FROM feed_posts WHERE id = ?")
    .bind(postId)
    .first();
  if (!post) {
    return badRequest("Post not found or has expired.");
  }

  const existing = await env.DB.prepare(
    "SELECT id FROM feed_likes WHERE post_id = ? AND subscriber_id = ?"
  )
    .bind(postId, subscriberId)
    .first();

  if (existing) {
    await env.DB.prepare("DELETE FROM feed_likes WHERE id = ?")
      .bind(existing.id)
      .run();
  } else {
    await env.DB.prepare(
      "INSERT INTO feed_likes (id, post_id, subscriber_id) VALUES (?, ?, ?)"
    )
      .bind(generateId(), postId, subscriberId)
      .run();
  }

  const count = await env.DB.prepare(
    "SELECT COUNT(*) as count FROM feed_likes WHERE post_id = ?"
  )
    .bind(postId)
    .first();

  return jsonResponse({ liked: !existing, like_count: count.count });
}
