import { jsonResponse, generateId } from "../../lib/http.js";

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

// Paystack calls this when a payment completes. Verify the signature,
// confirm the transaction, and activate the subscription.
//
// Configure this URL in your Paystack dashboard as the webhook endpoint:
//   https://xerelle.com/api/payments/webhook/paystack
export async function handlePaystackWebhook(request, env) {
  const signature = request.headers.get("x-paystack-signature");
  const rawBody = await request.text();

  const isValid = await verifyPaystackSignature(rawBody, signature, env.PAYSTACK_SECRET_KEY);
  if (!isValid) {
    return jsonResponse({ error: "invalid signature" }, 401);
  }

  const event = JSON.parse(rawBody);

  if (event.event === "charge.success") {
    const reference = event.data.reference; // this is our transaction id
    const { subscriber_id, model_id, type } = event.data.metadata;

    await env.DB.prepare(`UPDATE transactions SET status = 'confirmed' WHERE id = ?`)
      .bind(reference)
      .run();

    if (type === "subscription") {
      const nowSeconds = Math.floor(Date.now() / 1000);
      await env.DB.prepare(
        `INSERT INTO subscriptions (id, subscriber_id, model_id, current_period_end)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(subscriber_id, model_id) DO UPDATE SET
           status = 'active',
           current_period_end = excluded.current_period_end,
           cancelled_at = NULL`
      )
        .bind(generateId(), subscriber_id, model_id, nowSeconds + THIRTY_DAYS_SECONDS)
        .run();

      // Schedule the 7-day retention check for the milestone/referral
      // bonus logic. In production, use a Cron Trigger or Queue to
      // re-check this transaction 7 days later rather than doing it
      // inline here — this is a placeholder for that scheduled job.
    }

    // PPV, tip, and video_call confirmations would each need their own
    // branch here — unlock the content, log the tip, or confirm the
    // booking respectively. Not built yet; add as those features land.
  }

  return jsonResponse({ received: true });
}

async function verifyPaystackSignature(rawBody, signature, secretKey) {
  if (!signature) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secretKey),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex === signature;
}
