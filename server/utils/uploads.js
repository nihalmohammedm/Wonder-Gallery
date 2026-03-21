import { createError, getHeader, readMultipartFormData } from "h3";

const MAX_MULTIPART_BODY_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);

export async function readUploadedFile(event, fieldName) {
  assertMultipartBodySize(event);
  const form = await readMultipartFormData(event);
  const filePart = form?.find((part) => part.name === fieldName && part.filename);

  if (!filePart) {
    throw createError({ statusCode: 400, statusMessage: `${fieldName} is required` });
  }

  assertImageFilePart(filePart, fieldName);

  return {
    buffer: Buffer.from(filePart.data),
    mimeType: filePart.type || "application/octet-stream",
    filename: filePart.filename || fieldName,
    fields: Object.fromEntries(
      (form || [])
        .filter((part) => !part.filename)
        .map((part) => [part.name, Buffer.from(part.data).toString("utf8")]),
    ),
  };
}

export async function readMultipartFields(event) {
  assertMultipartBodySize(event);
  const form = await readMultipartFormData(event);
  const files = (form || [])
    .filter((part) => part.filename)
    .map((part) => {
      assertImageFilePart(part, part.name || "file");
      return {
        name: part.name,
        filename: part.filename,
        mimeType: part.type || "application/octet-stream",
        buffer: Buffer.from(part.data),
      };
    });

  return {
    fields: Object.fromEntries(
      (form || [])
        .filter((part) => !part.filename)
        .map((part) => [part.name, Buffer.from(part.data).toString("utf8")]),
    ),
    files,
  };
}

function assertMultipartBodySize(event) {
  const contentLength = Number.parseInt(getHeader(event, "content-length") || "", 10);

  if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BODY_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: `Uploaded file is too large. Max size is ${Math.floor(MAX_MULTIPART_BODY_BYTES / (1024 * 1024))} MB.`,
    });
  }
}

function assertImageFilePart(part, fieldName) {
  const mimeType = `${part?.type || ""}`.toLowerCase();
  const size = part?.data?.length || 0;

  if (!size) {
    throw createError({ statusCode: 400, statusMessage: `${fieldName} must not be empty.` });
  }

  if (size > MAX_MULTIPART_BODY_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: `Uploaded file is too large. Max size is ${Math.floor(MAX_MULTIPART_BODY_BYTES / (1024 * 1024))} MB.`,
    });
  }

  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw createError({
      statusCode: 415,
      statusMessage: "Unsupported file type. Upload a JPEG, PNG, WebP, HEIC, or HEIF image.",
    });
  }
}
