import { jsonResponse, badRequest, generateId } from "../lib/http.js";
import { getActorFromSession } from "../lib/actor.js";

// Looks up an id by username for the given type ('model' or 'subscriber').
async function lookupIdByUsername(type, username, env) {
  const table = type === "model" ? "models" : "subscribers";
  const row = await env.DB.prepare(`SELECT id FROM ${table} WHERE username = ?`)
    .bind(username)
    .first();
  return row ? row.id : null;
}

// Blocks always require a reason — a model can't cut off a paying
// subscriber arbitrarily, and this creates an accountable record either
// direction. Blocking is mutual in effect: once blocked, messaging is
// prevented both ways (enforced in the messages route).
export async function handleCreateBlock(request, env) {
  const actor = await getActorFromSession(request, env);
  if (!actor) {
    return jsonResponse({ error: "login_required", message: "Log in first." }, 401);
  }

  const body = await request.json();
  const { blocked_type, blocked_username, reason } = body;

  if (!blocked_type || !["model", "subscriber"].includes(blocked_type)) {
    return badRequest("blocked_type must be 'model' or 'subscriber'");
  }
  if (!blocked_username) {
    return badRequest("blocked_username is required");
  }
  if (!reason || !reason.trim()) {
    return badRequest("A reason is required to block someone.");
  }

  const blockedId = await lookupIdByUsername(blocked_type, blocked_username, env);
  if (!blockedId) {
    return badRequest("No account found with that username.");
  }

  if (blockedId === actor.id && blocked_type === actor.type) {
    return badRequest("You can't block yourself.");
  }

  const id = generateId();
  try {
    await env.DB.prepare(
      `INSERT INTO blocks (id, blocker_type, blocker_id, blocked_type, blocked_id, reason)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(id, actor.type, actor.id, blocked_type, blockedId, reason.trim())
      .run();
  } catch (err) {
    // UNIQUE constraint — already blocked. Not an error from the user's
    // point of view, just a no-op.
    return jsonResponse({ message: "Already blocked." });
  }

  return jsonResponse({ message: "Blocked." });
}

// Lists everyone the logged-in actor (model or subscriber) has blocked.
export async function handleListBlocks(request, env) {
  const actor = await getActorFromSession(request, env);
  if (!actor) {
    return jsonResponse({ error: "login_required", message: "Log in first." }, 401);
  }

  const { results } = await env.DB.prepare(
    `SELECT b.id, b.blocked_type, b.blocked_id, b.reason, b.created_at,
       CASE WHEN b.blocked_type = 'model' THEN m.username ELSE s.username END AS blocked_username,
       CASE WHEN b.blocked_type = 'model' THEN m.display_name ELSE s.display_name END AS blocked_display_name
     FROM blocks b
     LEFT JOIN models m ON b.blocked_type = 'model' AND m.id = b.blocked_id
     LEFT JOIN subscribers s ON b.blocked_type = 'subscriber' AND s.id = b.blocked_id
     WHERE b.blocker_type = ? AND b.blocker_id = ?
     ORDER BY b.created_at DESC`
  )
    .bind(actor.type, actor.id)
    .all();

  return jsonResponse({ blocks: results });
}

// Removes a block (unblocking someone).
export async function handleRemoveBlock(request, env, blockId) {
  const actor = await getActorFromSession(request, env);
  if (!actor) {
    return jsonResponse({ error: "login_required", message: "Log in first." }, 401);
  }

  await env.DB.prepare(
    "DELETE FROM blocks WHERE id = ? AND blocker_type = ? AND blocker_id = ?"
  )
    .bind(blockId, actor.type, actor.id)
    .run();

  return jsonResponse({ message: "Unblocked." });
}

// Checks whether a block exists between two parties, in EITHER direction.
// Used by the messages route to prevent sending once either side has
// blocked the other.
export async function isBlocked(typeA, idA, typeB, idB, env) {
  const row = await env.DB.prepare(
    `SELECT id FROM blocks
     WHERE (blocker_type = ? AND blocker_id = ? AND blocked_type = ? AND blocked_id = ?)
        OR (blocker_type = ? AND blocker_id = ? AND blocked_type = ? AND blocked_id = ?)
     LIMIT 1`
  )
    .bind(typeA, idA, typeB, idB, typeB, idB, typeA, idA)
    .first();

  return !!row;
}
