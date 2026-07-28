import { jsonResponse, badRequest, generateId, hashPassword } from "../../lib/http.js";

// Registering gets a subscriber an account and nothing else — no feed,
// no discovery, no browsing. It only unlocks the ability to (a) reach a
// model via her direct link, or (b) search her exact username.
export async function handleSubscriberRegister(request, env) {
  const body = await request.json();
  const { phone, email, password } = body;

  if (!phone || !password) {
    return badRequest("phone and password are required");
  }

  const existing = await env.DB.prepare("SELECT id FROM subscribers WHERE phone = ?")
    .bind(phone)
    .first();
  if (existing) {
    return badRequest("an account with that phone number already exists");
  }

  const id = generateId();
  const password_hash = await hashPassword(password);

  await env.DB.prepare(
    `INSERT INTO subscribers (id, phone, email, password_hash) VALUES (?, ?, ?, ?)`
  )
    .bind(id, phone, email ?? null, password_hash)
    .run();

  return jsonResponse({ id, phone });
}
