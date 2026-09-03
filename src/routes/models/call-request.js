import { jsonResponse, badRequest, generateId } from "../../lib/http.js";
import { getSubscriberIdFromSession } from "../subscribers/login.js";
import { createNotification } from "../lib/notifications.js";

const REQUEST_EXPIRY_SECONDS = 48 * 60 * 60; // 48 hours

// Lets a subscriber request a scheduled call (audio or video) with a
// model she's actively subscribed to. This only creates the REQUEST —
// she reviews it and picks the actual time when accepting; nothing is
// scheduled yet at this point. Unanswered requests auto-expire after 48
// hours (checked lazily at read time, same pattern as Feed/Story expiry
// elsewhere — no background job needed).
export async function handleRequestCall(request, env) {
  const subscriber_id = await getSubscriberIdFromSession(request, env);
  if (!subscriber_id) {
    return jsonResponse({ error: "login_required", message: "Log in first." }, 401);
  }

  const body = await request.json();
  const { model_id, call_type, note } = body;

  if (!model_id || !call_type) {
    return badRequest("model_id and call_type are required");
  }
  if (call_type !== "audio" && call_type !== "video") {
    return badRequest("call_type must be 'audio' or 'video'");
  }

  const model = await env.DB.prepare(
    "SELECT id, username, display_name, video_calls_enabled, verification_status FROM models WHERE id = ?"
  )
    .bind(model_id)
    .first();
  if (!model || model.verification_status !== "verified") {
    return badRequest("model not found or not yet verified");
  }
  if (!model.video_calls_enabled) {
    return badRequest("This creator isn't accepting call requests right now.");
  }

  const activeSub = await env.DB.prepare(
    `SELECT id FROM subscriptions
     WHERE subscriber_id = ? AND model_id = ? AND status = 'active'
       AND current_period_end > unixepoch()`
  )
    .bind(subscriber_id, model_id)
    .first();
  if (!activeSub) {
    return jsonResponse(
      { error: "subscription_required", message: "Subscribe to request a call." },
      403
    );
  }

  const requestId = generateId();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiresAt = nowSeconds + REQUEST_EXPIRY_SECONDS;

  await env.DB.prepare(
    `INSERT INTO call_requests (id, subscriber_id, model_id, call_type, note, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(requestId, subscriber_id, model_id, call_type, note || null, expiresAt)
    .run();

  try {
    const subscriber = await env.DB.prepare(
      "SELECT display_name, phone FROM subscribers WHERE id = ?"
    )
      .bind(subscriber_id)
      .first();
    const label = subscriber.display_name || subscriber.phone;
    const callTypeLabel = call_type === "video" ? "video call" : "audio call";

    await createNotification({
      recipientType: "model",
      recipientId: model_id,
      type: "call_requested",
      message: `${label} requested a ${callTypeLabel}.`,
      link: `/inbox.html`,
      env,
    });
  } catch (err) {
    console.error("Failed to create call request notification:", err);
  }

  return jsonResponse({ id: requestId, status: "pending", expires_at: expiresAt });
}

// A call_request's EFFECTIVE status — a still-pending request past its
// expires_at is treated as expired everywhere it's read, without
// needing any background job to actually write that back.
export function getEffectiveCallStatus(row, nowSeconds) {
  if (row.status !== "pending") return row.status;
  return row.expires_at && row.expires_at < nowSeconds ? "expired" : "pending";
}

// Her real call-acceptance rate — accepted / (accepted + declined +
// expired). Requires a minimum sample size before returning a real
// number, so one early decline doesn't permanently brand a brand-new
// model; returns null (meaning "not enough data yet") below that.
const MIN_REQUESTS_FOR_SCORE = 3;

export async function getCallAcceptanceRate(modelId, env) {
  const nowSeconds = Math.floor(Date.now() / 1000);

  const { results } = await env.DB.prepare(
    `SELECT status, expires_at FROM call_requests WHERE model_id = ?`
  )
    .bind(modelId)
    .all();

  let accepted = 0;
  let resolved = 0;

  for (const row of results) {
    const effective = getEffectiveCallStatus(row, nowSeconds);
    if (effective === "pending") continue;
    resolved++;
    if (effective === "accepted") accepted++;
  }

  if (resolved < MIN_REQUESTS_FOR_SCORE) {
    return null;
  }

  return Math.round((accepted / resolved) * 100);
}
