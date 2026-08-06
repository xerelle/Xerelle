import { jsonResponse } from "../../lib/http.js";
import { getSubscriberIdFromSession } from "./login.js";

// Returns the logged-in subscriber's notifications, most recent first.
export async function handleGetNotifications(request, env) {
  const subscriberId = await getSubscriberIdFromSession(request, env);
  if (!subscriberId) {
    return jsonResponse({ error: "login_required", message: "Log in first." }, 401);
  }

  const { results } = await env.DB.prepare(
    `SELECT id, type, message, link, is_read, created_at
     FROM notifications
     WHERE recipient_type = 'subscriber' AND recipient_id = ?
     ORDER BY created_at DESC
     LIMIT 100`
  )
    .bind(subscriberId)
    .all();

  return jsonResponse({ notifications: results });
}

// Marks a single notification as read. Only the subscriber it actually
// belongs to can mark it — checked via the WHERE clause, not just trusted
// from the request.
export async function handleMarkNotificationRead(request, env, notificationId) {
  const subscriberId = await getSubscriberIdFromSession(request, env);
  if (!subscriberId) {
    return jsonResponse({ error: "login_required", message: "Log in first." }, 401);
  }

  await env.DB.prepare(
    `UPDATE notifications SET is_read = 1
     WHERE id = ? AND recipient_type = 'subscriber' AND recipient_id = ?`
  )
    .bind(notificationId, subscriberId)
    .run();

  return jsonResponse({ message: "Marked as read." });
}
