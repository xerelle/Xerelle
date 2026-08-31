import { jsonResponse, badRequest, generateId } from "../../lib/http.js";
import { getSubscriberIdFromSession } from "./login.js";
import { createNotification } from "../lib/notifications.js";
import { validateUpload } from "../../lib/validate-upload.js";

const STORY_LIFETIME_SECONDS = 60 * 60 * 24; // 24 hours — matches model's Story exactly

// Posts a new Story for the logged-in subscriber. Mirrors the model's
// Story exactly (stories-post.js) — same 24hr lifetime, same upload
// validation — but visibility works in reverse: shown only to models
// she currently has an ACTIVE subscription to, not to anyone browsing
// publicly. If she's subscribed to multiple models, all of them see it;
// if she has no active subscription at all, nobody does.
export async function handlePostSubscriberStory(request, env) {
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
  const key = `subscriber-stories/${subscriberId}/${generateId()}`;
  await env.MEDIA.put(key, validation.buffer, {
    httpMetadata: { contentType: media.type || "image/jpeg" },
  });

  const mediaUrl = `/media/${key}`;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiresAt = nowSeconds + STORY_LIFETIME_SECONDS;

  await env.DB.prepare(
    `INSERT INTO subscriber_stories (id, subscriber_id, media_type, media_url, caption, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(generateId(), subscriberId, mediaType, mediaUrl, caption, expiresAt)
    .run();

  // Notify every model she currently has an active subscription to —
  // the mirror of the model's version notifying her followers. Kept
  // best-effort, same as the model's version: the Story itself has
  // already posted successfully regardless of whether this succeeds.
  try {
    const subscriber = await env.DB.prepare(
      "SELECT username, display_name, phone FROM subscribers WHERE id = ?"
    )
      .bind(subscriberId)
      .first();
    const label = subscriber.display_name || subscriber.phone;

    const { results: activeSubs } = await env.DB.prepare(
      `SELECT model_id FROM subscriptions
       WHERE subscriber_id = ? AND status = 'active' AND current_period_end > unixepoch()`
    )
      .bind(subscriberId)
      .all();

    for (const sub of activeSubs) {
      await createNotification({
        recipientType: "model",
        recipientId: sub.model_id,
        type: "new_subscriber_story",
        message: `${label} posted a new update.`,
        link: `/inbox.html`,
        env,
      });
    }
  } catch (err) {
    console.error("Failed to create subscriber story notifications:", err);
  }

  return jsonResponse({ message: "Story posted.", media_url: mediaUrl, expires_at: expiresAt });
}

// Returns a subscriber's current active (non-expired) Story, or null.
// Unlike the model's getActiveStory (called freely for any public
// profile view), this should only ever be called by code that has
// ALREADY verified the requesting model has an active subscription to
// this subscriber — it does no access checking itself.
export async function getActiveSubscriberStory(subscriberId, env) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const story = await env.DB.prepare(
    `SELECT media_type, media_url, caption, posted_at, expires_at
     FROM subscriber_stories
     WHERE subscriber_id = ? AND expires_at > ?
     ORDER BY posted_at DESC
     LIMIT 1`
  )
    .bind(subscriberId, nowSeconds)
    .first();

  return story || null;
}
