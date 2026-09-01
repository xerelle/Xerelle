import { jsonResponse, badRequest, generateId } from "../../lib/http.js";
import { getModelIdFromSession } from "./login.js";

// Toggles a model's like on/off for a specific subscriber — the reverse
// direction of model_likes (subscriber liking a model). This powers the
// mutual-like signal shown on room.html (doubled hearts when both sides
// like each other) instead of raw popularity numbers.
export async function handleToggleSubscriberLike(request, env, subscriberId) {
  const modelId = await getModelIdFromSession(request, env);
  if (!modelId) {
    return jsonResponse({ error: "login_required", message: "Log in first." }, 401);
  }

  const subscriber = await env.DB.prepare("SELECT id FROM subscribers WHERE id = ?")
    .bind(subscriberId)
    .first();
  if (!subscriber) {
    return badRequest("subscriber not found");
  }

  const existing = await env.DB.prepare(
    "SELECT id FROM model_likes_subscriber WHERE model_id = ? AND subscriber_id = ?"
  )
    .bind(modelId, subscriberId)
    .first();

  let liked;
  if (existing) {
    await env.DB.prepare("DELETE FROM model_likes_subscriber WHERE id = ?").bind(existing.id).run();
    liked = false;
  } else {
    await env.DB.prepare(
      "INSERT INTO model_likes_subscriber (id, model_id, subscriber_id) VALUES (?, ?, ?)"
    )
      .bind(generateId(), modelId, subscriberId)
      .run();
    liked = true;
  }

  return jsonResponse({ liked });
}
