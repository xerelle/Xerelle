import { jsonResponse, badRequest } from "../../lib/http.js";

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

    // Nigerian ID documents vary in layout, so this is a heuristic, not a
    // guarantee: look for a line containing "NAME" as a label, and take
    // whatever follows it. Falls back to the longest all-letters line on
    // the document, which is often the name when no explicit label exists.
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
