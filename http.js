export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function notFound() {
  return jsonResponse({ error: "Not found" }, 404);
}

export function badRequest(message) {
  return jsonResponse({ error: message }, 400);
}

export function generateId() {
  return crypto.randomUUID();
}

export async function hashPassword(password) {
  // Placeholder: use a real password hashing library (e.g. bcrypt via a
  // WASM build, or delegate to a service) before going to production.
  // Workers don't have native bcrypt — this is a stand-in using
  // SubtleCrypto so the schema and flow are demonstrable end to end.
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
