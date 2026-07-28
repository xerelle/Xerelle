import { jsonResponse, badRequest, generateId, hashPassword } from "../../lib/http.js";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

// Logs a model in with EITHER her username OR her phone number, plus her
// password. On success, creates a session token stored in KV (mapping
// token -> model_id) and returns it to the client, which should store it
// (e.g. localStorage) and send it back as an "Authorization: Bearer
// <token>" header on future requests.
export async function handleModelLogin(request, env) {
  const body = await request.json();
  const { identifier, password } = body;

  if (!identifier || !password) {
    return badRequest("username/phone and password are required");
  }

  const model = await env.DB.prepare(
    "SELECT id, username, display_name, password_hash FROM models WHERE username = ? OR phone = ?"
  )
    .bind(identifier, identifier)
    .first();

  if (!model) {
    return badRequest("no account found with that username or phone number");
  }

  const password_hash = await hashPassword(password);
  if (password_hash !== model.password_hash) {
    return badRequest("incorrect password");
  }

  const token = generateId();
  await env.SESSIONS.put(
    `model_session:${token}`,
    JSON.stringify({ model_id: model.id }),
    { expirationTtl: SESSION_TTL_SECONDS }
  );

  return jsonResponse({
    token,
    id: model.id,
    username: model.username,
    display_name: model.display_name,
  });
}

// Looks up a session token in KV and returns the associated model_id, or
// null if the token is missing/expired/invalid.
export async function getModelIdFromSession(request, env) {
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const raw = await env.SESSIONS.get(`model_session:${token}`);
  if (!raw) return null;

  try {
    return JSON.parse(raw).model_id;
  } catch {
    return null;
  }
}
