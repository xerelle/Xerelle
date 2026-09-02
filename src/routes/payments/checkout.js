import { jsonResponse, badRequest, generateId } from "../../lib/http.js";
import { getSubscriberIdFromSession } from "../subscribers/login.js";

const SUBSCRIPTION_PRICE_KOBO = 1000000;
const MODEL_SHARE_RATE = 0.65;

export async function handleCheckoutStart(request, env) {
  const subscriber_id = await getSubscriberIdFromSession(request, env);
  if (!subscriber_id) {
    return jsonResponse({ error: "login_required", message: "Log in first." }, 401);
  }

  const body = await request.json();
  const { model_id } = body;

  if (!model_id) {
    return badRequest("model_id is required");
  }

  const model = await env.DB.prepare(
    "SELECT id, verification_status FROM models WHERE id = ?"
  )
    .bind(model_id)
    .first();
  if (!model || model.verification_status !== "verified") {
    return badRequest("model not found or not yet verified");
  }

  const subscriber = await env.DB.prepare("SELECT id, email FROM subscribers WHERE id = ?")
    .bind(subscriber_id)
    .first();
  if (!subscriber) {
    return badRequest("subscriber not found");
  }

  const transactionId = generateId();
  const modelShare = Math.round(SUBSCRIPTION_PRICE_KOBO * MODEL_SHARE_RATE);
  const platformShare = SUBSCRIPTION_PRICE_KOBO - modelShare;

  await env.DB.prepare(
    `INSERT INTO transactions
       (id, type, subscriber_id, model_id, amount_kobo, model_share_kobo,
        platform_share_kobo, split_rate, payment_provider, status)
     VALUES (?, 'subscription', ?, ?, ?, ?, ?, '65/35', 'paystack', 'pending')`
  )
    .bind(transactionId, subscriber_id, model_id, SUBSCRIPTION_PRICE_KOBO, modelShare, platformShare)
    .run();

  const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: subscriber.email || `${subscriber_id}@placeholder.xerelle.com`,
      amount: SUBSCRIPTION_PRICE_KOBO,
      currency: "NGN",
      reference: transactionId,
      metadata: { subscriber_id, model_id, type: "subscription" },
    }),
  });

  const paystackData = await paystackRes.json();
  if (!paystackData.status) {
    // TEMPORARY: surfacing Paystack's actual rejection reason so we can
    // see the real cause instead of guessing — revert this once the
    // actual issue is found and fixed, since it's more detail than a
    // production error response should normally expose.
    return jsonResponse({
      error: "Payment initialization failed",
      paystack_message: paystackData.message || null,
      paystack_response: paystackData,
    }, 502);
  }

  return jsonResponse({
    transaction_id: transactionId,
    authorization_url: paystackData.data.authorization_url,
  });
}
