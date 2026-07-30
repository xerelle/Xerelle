import { jsonResponse, badRequest, generateId } from "../../lib/http.js";
import { getModelIdFromSession } from "./login.js";

const STORY_LIFETIME_SECONDS = 60 * 60 * 24; // 24 hours

// Posts a new Story for the logged-in model. A Story is a free, public
// preview visible to anyone visiting her Room — the actual daily
// engagement mechanic — and automatically stops being shown once
// expires_at has passed (expiry is enforced by profile.js's query,
// not by deleting the row, so it stays in history).
export async function handlePostStory(request, env) {
  const modelId = await getModelIdFromSession(request, env);
  if (!modelId) {
    return jsonResponse({ error: "login_required", message: "Log in first." }, 401);
  }

  const formData = await request.formData();
  const media = formData.get("media");
  const caption = formData.get("caption") || null;

  if (!media) {
    return badRequest("media is required");
  }

  const mediaType = media.type && media.type.startsWith("video") ? "video" : "photo";
  const key = `stories/${modelId}/${generateId()}`;
  await env.MEDIA.put(key, await media.arrayBuffer(), {
    httpMetadata: { contentType: media.type || "image/jpeg" },
  });

  const mediaUrl = `/media/${key}`;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiresAt = nowSeconds + STORY_LIFETIME_SECONDS;

  await env.DB.prepare(
    `INSERT INTO stories (id, model_id, media_type, media_url, caption, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(generateId(), modelId, mediaType, mediaUrl, caption, expiresAt)
    .run();

  return jsonResponse({ message: "Story posted.", media_url: mediaUrl, expires_at: expiresAt });
}

// Returns the model's current active (non-expired) Story, or null if
// she doesn't have one right now. Used by profile.js.
export async function getActiveStory(modelId, env) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const story = await env.DB.prepare(
    `SELECT media_type, media_url, caption, posted_at, expires_at
     FROM stories
     WHERE model_id = ? AND expires_at > ?
     ORDER BY posted_at DESC
     LIMIT 1`
  )
    .bind(modelId, nowSeconds)
    .first();

  return story || null;
}
