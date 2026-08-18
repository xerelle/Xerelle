import { jsonResponse, badRequest } from "../../lib/http.js";
import { getModelIdFromSession } from "./login.js";
import { validateUpload } from "../../lib/validate-upload.js";

// Simple fuzzy name matching: normalizes both names (lowercase, strips
// punctuation/extra spaces), then checks how many words from the shorter
// name appear in the longer one. This deliberately tolerates middle
// names, initials, and minor spelling/OCR noise — it's a decision-support
// signal for manual review, not a hard pass/fail gate on its own.
function normalizeNameWords(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1); // drop single-letter noise/initials-only tokens
}

function fuzzyMatchNames(nameA, nameB) {
  const wordsA = normalizeNameWords(nameA);
  const wordsB = normalizeNameWords(nameB);
  if (wordsA.length === 0 || wordsB.length === 0) return "mismatch";

  const [shorter, longer] = wordsA.length <= wordsB.length ? [wordsA, wordsB] : [wordsB, wordsA];
  const matchedCount = shorter.filter((word) => longer.includes(word)).length;
  const matchRatio = matchedCount / shorter.length;

  if (matchRatio >= 0.8) return "match";
  if (matchRatio >= 0.4) return "partial_match";
  return "mismatch";
}

// Calls OCR.space to extract raw text from the uploaded ID image, then
// pulls out the most likely "name" line. Best-effort — if OCR fails or
// finds nothing useful, verification still proceeds; it just won't have
// an automatic match signal, and falls back to your manual judgment.
async function extractNameFromId(idDocument, env) {
  try {
    const formData = new FormData();
    formData.append("apikey", env.OCR_SPACE_API_KEY);
    formData.append("language", "eng");
    formData.append("OCREngine", "2");
    formData.append("file", idDocument, "id-document.jpg");

    const res = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();

    if (data.IsErroredOnProcessing || !data.ParsedResults || data.ParsedResults.length === 0) {
      return null;
    }

    const rawText = data.ParsedResults[0].ParsedText || "";

    const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);

    const labeledLine = lines.find((l) => /name/i.test(l));
    if (labeledLine) {
      const afterLabel = labeledLine.replace(/.*name[:\s]*/i, "").trim();
      if (afterLabel.length > 2) return afterLabel;
    }

    const letterLines = lines.filter((l) => /^[A-Za-z\s.'-]{4,}$/.test(l));
    if (letterLines.length > 0) {
      return letterLines.sort((a, b) => b.length - a.length)[0];
    }

    return null;
  } catch (err) {
    console.error("OCR extraction failed:", err);
    return null;
  }
}

export async function handleModelVerify(request, env) {
  // The model_id used below is ALWAYS the one from the actual logged-in
  // session — never trusted from the form. Previously the form's
  // model_id was used directly, meaning anyone could submit documents
  // under a DIFFERENT model's ID and corrupt or hijack her verification.
  const sessionModelId = await getModelIdFromSession(request, env);
  if (!sessionModelId) {
    return jsonResponse({ error: "login_required", message: "Log in first." }, 401);
  }

  const formData = await request.formData();
  const idDocument = formData.get("id_document");
  const livenessSelfie = formData.get("liveness_selfie");

  if (!idDocument || !livenessSelfie) {
    return badRequest("id_document and liveness_selfie are required");
  }

  // Both must genuinely be photos — checked by actual file bytes, not
  // just trusting the browser's claimed file type.
  const idValidation = await validateUpload(idDocument, { maxSizeMB: 10, category: "image" });
  if (!idValidation.valid) {
    return badRequest(`ID document: ${idValidation.error}`);
  }
  const selfieValidation = await validateUpload(livenessSelfie, { maxSizeMB: 10, category: "image" });
  if (!selfieValidation.valid) {
    return badRequest(`Selfie: ${selfieValidation.error}`);
  }

  const modelId = sessionModelId;

  const idKey = `verification/${modelId}/id-document-${Date.now()}`;
  const selfieKey = `verification/${modelId}/liveness-${Date.now()}`;

  await env.MEDIA.put(idKey, idValidation.buffer);
  await env.MEDIA.put(selfieKey, selfieValidation.buffer);

  // OCR + name cross-check — best-effort, never blocks submission if it fails.
  let idExtractedName = null;
  let nameMatchStatus = "not_checked";

  try {
    const model = await env.DB.prepare("SELECT display_name FROM models WHERE id = ?")
      .bind(modelId)
      .first();

    if (model && env.OCR_SPACE_API_KEY) {
      idExtractedName = await extractNameFromId(idDocument, env);
      if (idExtractedName) {
        nameMatchStatus = fuzzyMatchNames(model.display_name, idExtractedName);
      }
    }
  } catch (err) {
    console.error("Name verification check failed:", err);
  }

  await env.DB.prepare(
    `UPDATE models
     SET id_document_url = ?, liveness_selfie_url = ?, verification_status = 'pending',
         id_extracted_name = ?, name_match_status = ?
     WHERE id = ?`
  )
    .bind(idKey, selfieKey, idExtractedName, nameMatchStatus, modelId)
    .run();

  return jsonResponse({
    model_id: modelId,
    verification_status: "pending",
    message: "Documents received. Review usually clears within a few hours.",
  });
}
