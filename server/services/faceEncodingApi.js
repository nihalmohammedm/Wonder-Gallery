const DEFAULT_API_URL = "http://localhost:8000";

export class FaceEncodingApiError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = "FaceEncodingApiError";
    this.status = status;
  }
}

export async function ensureFaceEncodingApiAvailable() {
  const apiUrl = getApiUrl();
  const url = new URL("/health", apiUrl);

  let response;

  try {
    response = await fetch(url);
  } catch (error) {
    throw toFaceEncodingApiError(error, url);
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new FaceEncodingApiError(
      payload.detail || payload.error || `Face encoding API health check failed at ${url.toString()}.`,
      response.status,
    );
  }

  if (payload.status !== "ok") {
    throw new FaceEncodingApiError(`Face encoding API health check returned an unexpected payload from ${url.toString()}.`, 503);
  }

  return payload;
}

export async function extractFaceEncodings(buffer, mimeType) {
  const apiUrl = getApiUrl();
  const url = new URL("/v1/faces/encodings", apiUrl);
  url.searchParams.set("detection_model", process.env.FACE_ENCODING_DETECTION_MODEL || "cnn");
  url.searchParams.set("encoding_model", process.env.FACE_ENCODING_MODEL || "small");
  url.searchParams.set("num_jitters", process.env.FACE_ENCODING_NUM_JITTERS || "1");
  url.searchParams.set("upsample_times", process.env.FACE_ENCODING_UPSAMPLE_TIMES || "1");

  const formData = new FormData();
  formData.set("file", new Blob([buffer], { type: mimeType }), `upload.${inferExtension(mimeType)}`);

  let response;

  try {
    response = await fetch(url, {
      method: "POST",
      body: formData,
    });
  } catch (error) {
    throw toFaceEncodingApiError(error, url);
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new FaceEncodingApiError(payload.detail || payload.error || "Face encoding API request failed.", response.status);
  }

  return payload;
}

function getApiUrl() {
  const value = process.env.FACE_ENCODING_API_URL || DEFAULT_API_URL;

  try {
    return new URL(value);
  } catch {
    throw new Error("FACE_ENCODING_API_URL is invalid.");
  }
}

function inferExtension(mimeType) {
  switch ((mimeType || "").toLowerCase()) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "jpg";
  }
}

function toFaceEncodingApiError(error, url) {
  const causeCode = error?.cause?.code || "";
  const causeMessage = error?.cause?.message || "";

  if (causeCode === "ENOTFOUND" || causeCode === "EAI_AGAIN" || causeMessage.includes("Could not resolve host")) {
    return new FaceEncodingApiError(
      `Face encoding API hostname could not be resolved for ${url.origin}. Check FACE_ENCODING_API_URL and DNS.`,
      503,
    );
  }

  if (causeCode === "ECONNREFUSED") {
    return new FaceEncodingApiError(
      `Face encoding API refused the connection at ${url.origin}. Start the service there or update FACE_ENCODING_API_URL.`,
      503,
    );
  }

  if (causeCode === "ETIMEDOUT" || causeCode === "UND_ERR_CONNECT_TIMEOUT" || causeCode === "UND_ERR_HEADERS_TIMEOUT") {
    return new FaceEncodingApiError(`Face encoding API timed out while connecting to ${url.origin}.`, 504);
  }

  if (causeCode === "CERT_HAS_EXPIRED" || causeCode === "DEPTH_ZERO_SELF_SIGNED_CERT" || causeCode === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") {
    return new FaceEncodingApiError(`Face encoding API TLS validation failed for ${url.origin}.`, 503);
  }

  return new FaceEncodingApiError(`Face encoding API is unreachable at ${url.origin}.`, 503);
}
