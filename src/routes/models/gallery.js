import { jsonResponse, badRequest, generateId } from "../../lib/http.js";
import { getModelIdFromSession } from "./login.js";

const MAX_GALLERY_PHOTOS = 4;

// Uploads one gallery photo for the logged-in model. Requires login —
// identifies the model from her session token rather than a manually
// passed model_id, same improvement we made to verify.html.
export async function handleUploadGalleryPhoto(request, env) {
  const modelId = await getModelIdFromSession(request, env);
  if (!modelId) {
    return jsonResponse({ error: "login_required", message: "Log in first." }, 401);
  }

  const countRow = await env.DB.prepare(
    "SELECT COUNT(*) as count FROM model_gallery_photos WHERE model_id = ?"
  )
    .bind(modelId)
    .first();

  if (countRow.count >= MAX_GALLERY_PHOTOS) {
    return badRequest(`You can only have up to ${MAX_GALLERY_PHOTOS} gallery photos.`);
  }

  const formData = await request.formData();
  const photo = formData.get("photo");
  if (!photo) {
    return badRequest("photo is required");
  }

  const key = `gallery/${modelId}/${generateId()}`;
  await env.MEDIA.put(key, await photo.arrayBuffer());

  await env.DB.prepare(
    `INSERT INTO model_gallery_photos (id, model_id, media_url, position)
     VALUES (?, ?, ?, ?)`
  )
    .bind(generateId(), modelId, key, countRow.count)
    .run();

  return jsonResponse({ message: "Photo uploaded.", position: countRow.count });
}

// Returns the list of gallery photo URLs for a model, ordered by
// position. Used by profile.js so the public landing page can show them.
export async function getGalleryPhotoUrls(modelId, env) {
  const { results } = await env.DB.prepare(
    "SELECT media_url FROM model_gallery_photos WHERE model_id = ? ORDER BY position ASC"
  )
    .bind(modelId)
    .all();

  return results.map((row) => row.media_url);
}
