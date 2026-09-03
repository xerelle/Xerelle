import { jsonResponse, badRequest, generateId } from "../../lib/http.js";
import { getSubscriberIdFromSession } from "./login.js";

// Lets a subscriber top up his Gems balance — a simple, flexible,
// single-currency balance (no fixed denominations) he spends
// minute-by-minute during calls, at whatever per-minute rate each
// individual model has set. Not tied to any one model, since it's an
// account-wide balance he can spend on a call with anyone.
export async function handleGemPurchaseStart(request, env) {
  const subscriber_id = await getSubscriberIdFromSession(request, env);
  if (!subscriber_id) {
    return jsonResponse({ error: "login_required", message: "Log in first." }, 401);
  }

  const body = await request.json();
  const { amount_kobo } = body;

  if (!amount_kobo || !Number.isInteger(amount_kobo) || amount_kobo <= 0) {
    return badRequest("amount_kobo must be a positive whole number");
  }

  const subscriber = await env.DB.prepare("SELECT id, email FROM subscribers WHERE id = ?")
    .bind(subscriber_id)
    .first();
  if (!subscriber) {
    return badRequest("subscriber not found");
  }

  const purchaseId = generateId();
  await env.DB.prepare(
    `INSERT INTO gem_purchases (id, subscriber_id, amount_kobo, status)
     VALUES (?, ?, ?, 'pending')`
  )
    .bind(purchaseId, subscriber_id, amount_kobo)
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
      reference: purchaseId,
      callback_url: `https://xerelle.com/home.html?gems_purchased=true`,
      metadata: { subscriber_id, type: "gem_purchase" },
    }),
  });

  const paystackData = await paystackRes.json();
  if (!paystackData.status) {
    return jsonResponse({ error: "Payment initialization failed" }, 502);
  }

  return jsonResponse({
    purchase_id: purchaseId,
    authorization_url: paystackData.data.authorization_url,
  });
}

// Returns the subscriber's current Gems balance. Creates a zero-balance
// row on first read if one doesn't exist yet, rather than requiring a
// separate signup step for it.
export async function handleGetGemBalance(request, env) {
  const subscriber_id = await getSubscriberIdFromSession(request, env);
  if (!subscriber_id) {
    return jsonResponse({ error: "login_required", message: "Log in first." }, 401);
  }

  let balanceRow = await env.DB.prepare(
    "SELECT balance_kobo FROM gem_balances WHERE subscriber_id = ?"
  )
    .bind(subscriber_id)
    .first();

  if (!balanceRow) {
    await env.DB.prepare(
      "INSERT INTO gem_balances (subscriber_id, balance_kobo) VALUES (?, 0)"
    )
      .bind(subscriber_id)
      .run();
    balanceRow = { balance_kobo: 0 };
  }

  return jsonResponse({ balance_kobo: balanceRow.balance_kobo });
}
