import { jsonResponse, notFound } from "../../lib/http.js";

export async function handleModelProfile(username, env) {
  const model = await env.DB.prepare(
    `SELECT id, username, display_name, teaser_media_url, verification_status
     FROM models WHERE username = ?`
  )
    .bind(username)
    .first();

  if (!model || model.verification_status !== "verified") {
    return notFound();
  }

  return jsonResponse({
    id: model.id,
    username: model.username,
    display_name: model.display_name,
    teaser_media_url: model.teaser_media_url,
    subscription_price_kobo: 1000000,
  });
}
