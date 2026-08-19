import { jsonResponse, badRequest } from "../../lib/http.js";
import { getModelIdFromSession } from "./login.js";

const MAX_LENGTH = 500;

// Lets the logged-in model set or update her auto-reply message — sent
// automatically the moment a subscriber's very first message to her
// arrives, before she's had a chance to reply herself.
export async function handleUpdateAutoReply(request, env) {
  const modelId = await getModelIdFromSession(request, env);
  if (!modelId) {
    return jsonResponse({ error: "login_required", message: "Log in first." }, 401);
  }

  const body = await request.json();
  const { auto_reply_message } = body;

  if (typeof auto_reply_message !== "string") {
    return badRequest("auto_reply_message is required");
  }

  const trimmed = auto_reply_message.trim();
  if (trimmed.length > MAX_LENGTH) {
    return badRequest(`Auto-reply must be ${MAX_LENGTH} characters or fewer.`);
  }

  await env.DB.prepare("UPDATE models SET auto_reply_message = ? WHERE id = ?")
    .bind(trimmed || null, modelId)
    .run();

  return jsonResponse({ message: "Auto-reply updated.", auto_reply_message: trimmed });
}

// Returns the model's current auto-reply message, so the settings page
// can show what's already saved.
export async function handleGetAutoReply(request, env) {
  const modelId = await getModelIdFromSession(request, env);
  if (!modelId) {
    return jsonResponse({ error: "login_required", message: "Log in first." }, 401);
  }

  const model = await env.DB.prepare("SELECT auto_reply_message FROM models WHERE id = ?")
    .bind(modelId)
    .first();

  return jsonResponse({ auto_reply_message: model?.auto_reply_message || "" });
}
