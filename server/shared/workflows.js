import { ensureFaceEncodingApiAvailable } from "../services/faceEncodingApi.js";
import {
  createDriveSyncImage,
  extractPhotoFaceEncodings,
  extractPrimaryFaceEncoding,
  sanitizeDriveImage,
} from "../services/faceMatcher.js";
import {
  downloadDriveFile,
  downloadDriveThumbnail,
  isAllowedDriveImage,
  listDriveFolderImages,
  requiresDriveThumbnailFallback,
} from "../services/googleDrive.js";
import {
  addPerson,
  addPersonFaceEncoding,
  buildDriveThumbnailUrl,
  findPersonById,
  getGalleryById,
  getGalleryDriveConnection,
  listDriveSyncStatesByGallery,
  matchGalleryPersons,
  replacePersonFaceEncodings,
  replacePhotoFacesForPhoto,
  saveGalleryImage,
  upsertDrivePhoto,
} from "../store.js";

const DEFAULT_DRIVE_SYNC_CONCURRENCY = 3;
const FACE_MATCH_RPC_THRESHOLD = 0.51;
const PERSON_MATCH_RPC_COUNT = 250;

export async function syncGalleryDriveById(galleryId) {
  const gallery = await getGalleryById(galleryId);

  if (!gallery) {
    throw new Error("Gallery not found");
  }

  return syncGalleryDrive(gallery);
}

export async function indexManualPhotoIfPossible({ gallery, photo }) {
  const driveConnection = await getGalleryDriveConnection(gallery.id);

  if (!driveConnection?.refreshToken) {
    return {
      attempted: false,
      indexed: false,
      reason: "Drive is not connected for this gallery.",
      photo,
    };
  }

  await ensureFaceEncodingApiAvailable();

  try {
    const preview = await buildSyncPreview({
      file: {
        id: photo.driveFileId,
        name: photo.title,
        mimeType: photo.sourceMimeType || "image/jpeg",
        thumbnailLink: photo.thumbnailUrl || null,
      },
      refreshToken: driveConnection.refreshToken,
    });
    const storedImage = await saveGalleryImage(`${gallery.id}/${photo.driveFileId}.${preview.extension}`, preview.buffer, preview.mimeType);
    const faceIndex = await withSyncStage("encoding", photo.title, () => extractPhotoFaceEncodings(preview.buffer, preview.mimeType));
    const updatedPhoto = await upsertDrivePhoto({
      galleryId: gallery.id,
      title: photo.title,
      driveLink: photo.driveLink,
      driveFileId: photo.driveFileId,
      thumbnailUrl: photo.thumbnailUrl,
      capturedAt: photo.capturedAt,
      storageBucket: storedImage.bucket,
      storageObjectPath: storedImage.objectPath,
      sourceMimeType: preview.mimeType,
      imageWidth: faceIndex.imageWidth,
      imageHeight: faceIndex.imageHeight,
    });

    await replacePhotoFacesForPhoto({
      galleryId: gallery.id,
      photoId: updatedPhoto.id,
      faces: faceIndex.faces || [],
    });

    return {
      attempted: true,
      indexed: true,
      faceCount: faceIndex.faces?.length || 0,
      syncSource: preview.syncSource,
      photo: updatedPhoto,
    };
  } catch (error) {
    return {
      attempted: true,
      indexed: false,
      reason: normalizeDriveSyncError(error),
      photo,
    };
  }
}

export async function getReferenceEncodingsForMatch({ person, galleryId, buffer, mimeType, extractedSelfieEncoding }) {
  const referenceEncoding = extractedSelfieEncoding || await extractPrimaryFaceEncoding(buffer, mimeType, { persistUpload: false });

  if (!person) {
    return [referenceEncoding];
  }

  await saveSelfieEncodingForPerson({
    person,
    galleryId,
    buffer,
    mimeType,
    source: "public_selfie",
    extractedFace: referenceEncoding,
  });

  return [referenceEncoding];
}

export async function detectExistingPersonForBuffer({ galleryId, buffer, mimeType }) {
  const extractedFace = await extractPrimaryFaceEncoding(buffer, mimeType, { persistUpload: false });
  return detectExistingPersonForEncoding({
    galleryId,
    encoding: extractedFace.encoding,
  });
}

export async function detectExistingPersonForEncoding({ galleryId, encoding }) {
  const matches = await matchGalleryPersons(galleryId, encoding, {
    distanceThreshold: FACE_MATCH_RPC_THRESHOLD,
    matchCount: PERSON_MATCH_RPC_COUNT,
  });
  const personMatch = matches[0] || null;

  if (!personMatch?.personId) {
    return null;
  }

  return findPersonById(personMatch.personId);
}

export async function saveSelfieEncodingForPerson({ person, galleryId, buffer, mimeType, source, extractedFace = null }) {
  const primaryFace = extractedFace?.imagePath
    ? extractedFace
    : await extractPrimaryFaceEncoding(buffer, mimeType, { persistUpload: true });

  await replacePersonFaceEncodings(person.id);

  return addPersonFaceEncoding({
    personId: person.id,
    galleryId,
    source,
    sourceImagePath: primaryFace.imagePath,
    sourceMimeType: primaryFace.mimeType,
    box: primaryFace.box,
    encoding: primaryFace.encoding,
  });
}

export function normalizeTextField(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

export function normalizeDriveLinks(input) {
  if (Array.isArray(input)) {
    return input.map((value) => normalizeTextField(value)).filter(Boolean);
  }

  if (typeof input === "string") {
    return input
      .split(/\r?\n|,/)
      .map((value) => normalizeTextField(value))
      .filter(Boolean);
  }

  return [];
}

export function buildDraftPersonName() {
  return `Guest ${new Date().toISOString().slice(0, 19).replace("T", " ")}`;
}

export function normalizeAccentColorField(value) {
  if (typeof value !== "string") {
    return "";
  }

  const normalized = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : "";
}

export function toPublicGallery(gallery) {
  return {
    id: gallery.id,
    title: gallery.title,
    slug: gallery.slug,
    driveLink: gallery.driveLink,
    driveFolderId: gallery.driveFolderId,
    headerImagePath: gallery.headerImagePath,
    headerImageUrl: gallery.headerImageUrl,
    personalAccentColor: gallery.personalAccentColor,
    commonAccentColor: gallery.commonAccentColor,
    hasDriveConnection: gallery.hasDriveConnection,
    isPublic: gallery.isPublic,
    createdAt: gallery.createdAt,
    updatedAt: gallery.updatedAt,
  };
}

async function syncGalleryDrive(gallery) {
  const folderIds = gallery.driveFolderIds?.length ? gallery.driveFolderIds : [gallery.driveFolderId].filter(Boolean);

  if (!folderIds.length) {
    throw new Error("Gallery is missing a Google Drive folder ID");
  }

  const driveConnection = await getGalleryDriveConnection(gallery.id);

  if (!driveConnection?.refreshToken) {
    throw new Error("Connect a Google Drive account before syncing this gallery");
  }

  await ensureFaceEncodingApiAvailable();

  const [driveFilesByFolder, existingPhotos] = await Promise.all([
    Promise.all(folderIds.map((folderId) => listDriveFolderImages(folderId, driveConnection.refreshToken))),
    listDriveSyncStatesByGallery(gallery.id),
  ]);
  const driveFiles = driveFilesByFolder.flat();
  const existingByDriveFileId = new Map(existingPhotos.map((photo) => [photo.driveFileId, photo]));
  const outcomes = await mapWithConcurrency(
    driveFiles,
    getDriveSyncConcurrency(),
    async (file) => syncDriveFile({ gallery, driveConnection, file, existingPhoto: existingByDriveFileId.get(file.id) }),
  );
  const syncedFiles = outcomes.filter((outcome) => outcome.type === "synced");
  const unchangedFiles = outcomes.filter((outcome) => outcome.type === "unchanged");
  const skippedFiles = outcomes.filter((outcome) => outcome.type === "skipped").map(({ name, reason }) => ({ name, reason }));
  const fallbackCount = syncedFiles.filter((outcome) => outcome.syncSource === "thumbnail_fallback").length;

  return {
    ok: true,
    galleryId: gallery.id,
    gallerySlug: gallery.slug,
    syncedCount: syncedFiles.length,
    unchangedCount: unchangedFiles.length,
    skippedCount: skippedFiles.length,
    thumbnailFallbackCount: fallbackCount,
    unchangedFiles: unchangedFiles.map(({ name }) => ({ name, reason: "Unchanged since last sync" })),
    skippedFiles,
  };
}

async function syncDriveFile({ gallery, driveConnection, file, existingPhoto }) {
  if (isUnchangedDriveFile(existingPhoto, file)) {
    return {
      type: "unchanged",
      name: file.name,
    };
  }

  if (!isAllowedDriveImage(file.name, file.mimeType)) {
    return {
      type: "skipped",
      name: file.name,
      reason: "Unsupported file format. Only JPG, JPEG, PNG, HEIC, and HEIF are allowed.",
    };
  }

  try {
    const preview = await buildSyncPreview({
      file,
      refreshToken: driveConnection.refreshToken,
    });
    const storedImage = await saveGalleryImage(`${gallery.id}/${file.id}.${preview.extension}`, preview.buffer, preview.mimeType);
    const faceIndex = await withSyncStage("encoding", file.name, () => extractPhotoFaceEncodings(preview.buffer, preview.mimeType));
    const photo = await upsertDrivePhoto({
      galleryId: gallery.id,
      title: file.name,
      driveLink: file.driveLink,
      driveFileId: file.id,
      thumbnailUrl: buildDriveThumbnailUrl(file.id),
      capturedAt: file.capturedAt,
      storageBucket: storedImage.bucket,
      storageObjectPath: storedImage.objectPath,
      sourceMimeType: preview.mimeType,
      driveModifiedTime: file.modifiedAt,
      driveChecksum: file.checksum,
      driveFileSizeBytes: file.sizeBytes,
      imageWidth: faceIndex.imageWidth,
      imageHeight: faceIndex.imageHeight,
    });

    await replacePhotoFacesForPhoto({
      galleryId: gallery.id,
      photoId: photo.id,
      faces: faceIndex.faces || [],
    });

    return {
      type: "synced",
      name: file.name,
      syncSource: preview.syncSource,
    };
  } catch (error) {
    return {
      type: "skipped",
      name: file.name,
      reason: normalizeDriveSyncError(error),
    };
  }
}

async function buildSyncPreview({ file, refreshToken }) {
  try {
    if (requiresDriveThumbnailFallback(file.name, file.mimeType)) {
      throw new Error("HEIC/HEIF original requires thumbnail fallback");
    }

    const sourceBuffer = await withSyncStage("download", file.name, () => downloadDriveFile(file.id, refreshToken));
    const sanitizedSource = await withSyncStage("sanitize", file.name, () => sanitizeDriveImage(sourceBuffer, file.mimeType));
    const preview = await withSyncStage("preview", file.name, () => createDriveSyncImage(sanitizedSource.buffer, sanitizedSource.mimeType));
    return {
      ...preview,
      syncSource: "original",
    };
  } catch (error) {
    if (!file.thumbnailLink) {
      throw error;
    }

    const thumbnailBuffer = await withSyncStage("thumbnail", file.name, () => downloadDriveThumbnail(file.thumbnailLink, refreshToken));
    const preview = await withSyncStage("thumbnail-preview", file.name, () => createDriveSyncImage(thumbnailBuffer, "image/jpeg"));
    return {
      ...preview,
      syncSource: "thumbnail_fallback",
    };
  }
}

function isUnchangedDriveFile(existingPhoto, driveFile) {
  if (!existingPhoto) {
    return false;
  }

  if (existingPhoto.driveChecksum && driveFile.checksum) {
    return existingPhoto.driveChecksum === driveFile.checksum;
  }

  if (existingPhoto.driveModifiedTime && driveFile.modifiedAt) {
    if (existingPhoto.driveModifiedTime !== driveFile.modifiedAt) {
      return false;
    }

    if (existingPhoto.driveFileSizeBytes && driveFile.sizeBytes) {
      return Number(existingPhoto.driveFileSizeBytes) === Number(driveFile.sizeBytes);
    }

    return true;
  }

  return false;
}

function getDriveSyncConcurrency() {
  const parsed = Number(process.env.DRIVE_SYNC_CONCURRENCY || DEFAULT_DRIVE_SYNC_CONCURRENCY);
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(1, Math.floor(parsed)) : DEFAULT_DRIVE_SYNC_CONCURRENCY;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length || 1) }, () => worker()));
  return results;
}

function normalizeDriveSyncError(error) {
  const message = error?.message || "Unable to process this image";

  if (message.includes("heif: Error while loading plugin")) {
    return "HEIC/HEIF is not supported by the current image-processing build";
  }

  if (message.includes("Face encoding API request failed")) {
    return "Face encoding API request failed";
  }

  if (message.includes("source: bad seek")) {
    return "Image file could not be decoded by the current image-processing build";
  }

  return message;
}

async function withSyncStage(stage, fileName, action) {
  try {
    return await action();
  } catch (error) {
    const reason = error?.message || "Unknown error";
    throw new Error(`[${stage}] ${fileName}: ${reason}`);
  }
}
