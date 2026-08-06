import { jsonResponse } from "../../lib/http.js";
import { getModelIdFromSession } from "./login.js";

// Returns the logged-in model's notifications, most recent first.
export async function handleGetModelNotifications(request, env) {
  const modelId = await getModelIdFromSession(request, env);
  if (!modelId) {
    return jsonResponse({ error: "login_required", message: "Log in first." }, 401);
  }

  const { results } = await env.DB.prepare(
    `SELECT id, type, message, link, is_read, created_at
     FROM notifications
     WHERE recipient_type = 'model' AND recipient_id = ?
     ORDER BY created_at DESC
     LIMIT 100`
  )
    .bind(modelId)
    .all();

  return jsonResponse({ notifications: results });
}

// Marks a single notification as read. Only the model it actually
// belongs to can mark it — checked via the WHERE clause, not just trusted
// from the request.
export async function handleMarkModelNotificationRead(request, env, notificationId) {
  const modelId = await getModelIdFromSession(request, env);
  if (!modelId) {
    return jsonResponse({ error: "login_required", message: "Log in first." }, 401);
  }

  await env.DB.prepare(
    `UPDATE notifications SET is_read = 1
     WHERE id = ? AND recipient_type = 'model' AND recipient_id = ?`
  )
    .bind(notificationId, modelId)
    .run();

  return jsonResponse({ message: "Marked as read." });
}
