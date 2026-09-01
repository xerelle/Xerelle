import { jsonResponse } from "../../lib/http.js";
import { getSubscriberIdFromSession } from "./login.js";

// Returns the logged-in subscriber's own Feed posts, merged with Feed
// posts from every model he currently has an ACTIVE subscription to —
// one combined, chronological timeline, newest first. This is
// deliberately different from feed-get.js (which shows ONE specific
// model's Feed when visiting her Room) — this is his own personal
// mixed timeline, private to his own account, built entirely from
// relationships he's already paying for (his own content plus models
// he actively subscribes to), not a public/discoverable feed.
export async function handleGetCombinedFeed(request, env) {
  const subscriberId = await getSubscriberIdFromSession(request, env);
  if (!subscriberId) {
    return jsonResponse({ error: "login_required", message: "Log in first." }, 401);
  }

  const nowSeconds = Math.floor(Date.now() / 1000);

  const { results: rawPosts } = await env.DB.prepare(
    `SELECT
       id, media_type, media_url, caption, posted_at,
       'self' AS source_type, NULL AS model_username, NULL AS model_display_name
     FROM subscriber_feed_posts
     WHERE subscriber_id = ? AND expires_at > ?

     UNION ALL

     SELECT
       fp.id, fp.media_type, fp.media_url, fp.caption, fp.posted_at,
       'model' AS source_type, m.username AS model_username, m.display_name AS model_display_name
     FROM feed_posts fp
     INNER JOIN subscriptions sub
       ON sub.model_id = fp.model_id
       AND sub.subscriber_id = ?
       AND sub.status = 'active'
       AND sub.current_period_end > unixepoch()
     INNER JOIN models m ON m.id = fp.model_id
     WHERE fp.expires_at > ?

     ORDER BY posted_at DESC`
  )
    .bind(subscriberId, nowSeconds, subscriberId, nowSeconds)
    .all();

  // Only Feed posts from models get the interactive Like/Comment data —
  // his own posts in his own timeline are just displayed, not liked or
  // commented on by himself.
  const posts = [];
  for (const post of rawPosts) {
    if (post.source_type === "model") {
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
    posts.push(post);
  }

  return jsonResponse({ posts });
}
