import { notFound } from "../lib/http.js";

// Serves a file directly out of R2 by its storage key. This is what
// turns an internal R2 key (e.g. "gallery/modelId/abc123") into an
// actual working image URL a browser can load: /media/gallery/modelId/abc123
//
// R2 buckets are private by default and don't expose a public URL on
// their own — everything stored there (gallery photos, verification
// documents, etc.) needs to go through a route like this to be
// retrieved. Verification documents (ID/liveness) should NEVER be
// served publicly this way — only gallery photos and other
// intentionally-public media should use this route.
export async function handleServeMedia(key, env) {
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
