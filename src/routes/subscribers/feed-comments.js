import { jsonResponse, badRequest, generateId } from "../../lib/http.js";
import { getSubscriberIdFromSession } from "./login.js";

// Posts a comment on a Feed post. Only a subscriber with an active
// subscription to that post's model can comment — checked the same way
// Feed viewing itself is gated, so a comment can never be left by
// someone who hasn't actually unlocked the post.
export async function handlePostFeedComment(request, env, postId) {
  const subscriberId = await getSubscriberIdFromSession(request, env);
  if (!subscriberId) {
    return jsonResponse({ error: "login_required", message: "Log in first." }, 401);
  }

  const post = await env.DB.prepare(
    "SELECT id, model_id FROM feed_posts WHERE id = ?"
  )
    .bind(postId)
    .first();
  if (!post) {
    return badRequest("Post not found or has expired.");
  }

  const activeSub = await env.DB.prepare(
    `SELECT id FROM subscriptions
     WHERE subscriber_id = ? AND model_id = ? AND status = 'active'
       AND current_period_end > unixepoch()`
  )
    .bind(subscriberId, post.model_id)
    .first();
  if (!activeSub) {
    return jsonResponse(
      { error: "subscription_required", message: "Subscribe to comment." },
      403
    );
  }

  const body = await request.json();
  const { comment_body } = body;
  if (!comment_body || !comment_body.trim()) {
    return badRequest("comment_body is required");
  }

  const id = generateId();
  await env.DB.prepare(
    `INSERT INTO feed_comments (id, post_id, subscriber_id, body)
     VALUES (?, ?, ?, ?)`
  )
    .bind(id, postId, subscriberId, comment_body.trim())
    .run();

  return jsonResponse({ id, posted_at: Math.floor(Date.now() / 1000) });
}

// Returns comments on a post — display_name shown, matching how Xerelle
// always identifies a subscriber to a model elsewhere (not anonymous).
export async function handleGetFeedComments(request, env, postId) {
  const { results } = await env.DB.prepare(
    `SELECT fc.id, fc.body, fc.created_at,
       COALESCE(s.display_name, s.phone) AS subscriber_name
     FROM feed_comments fc
     JOIN subscribers s ON s.id = fc.subscriber_id
     WHERE fc.post_id = ?
     ORDER BY fc.created_at ASC
     LIMIT 200`
  )
    .bind(postId)
    .all();

  return jsonResponse({ comments: results });
}
