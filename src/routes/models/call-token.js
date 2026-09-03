import { jsonResponse, badRequest } from "../../lib/http.js";
import { getActorFromSession } from "../lib/actor.js";
import { RtcTokenBuilder, RtcRole } from "agora-token";

const TOKEN_EXPIRY_SECONDS = 3600; // 1 hour — generous for a single call session

// Generates a real, signed Agora token authorizing the logged-in actor
// (subscriber or model) to join a specific call's channel. Uses Agora's
// own official token-generation library rather than a hand-rolled
// implementation of their proprietary AccessToken2 format — that
// format has precise byte-packing/versioning requirements that are
// genuinely risky to reimplement from scratch.
export async function handleGetCallToken(request, env, callRequestId) {
  const actor = await getActorFromSession(request, env);
  if (!actor) {
    return jsonResponse({ error: "login_required", message: "Log in first." }, 401);
  }

  const call = await env.DB.prepare(
    "SELECT id, subscriber_id, model_id, status FROM call_requests WHERE id = ?"
  )
    .bind(callRequestId)
    .first();
  if (!call) {
    return badRequest("Call request not found.");
  }

  const isPartOfCall =
    (actor.type === "subscriber" && actor.id === call.subscriber_id) ||
    (actor.type === "model" && actor.id === call.model_id);
  if (!isPartOfCall) {
    return jsonResponse({ error: "forbidden", message: "This isn't your call." }, 403);
  }

  if (call.status !== "accepted") {
    return badRequest("This call hasn't been accepted yet.");
  }

  // The channel name ties both participants to the same Agora "room" —
  // deriving it from the call request's own id keeps it unique and
  // means neither side has to coordinate on a name themselves.
  const channelName = `call-${callRequestId}`;
  const uid = 0; // Agora assigns a real internal uid when using this mode

  const nowSeconds = Math.floor(Date.now() / 1000);
  const privilegeExpiredTs = nowSeconds + TOKEN_EXPIRY_SECONDS;

  const token = RtcTokenBuilder.buildTokenWithUid(
    env.AGORA_APP_ID,
    env.AGORA_APP_CERTIFICATE,
    channelName,
    uid,
    RtcRole.PUBLISHER,
    privilegeExpiredTs,
    privilegeExpiredTs
  );

  return jsonResponse({
    token,
    channel_name: channelName,
    app_id: env.AGORA_APP_ID,
    uid,
    expires_at: privilegeExpiredTs,
  });
}
