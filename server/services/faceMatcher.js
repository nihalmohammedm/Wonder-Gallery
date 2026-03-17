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
const DEFAULT_FACE_DISTANCE_THRESHOLD = 0.6;
const PREVIEW_MAX_SIZE = 1600;
const PREVIEW_JPEG_QUALITY = 82;

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

export async function createGalleryPreview(buffer, mimeType) {
  const normalizedMimeType = normalizeMimeType(mimeType);
  const safeBuffer = await normalizeImageBuffer(buffer, normalizedMimeType);
  const previewBuffer = await renderGalleryPreview(safeBuffer, normalizedMimeType);

  return {
    buffer: previewBuffer,
    mimeType: "image/jpeg",
    extension: "jpg",
  };
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

export function findPhotoMatches(referenceEncodings, photos, photoFaces) {
  const validReferenceEncodings = (referenceEncodings || []).filter(
    (reference) => Array.isArray(reference?.encoding) && reference.encoding.length,
  );
  const facesByPhotoId = groupFacesByPhotoId(photoFaces);
  const scored = photos
    .map((photo) => ({
      photo,
      ...scorePhoto(validReferenceEncodings, facesByPhotoId.get(photo.id) || []),
    }))
    .filter((photo) => Number.isFinite(photo.bestScore))
    .sort((left, right) => left.bestScore - right.bestScore);

  const threshold = getFaceDistanceThreshold();
  const matches = scored
    .filter((photo) => photo.bestScore <= threshold)
    .map((photo) => ({
      photo: photo.photo,
      score: round(photo.bestScore),
      regionId: photo.face?.id || null,
      confidence: photo.bestScore <= 0.45 ? "high" : "medium",
    }));

  return {
    matches,
    diagnostics: {
      model: "face_recognition_api-euclidean-v1",
      threshold,
      referenceEncodingCount: validReferenceEncodings.length,
      photoCount: photos.length,
      indexedPhotoCount: scored.length,
      scannedRegionCount: scored.reduce((total, photo) => total + photo.regionCount, 0),
      bestScore: scored[0] ? round(scored[0].bestScore) : null,
    },
  };
}

function scorePhoto(referenceEncodings, faces) {
  if (!referenceEncodings.length || !faces.length) {
    return {
      bestScore: Number.POSITIVE_INFINITY,
      face: null,
      regionCount: faces.length,
    };
  }

  let bestScore = Number.POSITIVE_INFINITY;
  let bestFace = null;

  for (const reference of referenceEncodings) {
    for (const face of faces) {
      const score = computeDistance(reference.encoding, face.encoding);

      if (score < bestScore) {
        bestScore = score;
        bestFace = face;
      }
    }
  }

  return {
    bestScore,
    face: bestFace,
    regionCount: faces.length,
  };
}

function computeDistance(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length || !left.length) {
    return Number.POSITIVE_INFINITY;
  }

  let total = 0;

  for (let index = 0; index < left.length; index += 1) {
    const difference = left[index] - right[index];
    total += difference * difference;
  }

  return Math.sqrt(total);
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

function groupFacesByPhotoId(photoFaces) {
  const grouped = new Map();

  for (const photoFace of photoFaces) {
    const list = grouped.get(photoFace.photoId) || [];
    list.push(photoFace);
    grouped.set(photoFace.photoId, list);
  }

  return grouped;
}

function round(value) {
  return Math.round(value * 10000) / 10000;
}

function getFaceDistanceThreshold() {
  const parsed = Number(process.env.FACE_DISTANCE_THRESHOLD || DEFAULT_FACE_DISTANCE_THRESHOLD);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_FACE_DISTANCE_THRESHOLD;
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

async function renderGalleryPreview(buffer, mimeType) {
  try {
    return await sharp(buffer)
      .resize(PREVIEW_MAX_SIZE, PREVIEW_MAX_SIZE, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({
        quality: PREVIEW_JPEG_QUALITY,
        mozjpeg: true,
      })
      .toBuffer();
  } catch (error) {
    if (!shouldAttemptSipsRecovery(error, mimeType, buffer)) {
      throw error;
    }

    const transcodedBuffer = await transcodeImageWithSips(buffer, inferExtension(mimeType), "jpeg");
    return sharp(transcodedBuffer)
      .resize(PREVIEW_MAX_SIZE, PREVIEW_MAX_SIZE, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({
        quality: PREVIEW_JPEG_QUALITY,
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
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wonder-gallery-jpeg-"));
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
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wonder-gallery-jpeg-"));
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
  const extension = normalizeMimeType(mimeType) === "image/png" ? "png" : "jpg";
  return saveUpload(`person_${crypto.randomUUID()}.${extension}`, buffer);
}
