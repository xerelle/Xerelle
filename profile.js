import { jsonResponse, notFound } from "../../lib/http.js";

// Public data for a model's landing page — used both for the direct-link
// flow and the exact-username-search flow. Deliberately returns only
// what a NON-subscribed visitor should see: the fixed teaser photo and
// basic profile info. It never returns chat, feed, or other models'
// data — that all requires an active subscription, checked separately
// in the chat/feed routes.
export async function handleModelProfile(username, env) {
  const model = await env.DB.prepare(
    `SELECT id, username, display_name, teaser_media_url, verification_status
     FROM models WHERE username = ?`
  )
    .bind(username)
    .first();

  if (!model || model.verification_status !== "verified") {
    // Deliberately the same 404 whether the username doesn't exist or
    // just isn't verified yet — don't leak which case it is.
    return notFound();
  }

  return jsonResponse({
    id: model.id,
    username: model.username,
    display_name: model.display_name,
    teaser_media_url: model.teaser_media_url,
    subscription_price_kobo: 1000000, // ₦10,000 — move to a config/env value once pricing can vary
  });
}
