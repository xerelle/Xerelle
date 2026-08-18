import { jsonResponse, badRequest, generateId, hashPassword } from "../../lib/http.js";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days — matches login.js exactly

export async function handleModelRegister(request, env) {
  const body = await request.json();
  const { username, display_name, phone, email, password, age } = body;

  if (!username || !display_name || !phone || !password || !age) {
    return badRequest("username, display_name, phone, age, and password are required");
  }

  const ageNumber = parseInt(age, 10);
  if (!Number.isInteger(ageNumber) || ageNumber < 18) {
    return badRequest("You must be at least 18 years old to register.");
  }

  if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
    return badRequest(
      "username must be 3-30 characters, lowercase letters/numbers/dots/dashes/underscores only"
    );
  }

  const existingUsername = await env.DB.prepare("SELECT id FROM models WHERE username = ?")
    .bind(username)
    .first();
  if (existingUsername) {
    return badRequest("that username is already taken");
  }

  const existingPhone = await env.DB.prepare("SELECT id FROM models WHERE phone = ?")
    .bind(phone)
    .first();
  if (existingPhone) {
    return badRequest("an account with that phone number already exists");
  }

  const id = generateId();
  const password_hash = await hashPassword(password);

  await env.DB.prepare(
    `INSERT INTO models (id, username, display_name, phone, email, password_hash, age)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, username, display_name, phone, email ?? null, password_hash, ageNumber)
    .run();

  // Create a real session immediately, exactly the same way login.js
  // does — so she's already logged in by the time she reaches the
  // verification step, rather than needing to log in separately right
  // after registering.
  const token = generateId();
  await env.SESSIONS.put(
    `model_session:${token}`,
    JSON.stringify({ model_id: id }),
    { expirationTtl: SESSION_TTL_SECONDS }
  );

  return jsonResponse({
    token,
    id,
    username,
    display_name,
    verification_status: "pending",
    next_step: "verification",
  });
}

