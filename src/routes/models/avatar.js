import { jsonResponse, badRequest } from "../../lib/http.js";
import { getModelIdFromSession } from "./login.js";
import { validateUpload } from "../../lib/validate-upload.js";
import { generateId } from "../../lib/http.js";

// Updates the logged-in model's main profile photo (teaser_media_url) —
// the photo shown as her avatar on her Room, in Discover, and
// throughout the app. Distinct from Gallery (multiple secondary
// photos) — this is specifically the one primary photo. Previously
// only settable once, at signup, with no way to change it afterward.
export async function handleUpdateModelAvatar(request, env) {
  const modelId = await getModelIdFromSession(request, env);
  if (!modelId) {
    return jsonResponse({ error: "login_required", message: "Log in first." }, 401);
  }

  const formData = await request.formData();
  const photo = formData.get("photo");

  if (!photo) {
    return badRequest("photo is required");
  }

  const validation = await validateUpload(photo, { maxSizeMB: 15, category: "image" });
  if (!validation.valid) {
    return badRequest(validation.error);
  }

  const key = `avatars/${modelId}/${generateId()}`;
  await env.MEDIA.put(key, validation.buffer, {
    httpMetadata: { contentType: photo.type || "image/jpeg" },
  });

  const mediaUrl = `/media/${key}`;

  await env.DB.prepare("UPDATE models SET teaser_media_url = ? WHERE id = ?")
    .bind(mediaUrl, modelId)
    .run();

  return jsonResponse({ teaser_media_url: mediaUrl });
}
