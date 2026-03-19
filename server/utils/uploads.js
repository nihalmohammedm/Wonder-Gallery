import { createError, readMultipartFormData } from "h3";

export async function readUploadedFile(event, fieldName) {
  const form = await readMultipartFormData(event);
  const filePart = form?.find((part) => part.name === fieldName && part.filename);

  if (!filePart) {
    throw createError({ statusCode: 400, statusMessage: `${fieldName} is required` });
  }

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
  const form = await readMultipartFormData(event);

  return {
    fields: Object.fromEntries(
      (form || [])
        .filter((part) => !part.filename)
        .map((part) => [part.name, Buffer.from(part.data).toString("utf8")]),
    ),
    files: (form || [])
      .filter((part) => part.filename)
      .map((part) => ({
        name: part.name,
        filename: part.filename,
        mimeType: part.type || "application/octet-stream",
        buffer: Buffer.from(part.data),
      })),
  };
}
