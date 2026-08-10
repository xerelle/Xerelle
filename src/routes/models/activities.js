import { jsonResponse } from "../../lib/http.js";
import { getModelIdFromSession } from "./login.js";

// Returns the model's 20 most recent follows + likes combined into one
// feed, newest first. This is the one place on the platform where WHO
// followed/liked IS shown — a deliberate, later exception to the
// original "identities always hidden" rule, granted only to the model
// about her own account. Subscribers still never see this about anyone.
export async function handleGetActivities(request, env) {
  const modelId = await getModelIdFromSession(request, env);
  if (!modelId) {
    return jsonResponse({ error: "login_required", message: "Log in first." }, 401);
  }

  const { results } = await env.DB.prepare(
    `SELECT 'follow' AS type, mf.created_at,
       COALESCE(s.display_name, s.phone) AS subscriber_name
     FROM model_follows mf
     JOIN subscribers s ON s.id = mf.subscriber_id
     WHERE mf.model_id = ?

     UNION ALL

     SELECT 'like' AS type, ml.created_at,
       COALESCE(s.display_name, s.phone) AS subscriber_name
     FROM model_likes ml
     JOIN subscribers s ON s.id = ml.subscriber_id
     WHERE ml.model_id = ?

     ORDER BY created_at DESC
     LIMIT 25`
  )
    .bind(modelId, modelId)
    .all();

  return jsonResponse({ activities: results });
}
