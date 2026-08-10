import { jsonResponse, badRequest, generateId } from "../../lib/http.js";
import { getActorFromSession } from "../lib/actor.js";

// Posts a comment on a Feed post. Works for either party:
// - A subscriber, but only if she has an active subscription to that
//   post's model (same gate as viewing the Feed itself).
// - The model herself, replying on her own post — no subscription
//   check applies to her, since it's her own content.
export async function handlePostFeedComment(request, env, postId) {
  const actor = await getActorFromSession(request, env);
  if (!actor) {
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

  if (actor.type === "model") {
    if (actor.id !== post.model_id) {
      return jsonResponse(
        { error: "forbidden", message: "You can only reply on your own posts." },
        403
      );
    }
  } else {
    const activeSub = await env.DB.prepare(
      `SELECT id FROM subscriptions
       WHERE subscriber_id = ? AND model_id = ? AND status = 'active'
         AND current_period_end > unixepoch()`
    )
      .bind(actor.id, post.model_id)
      .first();
    if (!activeSub) {
      return jsonResponse(
        { error: "subscription_required", message: "Subscribe to comment." },
        403
      );
    }
  }

  const body = await request.json();
  const { comment_body } = body;
  if (!comment_body || !comment_body.trim()) {
    return badRequest("comment_body is required");
  }

  const id = generateId();
  await env.DB.prepare(
    `INSERT INTO feed_comments (id, post_id, author_type, author_id, body)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(id, postId, actor.type, actor.id, comment_body.trim())
    .run();

  return jsonResponse({ id, posted_at: Math.floor(Date.now() / 1000) });
}

// Returns comments on a post. Each comment shows the author's name and
// whether it came from the model herself, so the frontend can style her
// replies distinctly (e.g. a small "Model" badge).
export async function handleGetFeedComments(request, env, postId) {
  const { results } = await env.DB.prepare(
    `SELECT fc.id, fc.body, fc.created_at, fc.author_type,
       CASE
         WHEN fc.author_type = 'model' THEN m.display_name
         ELSE COALESCE(s.display_name, s.phone)
       END AS author_name
     FROM feed_comments fc
     LEFT JOIN models m ON fc.author_type = 'model' AND m.id = fc.author_id
     LEFT JOIN subscribers s ON fc.author_type = 'subscriber' AND s.id = fc.author_id
     WHERE fc.post_id = ?
     ORDER BY fc.created_at ASC
     LIMIT 200`
  )
    .bind(postId)
    .all();

  return jsonResponse({ comments: results });
}
