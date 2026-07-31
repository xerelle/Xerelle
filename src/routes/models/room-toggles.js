import { jsonResponse, badRequest } from "../../lib/http.js";
import { getModelIdFromSession } from "./login.js";

// Lets the logged-in model update her Room settings toggles: whether she
// appears in Discover suggestions (shown only to members who already have
// at least one active subscription elsewhere — never a public directory),
// and whether she accepts video calls.
export async function handleUpdateRoomSettings(request, env) {
  const modelId = await getModelIdFromSession(request, env);
  if (!modelId) {
    return jsonResponse({ error: "login_required", message: "Log in first." }, 401);
  }

  const body = await request.json();
  const { discoverable, video_calls_enabled } = body;

  if (typeof discoverable !== "boolean" || typeof video_calls_enabled !== "boolean") {
    return badRequest("discoverable and video_calls_enabled must both be true or false");
  }

  await env.DB.prepare(
    "UPDATE models SET discoverable = ?, video_calls_enabled = ? WHERE id = ?"
  )
    .bind(discoverable ? 1 : 0, video_calls_enabled ? 1 : 0, modelId)
    .run();

  return jsonResponse({ message: "Room settings updated.", discoverable, video_calls_enabled });
}
