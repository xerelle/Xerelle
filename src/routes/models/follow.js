import { jsonResponse, badRequest, generateId } from "../../lib/http.js";
import { getSubscriberIdFromSession } from "../subscribers/login.js";

// Toggles a follow on/off for the logged-in subscriber. Requires login —
// following is an identity-linked action, unlike just viewing a profile.
export async function handleToggleFollow(request, env, modelUsername) {
  const subscriberId = await getSubscriberIdFromSession(request, env);
  if (!subscriberId) {
    return jsonResponse({ error: "login_required", message: "Log in to follow." }, 401);
  }

  const model = await env.DB.prepare("SELECT id FROM models WHERE username = ?")
    .bind(modelUsername)
    .first();
  if (!model) {
    return badRequest("model not found");
  }

  const existing = await env.DB.prepare(
    "SELECT id FROM model_follows WHERE subscriber_id = ? AND model_id = ?"
  )
    .bind(subscriberId, model.id)
    .first();

  let following;
  if (existing) {
    await env.DB.prepare("DELETE FROM model_follows WHERE id = ?").bind(existing.id).run();
    following = false;
  } else {
    await env.DB.prepare(
      "INSERT INTO model_follows (id, subscriber_id, model_id) VALUES (?, ?, ?)"
    )
      .bind(generateId(), subscriberId, model.id)
      .run();
    following = true;
  }

  const countRow = await env.DB.prepare(
    "SELECT COUNT(*) as count FROM model_follows WHERE model_id = ?"
  )
    .bind(model.id)
    .first();

  return jsonResponse({ following, follower_count: countRow.count });
}

// Toggles a like on/off for the logged-in subscriber. Same shape as
// follow — separate table, separate action, but identical pattern.
export async function handleToggleLike(request, env, modelUsername) {
  const subscriberId = await getSubscriberIdFromSession(request, env);
  if (!subscriberId) {
    return jsonResponse({ error: "login_required", message: "Log in to like." }, 401);
  }

  const model = await env.DB.prepare("SELECT id FROM models WHERE username = ?")
    .bind(modelUsername)
    .first();
  if (!model) {
    return badRequest("model not found");
  }

  const existing = await env.DB.prepare(
    "SELECT id FROM model_likes WHERE subscriber_id = ? AND model_id = ?"
  )
    .bind(subscriberId, model.id)
    .first();

  let liked;
  if (existing) {
    await env.DB.prepare("DELETE FROM model_likes WHERE id = ?").bind(existing.id).run();
    liked = false;
  } else {
    await env.DB.prepare(
      "INSERT INTO model_likes (id, subscriber_id, model_id) VALUES (?, ?, ?)"
    )
      .bind(generateId(), subscriberId, model.id)
      .run();
    liked = true;
  }

  const countRow = await env.DB.prepare(
    "SELECT COUNT(*) as count FROM model_likes WHERE model_id = ?"
  )
    .bind(model.id)
    .first();

  return jsonResponse({ liked, like_count: countRow.count });
}
