import { jsonResponse, badRequest, generateId } from "../../lib/http.js";
import { getSubscriberIdFromSession } from "./login.js";
import { validateUpload } from "../../lib/validate-upload.js";

const FEED_POST_LIFETIME_SECONDS = 30 * 24 * 60 * 60; // 30 days — matches model's Feed exactly

// Posts a new Feed item for the logged-in subscriber. Mirrors the
// model's Feed exactly (feed-post.js) — same 30-day lifetime, same
// upload validation — but gated the other way at read time: visible
// only to models she currently has an active subscription to (see
// subscriber-feed-get.js). If she has no active subscription to
// anyone, nobody sees this at all.
export async function handlePostSubscriberFeedItem(request, env) {
  const subscriberId = await getSubscriberIdFromSession(request, env);
  if (!subscriberId) {
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
  const key = `subscriber-feed/${subscriberId}/${generateId()}`;
  await env.MEDIA.put(key, validation.buffer, {
    httpMetadata: { contentType: media.type || "image/jpeg" },
  });

  const mediaUrl = `/media/${key}`;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiresAt = nowSeconds + FEED_POST_LIFETIME_SECONDS;
  const id = generateId();

  await env.DB.prepare(
    `INSERT INTO subscriber_feed_posts (id, subscriber_id, media_type, media_url, caption, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(id, subscriberId, mediaType, mediaUrl, caption, expiresAt)
    .run();

  return jsonResponse({ id, media_url: mediaUrl, expires_at: expiresAt });
}
