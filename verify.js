import { jsonResponse, badRequest } from "../../lib/http.js";

// Records that ID + liveness documents were submitted. The actual
// pass/fail decision comes back from your verification vendor
// (Smile Identity / Youverify) via their own webhook — wire that up
// as a separate route once you've picked a vendor and gotten API keys.
// This route just handles the initial submission and file storage.
export async function handleModelVerify(request, env) {
  const formData = await request.formData();
  const modelId = formData.get("model_id");
  const idDocument = formData.get("id_document");   // File
  const livenessSelfie = formData.get("liveness_selfie"); // File

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

  // TODO: call your verification vendor's API here with these documents,
  // or queue them for the vendor's async review, depending on which one
  // you choose. Their webhook should call an (as-yet-unbuilt) endpoint
  // that updates verification_status to 'verified' or 'rejected'.

  return jsonResponse({
    model_id: modelId,
    verification_status: "pending",
    message: "Documents received. Review usually clears within a few hours.",
  });
}
