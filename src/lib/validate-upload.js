// Validates an uploaded file by checking its actual byte signature
// ("magic bytes") rather than trusting the client-supplied MIME type,
// which can be freely spoofed. Also enforces a size limit — nothing in
// the app currently caps upload size at all, meaning a single upload
// could consume disproportionate storage or bandwidth.
//
// Returns { valid: true } or { valid: false, error: "..." }.

const SIGNATURES = {
  jpeg: [[0xff, 0xd8, 0xff]],
  png: [[0x89, 0x50, 0x4e, 0x47]],
  webp: [[0x52, 0x49, 0x46, 0x46]], // "RIFF" — WEBP files start this way
  mp4: [
    [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70], // ftyp at offset 4, common variant
    [0x00, 0x00, 0x00, 0x1c, 0x66, 0x74, 0x79, 0x70],
    [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70],
  ],
  webm: [[0x1a, 0x45, 0xdf, 0xa3]],
};

function matchesSignature(bytes, signature) {
  return signature.every((b, i) => bytes[i] === b);
}

function detectFileType(bytes) {
  for (const [type, signatures] of Object.entries(SIGNATURES)) {
    for (const sig of signatures) {
      if (matchesSignature(bytes, sig)) return type;
    }
  }
  return null;
}

// category: 'image' (jpeg/png/webp only) or 'media' (images + mp4/webm)
export async function validateUpload(file, { maxSizeMB, category = "image" } = {}) {
  if (!file || typeof file.arrayBuffer !== "function") {
    return { valid: false, error: "No valid file was uploaded." };
  }

  const maxBytes = (maxSizeMB || 10) * 1024 * 1024;
  if (file.size > maxBytes) {
    return { valid: false, error: `File is too large. Maximum size is ${maxSizeMB || 10}MB.` };
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer.slice(0, 16));
  const detectedType = detectFileType(bytes);

  const imageTypes = ["jpeg", "png", "webp"];
  const videoTypes = ["mp4", "webm"];
  const allowedTypes = category === "media" ? [...imageTypes, ...videoTypes] : imageTypes;

  if (!detectedType || !allowedTypes.includes(detectedType)) {
    const expected = category === "media" ? "a photo or video" : "a photo";
    return { valid: false, error: `That file doesn't look like ${expected}. Please try a different file.` };
  }

  // Return the buffer we already read, so callers don't need to read
  // the file twice (once here, once to actually store it).
  return { valid: true, buffer, detectedType };
}
