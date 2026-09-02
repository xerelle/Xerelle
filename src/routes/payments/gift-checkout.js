import { jsonResponse, badRequest, generateId } from "../../lib/http.js";
import { getSubscriberIdFromSession } from "../subscribers/login.js";

// Tiers keyed by her active subscriber count. Lower tiers are capped
// tighter — genuine fraud/processor risk on a new merchant account,
// since payment processors watch inbound volume to any one recipient.
// Higher tiers get real headroom as she builds a track record.
const GIFT_TIERS = [
  { minSubs: 500, singleCapKobo: 50000000, dailyCapKobo: 300000000 }, // Icon
  { minSubs: 200, singleCapKobo: 20000000, dailyCapKobo: 100000000 }, // Elite
  { minSubs: 50, singleCapKobo: 10000000, dailyCapKobo: 50000000 },   // Popular
  { minSubs: 10, singleCapKobo: 5000000, dailyCapKobo: 20000000 },    // Established
  { minSubs: 0, singleCapKobo: 2000000, dailyCapKobo: 10000000 },     // New
];

function getTierForSubCount(subCount) {
  return GIFT_TIERS.find((tier) => subCount >= tier.minSubs);
}

export async function handleGiftCheckoutStart(request, env) {
  const subscriber_id = await getSubscriberIdFromSession(request, env);
  if (!subscriber_id) {
    return jsonResponse({ error: "login_required", message: "Log in first." }, 401);
  }

  const body = await request.json();
  const { model_id, amount_kobo } = body;

  if (!model_id || !amount_kobo) {
    return badRequest("model_id and amount_kobo are required");
  }
  if (!Number.isInteger(amount_kobo) || amount_kobo <= 0) {
    return badRequest("amount_kobo must be a positive whole number");
  }

  const model = await env.DB.prepare(
    "SELECT id, username, display_name, verification_status FROM models WHERE id = ?"
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

  // Determine her real current tier from her actual active subscriber
  // count — not a stored/cached value, always computed live.
  const subCountRow = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM subscriptions
     WHERE model_id = ? AND status = 'active' AND current_period_end > unixepoch()`
  )
    .bind(model_id)
    .first();
  const tier = getTierForSubCount(subCountRow.count);

  if (amount_kobo > tier.singleCapKobo) {
    return badRequest(
      `This gift exceeds the maximum single gift amount for this creator right now (₦${(tier.singleCapKobo / 100).toLocaleString()}).`
    );
  }

  // Sum of everything she's already received today (confirmed gifts
  // only), so we can check this new gift wouldn't push her over her
  // tier's daily inbound cap.
  const todayStartSeconds = Math.floor(new Date(new Date().toDateString()).getTime() / 1000);
  const todayTotalRow = await env.DB.prepare(
    `SELECT COALESCE(SUM(amount_kobo), 0) as total FROM gifts
     WHERE model_id = ? AND status = 'confirmed' AND created_at >= ?`
  )
    .bind(model_id, todayStartSeconds)
    .first();

  if (todayTotalRow.total + amount_kobo > tier.dailyCapKobo) {
    return badRequest(
      `This creator has nearly reached her daily gift limit — please try a smaller amount or try again tomorrow.`
    );
  }

  const giftId = generateId();
  await env.DB.prepare(
    `INSERT INTO gifts (id, subscriber_id, model_id, amount_kobo, status)
     VALUES (?, ?, ?, ?, 'pending')`
  )
    .bind(giftId, subscriber_id, model_id, amount_kobo)
    .run();

  const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: subscriber.email || `${subscriber_id}@placeholder.xerelle.com`,
      amount: amount_kobo,
      currency: "NGN",
      reference: giftId,
      callback_url: `https://xerelle.com/room.html?u=${encodeURIComponent(model.username)}&gifted=true`,
      metadata: { subscriber_id, model_id, type: "gift" },
    }),
  });

  const paystackData = await paystackRes.json();
  if (!paystackData.status) {
    return jsonResponse({ error: "Payment initialization failed" }, 502);
  }

  return jsonResponse({
    gift_id: giftId,
    authorization_url: paystackData.data.authorization_url,
  });
}
