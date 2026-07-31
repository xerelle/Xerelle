import { jsonResponse } from "../../lib/http.js";
import { getSubscriberIdFromSession } from "./login.js";

// Returns a list of models who've opted in to Discover — but ONLY to
// subscribers who already have at least one active subscription
// elsewhere on the platform. This is intentionally NOT a public
// directory: it only ever appears to someone who's already proven to be
// a genuine, paying member, as a way to help if the person they
// originally came for isn't the right fit.
export async function handleGetDiscoverModels(request, env) {
  const subscriberId = await getSubscriberIdFromSession(request, env);
  if (!subscriberId) {
    return jsonResponse({ error: "login_required", message: "Log in first." }, 401);
  }

  const hasActiveSubscription = await env.DB.prepare(
    `SELECT id FROM subscriptions
     WHERE subscriber_id = ? AND status = 'active' AND current_period_end > unixepoch()
     LIMIT 1`
  )
    .bind(subscriberId)
    .first();

  if (!hasActiveSubscription) {
    return jsonResponse({
      error: "subscription_required",
      message: "Discover unlocks once you have an active subscription.",
    }, 403);
  }

  const { results: models } = await env.DB.prepare(
    `SELECT m.username, m.display_name, m.teaser_media_url, m.subscription_price_kobo
     FROM models m
     WHERE m.discoverable = 1
       AND m.verification_status = 'verified'
       AND m.id NOT IN (
         SELECT model_id FROM subscriptions
         WHERE subscriber_id = ? AND status = 'active' AND current_period_end > unixepoch()
       )
     ORDER BY RANDOM()
     LIMIT 20`
  )
    .bind(subscriberId)
    .all();

  return jsonResponse({ models });
}
