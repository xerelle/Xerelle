import { jsonResponse, badRequest, generateId, hashPassword } from "../../lib/http.js";

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
