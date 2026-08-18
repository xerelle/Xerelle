import { notFound, jsonResponse } from "../lib/http.js";
import { getActorFromSession } from "./lib/actor.js";

// Serves a file directly out of R2 by its storage key. Most media
// (gallery, Stories, Feed) is intentionally public — a Room's teaser
// photo needs to load for anyone visiting the page, logged in or not.
//
// Verification documents are different: the "verification/{modelId}/..."
// prefix is treated as private, and this now actually ENFORCES that —
// only the model herself, or an admin with the correct key, can view
// them. Previously this was only a comment, not real protection.
export async function handleServeMedia(key, request, env) {
  if (key.startsWith("verification/")) {
    const pathModelId = key.split("/")[1];

    const url = new URL(request.url);
    const adminKey = url.searchParams.get("admin_key") || request.headers.get("X-Admin-Key");
    const isAdmin = adminKey && adminKey === env.ADMIN_REVIEW_KEY;

    if (!isAdmin) {
      const actor = await getActorFromSession(request, env);
      const isOwner = actor && actor.type === "model" && actor.id === pathModelId;
      if (!isOwner) {
        return jsonResponse({ error: "forbidden" }, 403);
      }
    }
  }

  const object = await env.MEDIA.get(key);
  if (!object) {
    return notFound();
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000");

  return new Response(object.body, { headers });
}
