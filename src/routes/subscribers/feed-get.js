import { jsonResponse } from "../../lib/http.js";
import { getActorFromSession } from "../lib/actor.js";

// Returns a model's Feed posts. Access works three ways:
// - A subscriber with an active subscription sees the full real content.
// - The model herself, viewing her own Feed, always sees it — no
//   subscription check applies to her own content.
// - Anyone else (logged out, or a subscriber without an active
//   subscription) gets a genuine single-post PREVIEW — her most recent
//   post only, with Like enabled but comments intentionally left out
//   of this response entirely (commenting stays a subscriber privilege,
//   enforced separately by the comment-posting endpoint itself, not
//   just hidden in the UI) — plus the paywall message for everything
//   beyond that one post.
export async function handleGetFeed(request, env, username) {
  const model = await env.DB.prepare(
    "SELECT id, display_name, teaser_media_url FROM models WHERE username = ?"
  )
    .bind(username)
    .first();

  if (!model) {
    return jsonResponse({ error: "not_found", message: "Model not found." }, 404);
  }

  const actor = await getActorFromSession(request, env);
  const isOwner = actor && actor.type === "model" && actor.id === model.id;

  let hasActiveSubscription = false;
  let subscriberId = null;
  if (actor && actor.type === "subscriber") {
    subscriberId = actor.id;
    const sub = await env.DB.prepare(
      `SELECT id FROM subscriptions
       WHERE subscriber_id = ? AND model_id = ? AND status = 'active'
         AND current_period_end > unixepoch()`
    )
      .bind(subscriberId, model.id)
      .first();
    hasActiveSubscription = !!sub;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);

  if (!isOwner && !hasActiveSubscription) {
    // Fetch just her single most recent, still-active post as a preview.
    const previewPost = await env.DB.prepare(
      `SELECT id, media_type, media_url, caption, posted_at
       FROM feed_posts
       WHERE model_id = ? AND expires_at > ?
       ORDER BY posted_at DESC
       LIMIT 1`
    )
      .bind(model.id, nowSeconds)
      .first();

    let preview = null;
    if (previewPost) {
      const likeCount = await env.DB.prepare(
        "SELECT COUNT(*) as count FROM feed_likes WHERE post_id = ?"
      )
        .bind(previewPost.id)
        .first();

      let likedByMe = false;
      if (subscriberId) {
        const liked = await env.DB.prepare(
          "SELECT id FROM feed_likes WHERE post_id = ? AND subscriber_id = ?"
        )
          .bind(previewPost.id, subscriberId)
          .first();
        likedByMe = !!liked;
      }

      preview = {
        ...previewPost,
        like_count: likeCount.count,
        liked_by_me: likedByMe,
      };
    }

    return jsonResponse({
      locked: true,
      model_display_name: model.display_name,
      model_teaser_url: model.teaser_media_url,
      message: "Subscribe to unlock her full Feed.",
      preview_post: preview,
    });
  }

  const { results: posts } = await env.DB.prepare(
    `SELECT id, media_type, media_url, caption, posted_at
     FROM feed_posts
     WHERE model_id = ? AND expires_at > ?
     ORDER BY posted_at DESC`
  )
    .bind(model.id, nowSeconds)
    .all();

  for (const post of posts) {
    const likeCount = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM feed_likes WHERE post_id = ?"
    )
      .bind(post.id)
      .first();
    post.like_count = likeCount.count;

    // liked_by_me only makes sense for a subscriber — the model viewing
    // her own Feed never has a "liked" state of her own.
    if (subscriberId) {
      const liked = await env.DB.prepare(
        "SELECT id FROM feed_likes WHERE post_id = ? AND subscriber_id = ?"
      )
        .bind(post.id, subscriberId)
        .first();
      post.liked_by_me = !!liked;
    } else {
      post.liked_by_me = false;
    }

    const commentCount = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM feed_comments WHERE post_id = ?"
    )
      .bind(post.id)
      .first();
    post.comment_count = commentCount.count;
  }

  return jsonResponse({
    locked: false,
    is_owner: isOwner,
    model_display_name: model.display_name,
    posts,
  });
}
