import { jsonResponse, badRequest, generateId } from "../../lib/http.js";
import { isBlocked } from "../blocks.js";

export async function handleSendMessage(request, env) {
  const body = await request.json();
  const { sender_type, subscriber_id, model_id, message_body } = body;

  if (!sender_type || !subscriber_id || !model_id || !message_body) {
    return badRequest("sender_type, subscriber_id, model_id, and message_body are required");
  }

  // If either side has blocked the other, messaging is prevented both
  // ways — checked before anything else, so a block always takes effect
  // immediately regardless of subscription status.
  const blocked = await isBlocked("subscriber", subscriber_id, "model", model_id, env);
  if (blocked) {
    return jsonResponse(
      { error: "blocked", message: "This conversation is no longer available." },
      403
    );
  }

  if (sender_type === "subscriber") {
    const activeSub = await env.DB.prepare(
      `SELECT id FROM subscriptions
       WHERE subscriber_id = ? AND model_id = ? AND status = 'active'
         AND current_period_end > unixepoch()`
    )
      .bind(subscriber_id, model_id)
      .first();

    if (!activeSub) {
      const trialUsed = await env.DB.prepare(
        `SELECT id FROM trial_messages WHERE subscriber_id = ? AND model_id = ?`
      )
        .bind(subscriber_id, model_id)
        .first();

      if (trialUsed) {
        return jsonResponse(
          { error: "subscription_required", message: "Subscribe to keep talking." },
          402
        );
      }

      await env.DB.prepare(
        `INSERT INTO trial_messages (id, subscriber_id, model_id) VALUES (?, ?, ?)`
      )
        .bind(generateId(), subscriber_id, model_id)
        .run();
    }
  }

  const id = generateId();
  await env.DB.prepare(
    `INSERT INTO messages (id, subscriber_id, model_id, sender_type, body)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(id, subscriber_id, model_id, sender_type, message_body)
    .run();

  return jsonResponse({ id, sent_at: Math.floor(Date.now() / 1000) });
}

export async function handleGetMessages(subscriberId, modelId, env) {
  const { results } = await env.DB.prepare(
    `SELECT id, sender_type, body, sent_at FROM messages
     WHERE subscriber_id = ? AND model_id = ?
     ORDER BY sent_at ASC LIMIT 200`
  )
    .bind(subscriberId, modelId)
    .all();

  return jsonResponse({ messages: results });
}
