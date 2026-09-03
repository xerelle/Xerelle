import { jsonResponse, badRequest } from "../../lib/http.js";
import { getModelIdFromSession } from "./login.js";
import { createNotification } from "../lib/notifications.js";

// Lets a model respond to a pending call request — either accepting
// (and setting the actual date/time herself, since it's her schedule)
// or declining. Both outcomes count toward her public call-acceptance
// score; only she decides which this becomes.
export async function handleRespondToCall(request, env, callRequestId) {
  const modelId = await getModelIdFromSession(request, env);
  if (!modelId) {
    return jsonResponse({ error: "login_required", message: "Log in first." }, 401);
  }

  const body = await request.json();
  const { action, scheduled_at } = body;

  if (action !== "accept" && action !== "decline") {
    return badRequest("action must be 'accept' or 'decline'");
  }

  const call = await env.DB.prepare(
    "SELECT id, subscriber_id, model_id, status, call_type, expires_at FROM call_requests WHERE id = ?"
  )
    .bind(callRequestId)
    .first();
  if (!call) {
    return badRequest("Call request not found.");
  }
  if (call.model_id !== modelId) {
    return jsonResponse({ error: "forbidden", message: "This isn't your call request." }, 403);
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (call.status !== "pending") {
    return badRequest("This request has already been responded to.");
  }
  if (call.expires_at && call.expires_at < nowSeconds) {
    return badRequest("This request has expired.");
  }

  if (action === "accept") {
    if (!scheduled_at || !Number.isInteger(scheduled_at)) {
      return badRequest("scheduled_at (a real future time) is required to accept.");
    }
    if (scheduled_at <= nowSeconds) {
      return badRequest("scheduled_at must be in the future.");
    }

    await env.DB.prepare(
      `UPDATE call_requests SET status = 'accepted', scheduled_at = ?, responded_at = ? WHERE id = ?`
    )
      .bind(scheduled_at, nowSeconds, callRequestId)
      .run();
  } else {
    await env.DB.prepare(
      `UPDATE call_requests SET status = 'declined', responded_at = ? WHERE id = ?`
    )
      .bind(nowSeconds, callRequestId)
      .run();
  }

  try {
    const model = await env.DB.prepare("SELECT display_name, username FROM models WHERE id = ?")
      .bind(modelId)
      .first();
    const callTypeLabel = call.call_type === "video" ? "video call" : "audio call";

    const message = action === "accept"
      ? `${model.display_name} accepted your ${callTypeLabel} request.`
      : `${model.display_name} declined your ${callTypeLabel} request.`;

    await createNotification({
      recipientType: "subscriber",
      recipientId: call.subscriber_id,
      type: action === "accept" ? "call_accepted" : "call_declined",
      message,
      link: `/room.html?u=${model.username}`,
      env,
    });
  } catch (err) {
    console.error("Failed to create call response notification:", err);
  }

  return jsonResponse({ status: action === "accept" ? "accepted" : "declined" });
}

// Returns the logged-in model's own call requests — pending ones she
// still needs to respond to, plus resolved ones for her own reference.
export async function handleGetModelCallRequests(request, env) {
  const modelId = await getModelIdFromSession(request, env);
  if (!modelId) {
    return jsonResponse({ error: "login_required", message: "Log in first." }, 401);
  }

  const { results } = await env.DB.prepare(
    `SELECT cr.id, cr.call_type, cr.status, cr.note, cr.scheduled_at, cr.expires_at, cr.requested_at,
       COALESCE(s.display_name, s.phone) AS subscriber_label
     FROM call_requests cr
     INNER JOIN subscribers s ON s.id = cr.subscriber_id
     WHERE cr.model_id = ?
     ORDER BY cr.requested_at DESC
     LIMIT 100`
  )
    .bind(modelId)
    .all();

  const nowSeconds = Math.floor(Date.now() / 1000);
  const requests = results.map((row) => ({
    ...row,
    effective_status:
      row.status === "pending" && row.expires_at && row.expires_at < nowSeconds
        ? "expired"
        : row.status,
  }));

  return jsonResponse({ requests });
}
