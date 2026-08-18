import { jsonResponse, badRequest, generateId } from "../../lib/http.js";
import { getSubscriberIdFromSession } from "./login.js";
import { validateUpload } from "../../lib/validate-upload.js";

// Uploads (or replaces) the logged-in subscriber's single avatar photo.
// Unlike a model's gallery (multiple photos), a subscriber has just one
// — so this always overwrites whatever was there before, no position
// tracking needed.
export async function handleUploadSubscriberAvatar(request, env) {
  const subscriberId = await getSubscriberIdFromSession(request, env);
  if (!subscriberId) {
    return jsonResponse({ error: "login_required", message: "Log in first." }, 401);
  }

  const formData = await request.formData();
  const photo = formData.get("photo");
  if (!photo) {
    return badRequest("photo is required");
  }

  const validation = await validateUpload(photo, { maxSizeMB: 10, category: "image" });
  if (!validation.valid) {
    return badRequest(validation.error);
  }

  const key = `avatars/subscribers/${subscriberId}/${generateId()}`;
  await env.MEDIA.put(key, validation.buffer, {
    httpMetadata: { contentType: photo.type || "image/jpeg" },
  });

  const avatarUrl = `/media/${key}`;

  await env.DB.prepare("UPDATE subscribers SET avatar_url = ? WHERE id = ?")
    .bind(avatarUrl, subscriberId)
    .run();

  return jsonResponse({ message: "Photo uploaded.", avatar_url: avatarUrl });
}
