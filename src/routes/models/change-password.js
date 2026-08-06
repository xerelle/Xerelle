import { jsonResponse, badRequest, hashPassword } from "../../lib/http.js";
import { getModelIdFromSession } from "./login.js";

// Lets the logged-in model change her password. Requires her current
// password to be provided and verified first, so a stolen session token
// alone isn't enough to take over the account's login credentials.
export async function handleModelChangePassword(request, env) {
  const modelId = await getModelIdFromSession(request, env);
  if (!modelId) {
    return jsonResponse({ error: "login_required", message: "Log in first." }, 401);
  }

  const body = await request.json();
  const { current_password, new_password } = body;

  if (!current_password || !new_password) {
    return badRequest("current_password and new_password are required");
  }
  if (new_password.length < 8) {
    return badRequest("New password must be at least 8 characters.");
  }

  const model = await env.DB.prepare("SELECT password_hash FROM models WHERE id = ?")
    .bind(modelId)
    .first();

  const currentHash = await hashPassword(current_password);
  if (currentHash !== model.password_hash) {
    return badRequest("Your current password is incorrect.");
  }

  const newHash = await hashPassword(new_password);
  await env.DB.prepare("UPDATE models SET password_hash = ? WHERE id = ?")
    .bind(newHash, modelId)
    .run();

  return jsonResponse({ message: "Password updated." });
}
