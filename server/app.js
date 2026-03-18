import cors from "cors";
import express from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureFaceEncodingApiAvailable, FaceEncodingApiError } from "./services/faceEncodingApi.js";
import {
  createDriveSyncImage,
  extractPhotoFaceEncodings,
  extractPrimaryFaceEncoding,
  findPhotoMatches,
  sanitizeDriveImage,
} from "./services/faceMatcher.js";
import {
  buildDriveCallbackRedirect,
  createDriveAuthUrl,
  downloadDriveFile,
  downloadDriveThumbnail,
  exchangeDriveCode,
  isUnsupportedDriveImage,
  listDriveFolderImages,
} from "./services/googleDrive.js";
import { isAllowedAdminEmail, verifySupabaseAccessToken } from "./supabase.js";
import {
  addPerson,
  addPersonFaceEncoding,
  addPhoto,
  buildDriveThumbnailUrl,
  updateGalleryHeaderImage,
  findGalleryById,
  findGalleryBySlug,
  findPhotoById,
  findPersonById,
  updatePersonProfile,
  deleteGallery as deleteGalleryRecord,
  getGalleryDriveConnection,
  listDriveSyncStatesByGallery,
  listPersonFaceEncodings,
  listPhotoFacesByGallery,
  parseDriveId,
  readStore,
  replacePhotoFacesForPhoto,
  saveGalleryDriveConnection,
  saveGalleryImage,
  upsertDrivePhoto,
  upsertGallery,
} from "./store.js";

const DEFAULT_DRIVE_SYNC_CONCURRENCY = 3;
let autoSyncInProgress = false;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "../dist");
const distIndexPath = path.join(distDir, "index.html");

export function createApp() {
  const app = express();
  const upload = multer({ storage: multer.memoryStorage() });

  app.use(cors());
  app.use(express.json({ limit: "10mb" }));
  app.use("/api/admin", requireAdminAuth);

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.get("/api/google-drive/callback", async (request, response) => {
    try {
      const { code, state } = request.query;

      if (!code || !state) {
        return response.redirect(buildDriveCallbackRedirect({ status: "error", message: "Missing code or state" }));
      }

      const result = await exchangeDriveCode(String(code), String(state));
      await saveGalleryDriveConnection({
        galleryId: result.galleryId,
        refreshToken: result.refreshToken,
        email: result.driveUser.email,
        name: result.driveUser.name,
      });

      response.redirect(
        buildDriveCallbackRedirect({
          status: "connected",
          galleryId: result.galleryId,
          message: result.driveUser.email || "Drive connected",
        }),
      );
    } catch (error) {
      response.redirect(buildDriveCallbackRedirect({ status: "error", message: error.message || "Drive connect failed" }));
    }
  });

  app.get("/api/admin/snapshot", async (_request, response, next) => {
    try {
      const store = await readStore();
      response.json(store);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/galleries", async (request, response, next) => {
    try {
      const { title, slug, driveLink, isPublic } = request.body;

      if (!title || !slug || !driveLink) {
        return response.status(400).json({ error: "title, slug, and driveLink are required" });
      }

      const gallery = await upsertGallery({
        title,
        slug,
        driveLink,
        driveFolderId: parseDriveId(driveLink),
        isPublic: Boolean(isPublic),
      });

      response.status(201).json({ gallery });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/galleries/:galleryId/header-image", upload.single("image"), async (request, response, next) => {
    try {
      if (!request.file) {
        return response.status(400).json({ error: "image is required" });
      }

      const gallery = await updateGalleryHeaderImage({
        galleryId: request.params.galleryId,
        buffer: request.file.buffer,
        mimeType: request.file.mimetype,
      });

      if (!gallery) {
        return response.status(404).json({ error: "Gallery not found" });
      }

      response.json({ gallery });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/admin/galleries/:galleryId", async (request, response, next) => {
    try {
      const deletedGallery = await deleteGalleryRecord(request.params.galleryId);

      if (!deletedGallery) {
        return response.status(404).json({ error: "Gallery not found" });
      }

      response.json({
        ok: true,
        gallery: deletedGallery,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/guests", upload.single("image"), async (request, response, next) => {
    try {
      const { name, galleryId } = request.body;
      const file = request.file;

      if (!name || !galleryId || !file) {
        return response.status(400).json({ error: "name, galleryId, and image are required" });
      }

      const store = await readStore();
      const gallery = findGalleryById(store, galleryId);

      if (!gallery) {
        return response.status(404).json({ error: "Gallery not found" });
      }

      const person = await addPerson({ galleryId, name });
      await saveSelfieEncodingForPerson({
        person,
        galleryId,
        buffer: file.buffer,
        mimeType: file.mimetype,
        source: "admin_reference",
      });

      const updatedPerson = await findPersonById(person.id);
      response.status(201).json({ guest: updatedPerson, person: updatedPerson });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/persons", async (request, response, next) => {
    try {
      const { name, galleryId } = request.body;

      if (!name || !galleryId) {
        return response.status(400).json({ error: "name and galleryId are required" });
      }

      const store = await readStore();
      const gallery = findGalleryById(store, galleryId);

      if (!gallery) {
        return response.status(404).json({ error: "Gallery not found" });
      }

      const person = await addPerson({ galleryId, name });
      response.status(201).json({ person });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/persons/:personId/selfies", upload.single("selfie"), async (request, response, next) => {
    try {
      if (!request.file) {
        return response.status(400).json({ error: "selfie is required" });
      }

      const person = await findPersonById(request.params.personId);

      if (!person) {
        return response.status(404).json({ error: "Person not found" });
      }

      const encoding = await saveSelfieEncodingForPerson({
        person,
        galleryId: person.galleryId,
        buffer: request.file.buffer,
        mimeType: request.file.mimetype,
        source: "admin_selfie",
      });
      const personEncodings = await listPersonFaceEncodings(person.id);
      const updatedPerson = await findPersonById(person.id);

      response.status(201).json({
        person: updatedPerson,
        encoding,
        encodingCount: personEncodings.length,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/photos", async (request, response, next) => {
    try {
      const { galleryId, title, driveLink, capturedAt, guestIds = [] } = request.body;

      if (!galleryId || !title || !driveLink) {
        return response.status(400).json({ error: "galleryId, title, and driveLink are required" });
      }

      const store = await readStore();
      const gallery = findGalleryById(store, galleryId);

      if (!gallery) {
        return response.status(404).json({ error: "Gallery not found" });
      }

      const driveFileId = parseDriveId(driveLink);

      if (!driveFileId) {
        return response.status(400).json({ error: "Unable to parse a Google Drive file ID from driveLink" });
      }

      let photo = await addPhoto({
        galleryId,
        title,
        driveLink,
        driveFileId,
        thumbnailUrl: buildDriveThumbnailUrl(driveFileId),
        capturedAt,
        guestIds: Array.isArray(guestIds) ? guestIds : [],
      });

      const indexing = await indexManualPhotoIfPossible({
        gallery,
        photo,
      });

      if (indexing.photo) {
        photo = indexing.photo;
      }

      response.status(201).json({ photo, indexing });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/photos/:photoId/index", async (request, response, next) => {
    try {
      const store = await readStore();
      const photo = findPhotoById(store, request.params.photoId);

      if (!photo) {
        return response.status(404).json({ error: "Photo not found" });
      }

      const gallery = findGalleryById(store, photo.galleryId);

      if (!gallery) {
        return response.status(404).json({ error: "Gallery not found" });
      }

      const indexing = await indexManualPhotoIfPossible({
        gallery,
        photo,
      });

      response.json({
        ok: true,
        photo: indexing.photo || photo,
        indexing,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/galleries/:galleryId/drive-auth-url", async (request, response, next) => {
    try {
      const store = await readStore();
      const gallery = findGalleryById(store, request.params.galleryId);

      if (!gallery) {
        return response.status(404).json({ error: "Gallery not found" });
      }

      const url = createDriveAuthUrl({
        galleryId: gallery.id,
        adminEmail: request.adminUser.email,
      });

      response.json({ url });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/galleries/:galleryId/sync-drive", async (request, response, next) => {
    try {
      const result = await syncGalleryDriveById(request.params.galleryId);
      response.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/public/galleries/:slug", async (request, response, next) => {
    try {
      const store = await readStore();
      const gallery = findGalleryBySlug(store, request.params.slug);

      if (!gallery || !gallery.isPublic) {
        return response.status(404).json({ error: "Gallery not found or public access is disabled" });
      }

      response.json({ gallery });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/public/galleries/:slug/photos", async (request, response, next) => {
    try {
      const store = await readStore();
      const gallery = findGalleryBySlug(store, request.params.slug);

      if (!gallery || !gallery.isPublic) {
        return response.status(404).json({ error: "Gallery not found or public access is disabled" });
      }

      const photos = store.photos.filter((photo) => photo.galleryId === gallery.id);
      response.json({ gallery, photos });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/public/galleries/:slug/person-profile", upload.single("selfie"), async (request, response, next) => {
    try {
      const store = await readStore();
      const gallery = findGalleryBySlug(store, request.params.slug);

      if (!gallery || !gallery.isPublic) {
        return response.status(404).json({ error: "Gallery not found or public access is disabled" });
      }

      const personId = normalizeTextField(request.body?.personId);
      const name = normalizeTextField(request.body?.name);
      const email = normalizeTextField(request.body?.email);
      const phone = normalizeTextField(request.body?.phone);
      const company = normalizeTextField(request.body?.company);

      if (!name) {
        return response.status(400).json({ error: "name is required" });
      }

      let person;

      if (personId) {
        person = await findPersonById(personId);

        if (!person || person.galleryId !== gallery.id) {
          return response.status(404).json({ error: "Person not found for this gallery." });
        }

        person = await updatePersonProfile({
          personId: person.id,
          name,
          email,
          phone,
          company,
        });
      } else {
        person = await addPerson({
          galleryId: gallery.id,
          name,
          email,
          phone,
          company,
        });
      }

      if (request.file) {
        await saveSelfieEncodingForPerson({
          person,
          galleryId: gallery.id,
          buffer: request.file.buffer,
          mimeType: request.file.mimetype,
          source: "public_profile",
        });
      }

      const updatedPerson = await findPersonById(person.id);
      response.status(personId ? 200 : 201).json({ person: updatedPerson });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/public/galleries/:slug/match", upload.single("selfie"), async (request, response, next) => {
    try {
      const store = await readStore();
      const gallery = findGalleryBySlug(store, request.params.slug);

      if (!gallery || !gallery.isPublic) {
        return response.status(404).json({ error: "Gallery not found or public access is disabled" });
      }

      if (!request.file) {
        return response.status(400).json({ error: "selfie is required" });
      }

      const requestedPersonId = normalizeTextField(request.body?.personId);
      const requestedPersonName = normalizeTextField(request.body?.personName);
      const person = await resolveMatchPerson({
        requestedPersonId,
        requestedPersonName,
        galleryId: gallery.id,
      });
      const referenceEncodings = await getReferenceEncodingsForMatch({
        person,
        galleryId: gallery.id,
        buffer: request.file.buffer,
        mimeType: request.file.mimetype,
      });
      const photos = store.photos.filter((photo) => photo.galleryId === gallery.id);
      const photoFaces = await listPhotoFacesByGallery(gallery.id);
      const result = findPhotoMatches(referenceEncodings, photos, photoFaces);
      const diagnostics = {
        ...result.diagnostics,
        galleryId: gallery.id,
        gallerySlug: gallery.slug,
        personId: person?.id || null,
      };

      if (!result.matches.length) {
        return response.json({
          person,
          match: null,
          diagnostics,
        });
      }

      response.json({
        person,
        match: {
          photoCount: result.matches.length,
          bestScore: result.matches[0].score,
          confidence: result.matches[0].confidence,
          photos: result.matches.map((matchedPhoto) => ({
            ...matchedPhoto.photo,
            matchScore: matchedPhoto.score,
            matchedRegionId: matchedPhoto.regionId,
            matchConfidence: matchedPhoto.confidence,
          })),
        },
        diagnostics,
      });
    } catch (error) {
      next(error);
    }
  });

  if (fs.existsSync(distIndexPath)) {
    app.use(express.static(distDir));

    app.get(/^\/(?!api).*/, (_request, response) => {
      response.sendFile(distIndexPath);
    });
  }

  app.use((error, _request, response, _next) => {
    const status =
      error instanceof FaceEncodingApiError
        ? error.status
        : error.message === "No face detected in the uploaded image."
          ? 400
          : 500;

    response.status(status).json({ error: error.message || "Internal server error" });
  });

  return app;
}

async function requireAdminAuth(request, response, next) {
  try {
    const authorization = request.headers.authorization || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";

    if (!token) {
      return response.status(401).json({ error: "Authentication required" });
    }

    const user = await verifySupabaseAccessToken(token);

    if (!user) {
      return response.status(401).json({ error: "Invalid session" });
    }

    const providers = [user.app_metadata?.provider, ...(user.app_metadata?.providers || [])].filter(Boolean);

    if (!providers.includes("google")) {
      return response.status(403).json({ error: "Google sign-in is required" });
    }

    if (!isAllowedAdminEmail(user.email)) {
      return response.status(403).json({ error: "This Google account is not allowed to access the admin panel" });
    }

    request.adminUser = {
      id: user.id,
      email: user.email,
    };
    next();
  } catch {
    response.status(401).json({ error: "Unable to verify your session" });
  }
}

export async function syncGalleryDriveById(galleryId) {
  const store = await readStore();
  const gallery = findGalleryById(store, galleryId);

  if (!gallery) {
    throw new Error("Gallery not found");
  }

  return syncGalleryDrive(gallery);
}

export async function syncAllConnectedGalleries() {
  if (autoSyncInProgress) {
    return {
      ok: true,
      skipped: true,
      reason: "Automatic Drive sync is already running.",
      galleryCount: 0,
      results: [],
    };
  }

  autoSyncInProgress = true;

  try {
    const store = await readStore();
    const galleries = store.galleries.filter((gallery) => gallery.driveFolderId && gallery.hasDriveConnection);
    const results = [];

    for (const gallery of galleries) {
      try {
        results.push(await syncGalleryDrive(gallery));
      } catch (error) {
        results.push({
          ok: false,
          galleryId: gallery.id,
          gallerySlug: gallery.slug,
          error: error.message || "Automatic sync failed",
        });
      }
    }

    return {
      ok: true,
      galleryCount: galleries.length,
      results,
    };
  } finally {
    autoSyncInProgress = false;
  }
}

async function syncGalleryDrive(gallery) {
  if (!gallery.driveFolderId) {
    throw new Error("Gallery is missing a Google Drive folder ID");
  }

  const driveConnection = await getGalleryDriveConnection(gallery.id);

  if (!driveConnection?.refreshToken) {
    throw new Error("Connect a Google Drive account before syncing this gallery");
  }

  await ensureFaceEncodingApiAvailable();

  const [driveFiles, existingPhotos] = await Promise.all([
    listDriveFolderImages(gallery.driveFolderId, driveConnection.refreshToken),
    listDriveSyncStatesByGallery(gallery.id),
  ]);
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
  if (isUnsupportedDriveImage(file.name, file.mimeType)) {
    return {
      type: "skipped",
      name: file.name,
      reason: "HEIC/HEIF is not supported by the current image-processing build",
    };
  }

  if (isUnchangedDriveFile(existingPhoto, file)) {
    return {
      type: "unchanged",
      name: file.name,
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

async function indexManualPhotoIfPossible({ gallery, photo }) {
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

async function resolveMatchPerson({ requestedPersonId, requestedPersonName, galleryId }) {
  if (requestedPersonId) {
    const person = await findPersonById(requestedPersonId);

    if (!person || person.galleryId !== galleryId) {
      throw new Error("Person not found for this gallery.");
    }

    return person;
  }

  if (requestedPersonName) {
    return addPerson({
      galleryId,
      name: requestedPersonName,
    });
  }

  return null;
}

async function getReferenceEncodingsForMatch({ person, galleryId, buffer, mimeType }) {
  if (!person) {
    const encoding = await extractPrimaryFaceEncoding(buffer, mimeType, { persistUpload: false });
    return [encoding];
  }

  await saveSelfieEncodingForPerson({
    person,
    galleryId,
    buffer,
    mimeType,
    source: "public_selfie",
  });

  return listPersonFaceEncodings(person.id);
}

async function saveSelfieEncodingForPerson({ person, galleryId, buffer, mimeType, source }) {
  const primaryFace = await extractPrimaryFaceEncoding(buffer, mimeType, { persistUpload: true });

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

function normalizeTextField(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
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
