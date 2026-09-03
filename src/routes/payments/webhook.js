import { jsonResponse, generateId } from "../../lib/http.js";
import { createNotification } from "../lib/notifications.js";

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

export async function handlePaystackWebhook(request, env) {
  const signature = request.headers.get("x-paystack-signature");
  const rawBody = await request.text();

  const isValid = await verifyPaystackSignature(rawBody, signature, env.PAYSTACK_SECRET_KEY);
  if (!isValid) {
    return jsonResponse({ error: "invalid signature" }, 401);
  }

  const event = JSON.parse(rawBody);

  if (event.event === "charge.success") {
    const reference = event.data.reference;
    const { subscriber_id, model_id, type } = event.data.metadata;

    if (type === "gift") {
      // Gifts live in their own table, separate from subscription
      // transactions — a gift's reference is a gifts.id, not a
      // transactions.id, so it needs its own update here rather than
      // falling into the transactions UPDATE below (which would
      // silently match zero rows for a gift reference).
      await env.DB.prepare(`UPDATE gifts SET status = 'confirmed' WHERE id = ?`)
        .bind(reference)
        .run();

      try {
        const subscriber = await env.DB.prepare(
          "SELECT display_name, phone FROM subscribers WHERE id = ?"
        )
          .bind(subscriber_id)
          .first();
        const label = subscriber.display_name || subscriber.phone;
        const amountNaira = (event.data.amount / 100).toLocaleString();

        await createNotification({
          recipientType: "model",
          recipientId: model_id,
          type: "gift_received",
          message: `${label} sent you a gift of ₦${amountNaira}.`,
          link: `/inbox.html`,
          env,
        });
      } catch (err) {
        console.error("Failed to create gift notification:", err);
      }

      return jsonResponse({ received: true });
    }

    if (type === "gem_purchase") {
      // Gems purchases also live in their own table, and credit an
      // account-wide balance rather than anything tied to a model —
      // same reasoning as gifts: needs its own handling here, not the
      // transactions UPDATE below.
      await env.DB.prepare(`UPDATE gem_purchases SET status = 'confirmed' WHERE id = ?`)
        .bind(reference)
        .run();

      const existingBalance = await env.DB.prepare(
        "SELECT subscriber_id FROM gem_balances WHERE subscriber_id = ?"
      )
        .bind(subscriber_id)
        .first();

      if (existingBalance) {
        await env.DB.prepare(
          "UPDATE gem_balances SET balance_kobo = balance_kobo + ? WHERE subscriber_id = ?"
        )
          .bind(event.data.amount, subscriber_id)
          .run();
      } else {
        await env.DB.prepare(
          "INSERT INTO gem_balances (subscriber_id, balance_kobo) VALUES (?, ?)"
        )
          .bind(subscriber_id, event.data.amount)
          .run();
      }

      return jsonResponse({ received: true });
    }

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

      // Notify the model that someone subscribed. Best-effort — the
      // subscription itself is already saved above, so a notification
      // failure here shouldn't affect the payment outcome at all.
      try {
        const subscriber = await env.DB.prepare(
          "SELECT display_name, phone FROM subscribers WHERE id = ?"
        )
          .bind(subscriber_id)
          .first();

        const label = subscriber.display_name || subscriber.phone;

        await createNotification({
          recipientType: "model",
          recipientId: model_id,
          type: "new_subscriber",
          message: `${label} just subscribed to your Room.`,
          link: `/inbox.html`,
          env,
        });
      } catch (err) {
        console.error("Failed to create subscription notification:", err);
      }
    }
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
