import { createError, getQuery, readBody, sendRedirect, setResponseStatus } from "h3";
import {
  createStorageOptimizedImage,
} from "../services/faceMatcher.js";
import {
  buildDriveCallbackRedirect,
  createDriveAuthUrl,
  exchangeDriveCode,
} from "../services/googleDrive.js";
import {
  addPhoto,
  deleteGallery as deleteGalleryRecord,
  findJobById,
  findPersonById,
  getGalleryById,
  getGalleryBySlug,
  parseDriveId,
  getPhotoById,
  listPhotosByGalleryId,
  readStore,
  refreshGalleryAccessPin,
  saveGalleryDriveConnection,
  updateGalleryHeaderImage,
  upsertGallery,
} from "../store.js";
import {
  normalizeAccentColorField,
  normalizeDriveLinks,
  normalizeTextField,
  toPublicGallery,
} from "../shared/workflows.js";
import { requireAdminUser } from "../utils/adminAuth.js";
import { enqueueJobRecord } from "../utils/jobs.js";
import { createFaceMatchJob, createGallerySyncJob, createPhotoIndexJob, savePublicPersonProfileForGallery } from "../utils/jobRunner.js";
import { readMultipartFields, readUploadedFile } from "../utils/uploads.js";
import { applyRuntimeEnvToProcess } from "../utils/runtime.js";

function toAdminJobResponse(job) {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    galleryId: job.galleryId,
    gallerySlug: job.gallerySlug,
    photoId: job.photoId,
    personId: job.personId,
    requestedBy: job.requestedBy,
    progress: job.progress || {},
    result: job.result,
    error: job.error || "",
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
  };
}

function toPublicJobResponse(job) {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    galleryId: job.galleryId,
    gallerySlug: job.gallerySlug,
    photoId: job.photoId,
    personId: job.personId,
    progress: job.progress || {},
    result: job.type === "face_match" ? job.result : null,
    error: job.error || "",
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
  };
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "").trim());
}

export default defineEventHandler(async (event) => {
  applyRuntimeEnvToProcess();

  const path = (event.context.params?.path || "").split("/").filter(Boolean);
  const method = event.method.toUpperCase();

  try {
    if (method === "GET" && matches(path, ["health"])) {
      return { ok: true };
    }

    if (method === "GET" && matches(path, ["google-drive", "callback"])) {
      const query = getQuery(event);
      if (!query.code || !query.state) {
        return sendRedirect(event, buildDriveCallbackRedirect({ status: "error", message: "Missing code or state" }));
      }

      const result = await exchangeDriveCode(String(query.code), String(query.state));
      await saveGalleryDriveConnection({
        galleryId: result.galleryId,
        refreshToken: result.refreshToken,
        email: result.driveUser.email,
        name: result.driveUser.name,
      });

      return sendRedirect(
        event,
        buildDriveCallbackRedirect({
          status: "connected",
          galleryId: result.galleryId,
          message: result.driveUser.email || "Drive connected",
        }),
      );
    }

    if (path[0] === "admin") {
      const adminUser = await requireAdminUser(event);

      if (method === "GET" && matches(path, ["admin", "snapshot"])) {
        return readStore();
      }

      if (method === "GET" && matches(path, ["admin", "jobs", ":jobId"])) {
        if (!isUuid(path[2])) {
          throw createError({ statusCode: 400, statusMessage: "Invalid job ID." });
        }
        const job = await findJobById(path[2]);
        if (!job) {
          throw createError({ statusCode: 404, statusMessage: "Job not found" });
        }
        return { job: toAdminJobResponse(job) };
      }

      if (method === "POST" && matches(path, ["admin", "galleries"])) {
        const body = await readBody(event);
        const { title, slug, driveLink, driveLinks, isPublic } = body;
        const normalizedDriveLinkList = normalizeDriveLinks(driveLinks?.length ? driveLinks : driveLink);
        const personalAccentColor = normalizeAccentColorField(body?.personalAccentColor);
        const commonAccentColor = normalizeAccentColorField(body?.commonAccentColor);

        if (!title || !slug || !normalizedDriveLinkList.length) {
          throw createError({ statusCode: 400, statusMessage: "title, slug, and at least one driveLink are required" });
        }

        const gallery = await upsertGallery({
          title,
          slug,
          driveFolderId: parseDriveId(normalizedDriveLinkList[0]),
          driveLinks: normalizedDriveLinkList,
          driveFolderIds: normalizedDriveLinkList.map((link) => parseDriveId(link)).filter(Boolean),
          personalAccentColor,
          commonAccentColor,
          isPublic: Boolean(isPublic),
        });

        setResponseStatus(event, 201);
        return { gallery };
      }

      if (method === "POST" && matches(path, ["admin", "galleries", ":galleryId", "header-image"])) {
        const upload = await readUploadedFile(event, "image");
        const optimizedHeader = await createStorageOptimizedImage(upload.buffer, upload.mimeType, {
          maxSize: 2400,
          quality: 84,
        });
        const gallery = await updateGalleryHeaderImage({
          galleryId: path[2],
          buffer: optimizedHeader.buffer,
          mimeType: optimizedHeader.mimeType,
        });

        if (!gallery) {
          throw createError({ statusCode: 404, statusMessage: "Gallery not found" });
        }

        return { gallery };
      }

      if (method === "POST" && matches(path, ["admin", "galleries", ":galleryId", "refresh-pin"])) {
        const gallery = await refreshGalleryAccessPin(path[2]);
        return { gallery };
      }

      if (method === "DELETE" && matches(path, ["admin", "galleries", ":galleryId"])) {
        const gallery = await deleteGalleryRecord(path[2]);
        if (!gallery) {
          throw createError({ statusCode: 404, statusMessage: "Gallery not found" });
        }
        return { ok: true, gallery };
      }

      if (method === "GET" && matches(path, ["admin", "galleries", ":galleryId", "drive-auth-url"])) {
        const gallery = await getGalleryById(path[2]);
        if (!gallery) {
          throw createError({ statusCode: 404, statusMessage: "Gallery not found" });
        }

        return {
          url: createDriveAuthUrl({
            galleryId: gallery.id,
            adminEmail: adminUser.email,
          }),
        };
      }

      if (method === "POST" && matches(path, ["admin", "galleries", ":galleryId", "sync-drive"])) {
        const job = await createGallerySyncJob(path[2], adminUser.email);
        await enqueueJobRecord(job);
        setResponseStatus(event, 202);
        return { job: toAdminJobResponse(job) };
      }

      if (method === "POST" && matches(path, ["admin", "photos"])) {
        const body = await readBody(event);
        const { galleryId, title, driveLink, capturedAt, guestIds = [] } = body;

        if (!galleryId || !title || !driveLink) {
          throw createError({ statusCode: 400, statusMessage: "galleryId, title, and driveLink are required" });
        }

        const gallery = await getGalleryById(galleryId);
        if (!gallery) {
          throw createError({ statusCode: 404, statusMessage: "Gallery not found" });
        }

        const driveFileId = parseDriveFileId(driveLink);
        if (!driveFileId) {
          throw createError({ statusCode: 400, statusMessage: "Unable to parse a Google Drive file ID from driveLink" });
        }

        const photo = await addPhoto({
          galleryId,
          title,
          driveLink,
          driveFileId,
          thumbnailUrl: `https://drive.google.com/thumbnail?id=${driveFileId}&sz=w1200`,
          capturedAt,
          guestIds: Array.isArray(guestIds) ? guestIds : [],
        });

        const job = await createPhotoIndexJob(photo.id, gallery.id, adminUser.email);
        await enqueueJobRecord(job);
        setResponseStatus(event, 201);
        return { photo, job: toAdminJobResponse(job) };
      }

      if (method === "POST" && matches(path, ["admin", "photos", ":photoId", "index"])) {
        const photo = await getPhotoById(path[2]);
        if (!photo) {
          throw createError({ statusCode: 404, statusMessage: "Photo not found" });
        }
        const job = await createPhotoIndexJob(photo.id, photo.galleryId, adminUser.email);
        await enqueueJobRecord(job);
        setResponseStatus(event, 202);
        return { job: toAdminJobResponse(job) };
      }
    }

    if (path[0] === "public") {
      if (method === "GET" && matches(path, ["public", "jobs", ":jobId"])) {
        if (!isUuid(path[2])) {
          throw createError({ statusCode: 400, statusMessage: "Invalid job ID." });
        }
        const job = await findJobById(path[2]);
        if (!job) {
          throw createError({ statusCode: 404, statusMessage: "Job not found" });
        }
        return { job: toPublicJobResponse(job) };
      }

      if (method === "GET" && matches(path, ["public", "galleries", ":slug"])) {
        const gallery = await getGalleryBySlug(path[2]);
        if (!gallery || !gallery.isPublic) {
          throw createError({ statusCode: 404, statusMessage: "Gallery not found or public access is disabled" });
        }
        return { gallery: toPublicGallery(gallery) };
      }

      if (method === "GET" && matches(path, ["public", "galleries", ":slug", "photos"])) {
        const gallery = await getGalleryBySlug(path[2]);
        if (!gallery || !gallery.isPublic) {
          throw createError({ statusCode: 404, statusMessage: "Gallery not found or public access is disabled" });
        }

        const pin = normalizeTextField(String(getQuery(event).pin || ""));
        if (!pin || pin !== gallery.commonAccessPin) {
          throw createError({ statusCode: 403, statusMessage: "A valid 4-digit PIN is required to open this gallery." });
        }

        const photos = await listPhotosByGalleryId(gallery.id);
        return { gallery: toPublicGallery(gallery), photos };
      }

      if (method === "GET" && matches(path, ["public", "galleries", ":slug", "people", ":personId"])) {
        const gallery = await getGalleryBySlug(path[2]);
        if (!gallery || !gallery.isPublic) {
          throw createError({ statusCode: 404, statusMessage: "Gallery not found or public access is disabled" });
        }

        const person = await findPersonById(path[4]);
        if (!person || person.galleryId !== gallery.id) {
          throw createError({ statusCode: 404, statusMessage: "Person not found" });
        }

        return { person };
      }

      if (method === "POST" && matches(path, ["public", "galleries", ":slug", "person-profile"])) {
        const multipart = await readMultipartFields(event);
        const file = multipart.files.find((entry) => entry.name === "selfie") || null;
        const person = await savePublicPersonProfileForGallery({
          gallerySlug: path[2],
          fields: multipart.fields,
          file,
        });

        setResponseStatus(event, multipart.fields.personId ? 200 : 201);
        return { person };
      }

      if (method === "POST" && matches(path, ["public", "galleries", ":slug", "match"])) {
        const upload = await readUploadedFile(event, "selfie");
        const job = await createFaceMatchJob({
          gallerySlug: path[2],
          mimeType: upload.mimeType,
          buffer: upload.buffer,
          personId: upload.fields.personId || "",
          personName: upload.fields.personName || "",
        });
        await enqueueJobRecord(job);
        setResponseStatus(event, 202);
        return { job: toPublicJobResponse(job) };
      }
    }

    throw createError({ statusCode: 404, statusMessage: "Not found" });
  } catch (error) {
    const statusCode = error.statusCode || error.status || 500;
    const statusMessage = error.statusMessage || error.message || "Internal server error";
    setResponseStatus(event, statusCode);
    return {
      error: statusMessage,
      message: statusMessage,
    };
  }
});

function matches(actual, expected) {
  if (actual.length !== expected.length) {
    return false;
  }

  return expected.every((segment, index) => segment.startsWith(":") || segment === actual[index]);
}

function parseDriveFileId(link) {
  const patterns = [
    /\/folders\/([a-zA-Z0-9_-]+)/,
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
  ];

  for (const pattern of patterns) {
    const match = `${link || ""}`.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return "";
}
