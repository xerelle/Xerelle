import { jsonResponse } from "../../lib/http.js";
import { getSubscriberIdFromSession } from "./login.js";

// Returns a model's Feed posts — but ONLY the actual content to subscribers
// with an active subscription to THAT specific model. Anyone else (logged
// out, or subscribed to other models but not this one) gets a "locked"
// response with just enough info to build a teaser/paywall screen, not
// the real content.
export async function handleGetFeed(request, env, username) {
  const model = await env.DB.prepare(
    "SELECT id, display_name, teaser_media_url FROM models WHERE username = ?"
  )
    .bind(username)
    .first();

  if (!model) {
    return jsonResponse({ error: "not_found", message: "Model not found." }, 404);
  }

  const subscriberId = await getSubscriberIdFromSession(request, env);

  let hasActiveSubscription = false;
  if (subscriberId) {
    const sub = await env.DB.prepare(
      `SELECT id FROM subscriptions
       WHERE subscriber_id = ? AND model_id = ? AND status = 'active'
         AND current_period_end > unixepoch()`
    )
      .bind(subscriberId, model.id)
      .first();
    hasActiveSubscription = !!sub;
  }

  if (!hasActiveSubscription) {
    return jsonResponse({
      locked: true,
      model_display_name: model.display_name,
      model_teaser_url: model.teaser_media_url,
      message: "Subscribe to unlock her Feed.",
    });
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const { results: posts } = await env.DB.prepare(
    `SELECT id, media_type, media_url, caption, posted_at
     FROM feed_posts
     WHERE model_id = ? AND expires_at > ?
     ORDER BY posted_at DESC`
  )
    .bind(model.id, nowSeconds)
    .all();

  // Attach like count + whether THIS subscriber liked each post
  for (const post of posts) {
    const likeCount = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM feed_likes WHERE post_id = ?"
    )
      .bind(post.id)
      .first();
    post.like_count = likeCount.count;

    const liked = await env.DB.prepare(
      "SELECT id FROM feed_likes WHERE post_id = ? AND subscriber_id = ?"
    )
      .bind(post.id, subscriberId)
      .first();
    post.liked_by_me = !!liked;

    const commentCount = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM feed_comments WHERE post_id = ?"
    )
      .bind(post.id)
      .first();
    post.comment_count = commentCount.count;
  }

  return jsonResponse({
    locked: false,
    model_display_name: model.display_name,
    posts,
  });
}
