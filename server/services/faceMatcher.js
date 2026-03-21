import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { promisify } from "node:util";
import { saveUpload } from "../store.js";
import { extractFaceEncodings } from "./faceEncodingApi.js";

const execFileAsync = promisify(execFile);
const PREVIEW_MAX_SIZE = 1600;
const PREVIEW_JPEG_QUALITY = 82;
const REFERENCE_MAX_SIZE = 1280;
const REFERENCE_JPEG_QUALITY = 80;

export async function extractPrimaryFaceEncoding(buffer, mimeType, options = {}) {
  const normalizedMimeType = normalizeMimeType(mimeType);
  const safeBuffer = await normalizeImageBuffer(buffer, normalizedMimeType);
  const encodingResponse = await extractFaceEncodings(safeBuffer, normalizedMimeType);
  const primaryFace = pickPrimaryFace(encodingResponse.faces || []);

  if (!primaryFace) {
    throw new Error("No face detected in the uploaded image.");
  }

  const imagePath = options.persistUpload ? await persistReferenceImage(safeBuffer, normalizedMimeType) : null;

  return {
    box: primaryFace.box,
    encoding: primaryFace.encoding,
    imagePath,
    mimeType: normalizedMimeType,
  };
}

export async function extractPhotoFaceEncodings(buffer, mimeType) {
  const normalizedMimeType = normalizeMimeType(mimeType);
  const safeBuffer = await normalizeImageBuffer(buffer, normalizedMimeType);
  const encodingResponse = await extractFaceEncodings(safeBuffer, normalizedMimeType);
  const faces = (encodingResponse.faces || []).map((face, index) => ({
    id: `f${index + 1}`,
    box: face.box,
    encoding: face.encoding,
  }));

  return {
    mimeType: normalizedMimeType,
    imageWidth: null,
    imageHeight: null,
    regionCount: faces.length,
    faces,
    meta: encodingResponse.meta || null,
  };
}

async function createGalleryPreview(buffer, mimeType) {
  return createStorageOptimizedImage(buffer, mimeType, {
    maxSize: PREVIEW_MAX_SIZE,
    quality: PREVIEW_JPEG_QUALITY,
  });
}

export async function createDriveSyncImage(buffer, mimeType) {
  if (process.platform === "darwin") {
    return {
      buffer: await transcodeAndResizeImageWithSips(buffer, inferExtension(mimeType), "jpeg", PREVIEW_MAX_SIZE),
      mimeType: "image/jpeg",
      extension: "jpg",
    };
  }

  return createGalleryPreview(buffer, mimeType);
}

export async function createStorageOptimizedImage(buffer, mimeType, options = {}) {
  const normalizedMimeType = normalizeMimeType(mimeType);
  const safeBuffer = await normalizeImageBuffer(buffer, normalizedMimeType);
  const optimizedBuffer = await renderOptimizedJpeg(safeBuffer, normalizedMimeType, options.maxSize || PREVIEW_MAX_SIZE, options.quality || PREVIEW_JPEG_QUALITY);

  return {
    buffer: optimizedBuffer,
    mimeType: "image/jpeg",
    extension: "jpg",
  };
}

export async function sanitizeDriveImage(buffer, mimeType) {
  if (process.platform === "darwin") {
    return {
      buffer: await transcodeImageWithSips(buffer, inferExtension(mimeType), "jpeg"),
      mimeType: "image/jpeg",
    };
  }

  const normalizedMimeType = normalizeMimeType(mimeType);
  return {
    buffer: await normalizeImageBuffer(buffer, normalizedMimeType),
    mimeType: normalizedMimeType,
  };
}

function pickPrimaryFace(faces) {
  return [...faces].sort((left, right) => faceArea(right.box) - faceArea(left.box))[0] || null;
}

function faceArea(box) {
  if (!box) {
    return 0;
  }

  return Math.max(0, (box.right - box.left) * (box.bottom - box.top));
}

async function normalizeImageBuffer(buffer, mimeType) {
  if (shouldPreemptivelyTranscodeJpeg(mimeType, buffer)) {
    return transcodeJpegWithSips(buffer);
  }

  try {
    await sharp(buffer).metadata();
    return await assertSharpPipeline(buffer, mimeType);
  } catch (error) {
    if (!shouldStripJpegMetadata(error, mimeType, buffer)) {
      throw error;
    }

    const strippedBuffer = stripJpegAppMetadata(buffer);

    try {
      await sharp(strippedBuffer).metadata();
      return await assertSharpPipeline(strippedBuffer, mimeType);
    } catch (strippedError) {
      if (!shouldAttemptSipsRecovery(strippedError, mimeType, strippedBuffer)) {
        throw strippedError;
      }

      return transcodeJpegWithSips(strippedBuffer);
    }
  }
}

function shouldPreemptivelyTranscodeJpeg(mimeType, buffer) {
  const lowerMimeType = (mimeType || "").toLowerCase();

  return process.platform === "darwin" && (lowerMimeType === "image/jpeg" || lowerMimeType === "image/jpg" || looksLikeJpeg(buffer));
}

async function renderOptimizedJpeg(buffer, mimeType, maxSize, quality) {
  try {
    return await sharp(buffer)
      .rotate()
      .resize(maxSize, maxSize, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({
        quality,
        mozjpeg: true,
      })
      .toBuffer();
  } catch (error) {
    if (!shouldAttemptSipsRecovery(error, mimeType, buffer)) {
      throw error;
    }

    const transcodedBuffer = await transcodeImageWithSips(buffer, inferExtension(mimeType), "jpeg");
    return sharp(transcodedBuffer)
      .rotate()
      .resize(maxSize, maxSize, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({
        quality,
        mozjpeg: true,
      })
      .toBuffer();
  }
}

async function assertSharpPipeline(buffer, mimeType) {
  try {
    await sharp(buffer)
      .resize(1, 1, {
        fit: "fill",
      })
      .toBuffer();
    return buffer;
  } catch (error) {
    if (!shouldAttemptSipsRecovery(error, mimeType, buffer)) {
      throw error;
    }

    return transcodeImageWithSips(buffer, inferExtension(mimeType), "jpeg");
  }
}

function shouldStripJpegMetadata(error, mimeType, buffer) {
  const message = error?.message || "";
  const lowerMimeType = (mimeType || "").toLowerCase();

  return (
    (lowerMimeType === "image/jpeg" || lowerMimeType === "image/jpg" || looksLikeJpeg(buffer)) &&
    message.includes("date/time field value out of range")
  );
}

function shouldAttemptSipsRecovery(error, mimeType, buffer) {
  const message = error?.message || "";
  const lowerMimeType = (mimeType || "").toLowerCase();

  return (
    process.platform === "darwin" &&
    (lowerMimeType === "image/jpeg" || lowerMimeType === "image/jpg" || looksLikeJpeg(buffer)) &&
    message.includes("date/time field value out of range")
  );
}

function looksLikeJpeg(buffer) {
  return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

function stripJpegAppMetadata(buffer) {
  if (!looksLikeJpeg(buffer)) {
    return buffer;
  }

  const chunks = [buffer.subarray(0, 2)];
  let offset = 2;

  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) {
      chunks.push(buffer.subarray(offset));
      break;
    }

    const marker = buffer[offset + 1];

    if (marker === 0xda || marker === 0xd9) {
      chunks.push(buffer.subarray(offset));
      break;
    }

    const segmentLength = buffer.readUInt16BE(offset + 2);

    if (segmentLength < 2 || offset + 2 + segmentLength > buffer.length) {
      chunks.push(buffer.subarray(offset));
      break;
    }

    const segmentEnd = offset + 2 + segmentLength;

    if (marker < 0xe1 || marker > 0xef) {
      chunks.push(buffer.subarray(offset, segmentEnd));
    }

    offset = segmentEnd;
  }

  return Buffer.concat(chunks);
}

async function transcodeJpegWithSips(buffer) {
  return transcodeImageWithSips(buffer, "jpg", "jpeg");
}

async function transcodeAndResizeImageWithSips(buffer, inputExtension = "jpg", outputFormat = "jpeg", maxSize = PREVIEW_MAX_SIZE) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "picdrop-jpeg-"));
  const safeInputExtension = inputExtension || "img";
  const outputExtension = outputFormat === "png" ? "png" : "jpg";
  const inputPath = path.join(tempDir, `input.${safeInputExtension}`);
  const outputPath = path.join(tempDir, `output.${outputExtension}`);

  try {
    await fs.writeFile(inputPath, buffer);
    await execFileAsync("/usr/bin/sips", ["-s", "format", outputFormat, "-Z", String(maxSize), inputPath, "--out", outputPath]);
    return await fs.readFile(outputPath);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function transcodeImageWithSips(buffer, inputExtension = "jpg", outputFormat = "jpeg") {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "picdrop-jpeg-"));
  const safeInputExtension = inputExtension || "img";
  const outputExtension = outputFormat === "png" ? "png" : "jpg";
  const inputPath = path.join(tempDir, `input.${safeInputExtension}`);
  const outputPath = path.join(tempDir, `output.${outputExtension}`);

  try {
    await fs.writeFile(inputPath, buffer);
    await execFileAsync("/usr/bin/sips", ["-s", "format", outputFormat, inputPath, "--out", outputPath]);
    return await fs.readFile(outputPath);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function normalizeMimeType(mimeType) {
  const lowerMimeType = (mimeType || "").toLowerCase();

  if (lowerMimeType === "image/jpg") {
    return "image/jpeg";
  }

  return lowerMimeType || "image/jpeg";
}

function inferExtension(mimeType) {
  switch (normalizeMimeType(mimeType)) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "jpg";
  }
}

async function persistReferenceImage(buffer, mimeType) {
  const optimized = await createStorageOptimizedImage(buffer, mimeType, {
    maxSize: REFERENCE_MAX_SIZE,
    quality: REFERENCE_JPEG_QUALITY,
  });
  return saveUpload(`person_${crypto.randomUUID()}.${optimized.extension}`, optimized.buffer);
}
