import { jsonResponse, badRequest } from "../../lib/http.js";
import { getModelIdFromSession } from "./login.js";

const MINIMUM_PRICE_KOBO = 1000000; // ₦10,000 floor

// Lets the logged-in model set her own monthly subscription price.
// Enforces the ₦10,000 floor server-side — she can go higher, never lower.
export async function handleUpdateSubscriptionPrice(request, env) {
  const modelId = await getModelIdFromSession(request, env);
  if (!modelId) {
    return jsonResponse({ error: "login_required", message: "Log in first." }, 401);
  }

  const body = await request.json();
  const { subscription_price_kobo } = body;

  if (
    typeof subscription_price_kobo !== "number" ||
    !Number.isInteger(subscription_price_kobo)
  ) {
    return badRequest("subscription_price_kobo must be a whole number (in kobo)");
  }

  if (subscription_price_kobo < MINIMUM_PRICE_KOBO) {
    return badRequest(
      `Your price can't be set below ₦${MINIMUM_PRICE_KOBO / 100} (₦10,000).`
    );
  }

  await env.DB.prepare("UPDATE models SET subscription_price_kobo = ? WHERE id = ?")
    .bind(subscription_price_kobo, modelId)
    .run();

  return jsonResponse({
    message: "Price updated.",
    subscription_price_kobo,
  });
}
