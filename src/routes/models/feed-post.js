import { jsonResponse, badRequest, generateId } from "../../lib/http.js";
import { getModelIdFromSession } from "./login.js";
import { validateUpload } from "../../lib/validate-upload.js";

const FEED_POST_LIFETIME_SECONDS = 30 * 24 * 60 * 60; // 30 days

// Posts a new Feed item for the logged-in model. Unlike Gallery (public
// preview) or Stories (24hr, public), Feed is subscriber-only content —
// gated entirely at read time (see feed-get.js) — and lives for 30 days,
// roughly matching one billing cycle, rather than being permanent.
export async function handlePostFeedItem(request, env) {
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

  const validation = await validateUpload(media, { maxSizeMB: 50, category: "media" });
  if (!validation.valid) {
    return badRequest(validation.error);
  }

  const mediaType = validation.detectedType === "mp4" || validation.detectedType === "webm"
    ? "video"
    : "photo";
  const key = `feed/${modelId}/${generateId()}`;
  await env.MEDIA.put(key, validation.buffer, {
    httpMetadata: { contentType: media.type || "image/jpeg" },
  });

  const mediaUrl = `/media/${key}`;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiresAt = nowSeconds + FEED_POST_LIFETIME_SECONDS;
  const id = generateId();

  await env.DB.prepare(
    `INSERT INTO feed_posts (id, model_id, media_type, media_url, caption, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(id, modelId, mediaType, mediaUrl, caption, expiresAt)
    .run();

  return jsonResponse({ id, media_url: mediaUrl, expires_at: expiresAt });
}
