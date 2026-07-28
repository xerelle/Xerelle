import { jsonResponse, badRequest } from "../../lib/http.js";

export async function handleModelVerify(request, env) {
  const formData = await request.formData();
  const modelId = formData.get("model_id");
  const idDocument = formData.get("id_document");
  const livenessSelfie = formData.get("liveness_selfie");

  if (!modelId || !idDocument || !livenessSelfie) {
    return badRequest("model_id, id_document, and liveness_selfie are required");
  }

  const idKey = `verification/${modelId}/id-document-${Date.now()}`;
  const selfieKey = `verification/${modelId}/liveness-${Date.now()}`;

  await env.MEDIA.put(idKey, await idDocument.arrayBuffer());
  await env.MEDIA.put(selfieKey, await livenessSelfie.arrayBuffer());

  await env.DB.prepare(
    `UPDATE models
     SET id_document_url = ?, liveness_selfie_url = ?, verification_status = 'pending'
     WHERE id = ?`
  )
    .bind(idKey, selfieKey, modelId)
    .run();

  return jsonResponse({
    model_id: modelId,
    verification_status: "pending",
    message: "Documents received. Review usually clears within a few hours.",
  });
}
