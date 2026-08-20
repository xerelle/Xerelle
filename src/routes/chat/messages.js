import { jsonResponse, badRequest, generateId } from "../../lib/http.js";
import { isBlocked } from "../blocks.js";
import { createNotification } from "../lib/notifications.js";
import { getActorFromSession } from "../lib/actor.js";
import { recordStreakActivity, getEffectiveStreak } from "../lib/streaks.js";

const MODEL_FREE_REPLY_LIMIT = 2; // initial reply + one follow-up nudge

export async function handleSendMessage(request, env) {
  const actor = await getActorFromSession(request, env);
  if (!actor) {
    return jsonResponse({ error: "login_required", message: "Log in first." }, 401);
  }

  const body = await request.json();
  const { subscriber_id, model_id, message_body } = body;

  if (!subscriber_id || !model_id || !message_body) {
    return badRequest("subscriber_id, model_id, and message_body are required");
  }

  let sender_type;
  if (actor.type === "subscriber") {
    if (actor.id !== subscriber_id) {
      return jsonResponse({ error: "forbidden", message: "You can only send messages as yourself." }, 403);
    }
    sender_type = "subscriber";
  } else if (actor.type === "model") {
    if (actor.id !== model_id) {
      return jsonResponse({ error: "forbidden", message: "You can only send messages as yourself." }, 403);
    }
    sender_type = "model";
  } else {
    return jsonResponse({ error: "forbidden" }, 403);
  }

  const blocked = await isBlocked("subscriber", subscriber_id, "model", model_id, env);
  if (blocked) {
    return jsonResponse(
      { error: "blocked", message: "This conversation is no longer available." },
      403
    );
  }

  const activeSub = await env.DB.prepare(
    `SELECT id FROM subscriptions
     WHERE subscriber_id = ? AND model_id = ? AND status = 'active'
       AND current_period_end > unixepoch()`
  )
    .bind(subscriber_id, model_id)
    .first();

  let isFirstTrialMessage = false;

  if (sender_type === "subscriber") {
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

      isFirstTrialMessage = true;
      await env.DB.prepare(
        `INSERT INTO trial_messages (id, subscriber_id, model_id) VALUES (?, ?, ?)`
      )
        .bind(generateId(), subscriber_id, model_id)
        .run();
    }
  }

  if (sender_type === "model" && !activeSub) {
    const priorModelMessages = await env.DB.prepare(
      `SELECT COUNT(*) as count FROM messages WHERE subscriber_id = ? AND model_id = ? AND sender_type = 'model'`
    )
      .bind(subscriber_id, model_id)
      .first();

    if (priorModelMessages.count >= MODEL_FREE_REPLY_LIMIT) {
      return jsonResponse(
        {
          error: "subscription_required",
          message: "You've used both your free messages to this person — she needs to subscribe before you can message her again.",
        },
        402
      );
    }
  }

  const id = generateId();
  await env.DB.prepare(
    `INSERT INTO messages (id, subscriber_id, model_id, sender_type, body)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(id, subscriber_id, model_id, sender_type, message_body)
    .run();

  try {
    await recordStreakActivity(env, subscriber_id, model_id, sender_type);
  } catch (err) {
    console.error("Streak update failed:", err);
  }

  if (isFirstTrialMessage) {
    try {
      const model = await env.DB.prepare(
        "SELECT auto_reply_message FROM models WHERE id = ?"
      )
        .bind(model_id)
        .first();

      if (model && model.auto_reply_message && model.auto_reply_message.trim()) {
        await env.DB.prepare(
          `INSERT INTO messages (id, subscriber_id, model_id, sender_type, body)
           VALUES (?, ?, ?, 'model', ?)`
        )
          .bind(generateId(), subscriber_id, model_id, model.auto_reply_message.trim())
          .run();

        await recordStreakActivity(env, subscriber_id, model_id, "model");
      }
    } catch (err) {
      console.error("Auto-reply failed:", err);
    }
  }

  if (sender_type === "model") {
    try {
      const model = await env.DB.prepare("SELECT username, display_name FROM models WHERE id = ?")
        .bind(model_id)
        .first();

      await createNotification({
        recipientType: "subscriber",
        recipientId: subscriber_id,
        type: "new_message",
        message: `${model.display_name} sent you a message.`,
        link: `/chat.html?u=${model.username}`,
        env,
      });
    } catch (err) {
      console.error("Failed to create message notification:", err);
    }
  }

  if (sender_type === "subscriber") {
    try {
      const subscriber = await env.DB.prepare(
        "SELECT username, display_name, phone FROM subscribers WHERE id = ?"
      )
        .bind(subscriber_id)
        .first();

      const label = subscriber.display_name || subscriber.phone;

      await createNotification({
        recipientType: "model",
        recipientId: model_id,
        type: "new_message",
        message: `${label} sent you a message.`,
        link: `/inbox.html`,
        env,
      });
    } catch (err) {
      console.error("Failed to create message notification:", err);
    }
  }

  return jsonResponse({ id, sent_at: Math.floor(Date.now() / 1000) });
}

export async function handleGetMessages(request, subscriberId, modelId, env) {
  const actor = await getActorFromSession(request, env);
  if (!actor) {
    return jsonResponse({ error: "login_required", message: "Log in first." }, 401);
  }

  const isPartOfConversation =
    (actor.type === "subscriber" && actor.id === subscriberId) ||
    (actor.type === "model" && actor.id === modelId);

  if (!isPartOfConversation) {
    return jsonResponse({ error: "forbidden", message: "This isn't your conversation." }, 403);
  }

  const { results } = await env.DB.prepare(
    `SELECT id, sender_type, body, sent_at FROM messages
     WHERE subscriber_id = ? AND model_id = ?
     ORDER BY sent_at ASC LIMIT 200`
  )
    .bind(subscriberId, modelId)
    .all();

  // Include the current streak alongside the conversation, so the chat
  // header can show it without a separate request.
  let streak = 0;
  try {
    const streakRow = await env.DB.prepare(
      "SELECT * FROM chat_streaks WHERE subscriber_id = ? AND model_id = ?"
    )
      .bind(subscriberId, modelId)
      .first();
    streak = getEffectiveStreak(streakRow);
  } catch (err) {
    console.error("Failed to fetch streak:", err);
  }

  return jsonResponse({ messages: results, streak });
}
