import { generateId } from "../../lib/http.js";

// Creates a single notification row. Called from wherever a notification-
// worthy event actually happens (a new Story posted, a model replying to
// a message) — never from a standalone "send notification" endpoint,
// since notifications should always be a side effect of something real.
export async function createNotification({
  recipientType,
  recipientId,
  type,
  message,
  link,
  env,
}) {
  const id = generateId();
  await env.DB.prepare(
    `INSERT INTO notifications (id, recipient_type, recipient_id, type, message, link)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(id, recipientType, recipientId, type, message, link ?? null)
    .run();
}
