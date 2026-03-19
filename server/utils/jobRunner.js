import {
  addPerson,
  createJob,
  findJobById,
  findPersonById,
  getGalleryById,
  getGalleryBySlug,
  getPhotoById,
  getStorageObjectBuffer,
  listPhotoFacesByGallery,
  listPhotosByGalleryId,
  listAllPersonEncodings,
  listPersonFaceEncodings,
  markJobCompleted,
  markJobFailed,
  markJobRunning,
  saveUpload,
  updatePersonProfile,
} from "../store.js";
import {
  buildDraftPersonName,
  detectExistingPersonForBuffer,
  detectExistingPersonForEncoding,
  getReferenceEncodingsForMatch,
  indexManualPhotoIfPossible,
  saveSelfieEncodingForPerson,
  syncGalleryDriveById,
} from "../shared/workflows.js";
import { findPhotoMatches, extractPrimaryFaceEncoding } from "../services/faceMatcher.js";
import { ensureOtpAuthUser } from "../supabase.js";

export async function runJobById(jobId) {
  const job = await findJobById(jobId);

  if (!job) {
    throw new Error("Job not found.");
  }

  await markJobRunning(jobId);

  try {
    let result;

    if (job.type === "gallery_sync") {
      result = await syncGalleryDriveById(job.galleryId);
    } else if (job.type === "photo_index") {
      result = await runPhotoIndexJob(job);
    } else if (job.type === "face_match") {
      result = await runFaceMatchJob(job);
    } else {
      throw new Error(`Unsupported job type: ${job.type}`);
    }

    await markJobCompleted(jobId, result);
    return result;
  } catch (error) {
    await markJobFailed(jobId, error.message || "Job failed");
    throw error;
  }
}

async function runPhotoIndexJob(job) {
  const photo = await getPhotoById(job.photoId);

  if (!photo) {
    throw new Error("Photo not found");
  }

  const gallery = await getGalleryById(photo.galleryId);

  if (!gallery) {
    throw new Error("Gallery not found");
  }

  return indexManualPhotoIfPossible({ gallery, photo });
}

async function runFaceMatchJob(job) {
  const gallery = await getGalleryBySlug(job.gallerySlug);

  if (!gallery || !gallery.isPublic) {
    throw new Error("Gallery not found or public access is disabled");
  }

  const object = await getStorageObjectBuffer(job.input.selfiePath);
  const requestedPersonId = `${job.input.personId || ""}`.trim();
  const requestedPersonName = `${job.input.personName || ""}`.trim();
  let person = requestedPersonId ? await findPersonById(requestedPersonId) : null;
  let extractedSelfieEncoding = null;

  if (!person && requestedPersonName) {
    person = await addPerson({
      galleryId: gallery.id,
      name: requestedPersonName,
    });
  }

  if (!person) {
    extractedSelfieEncoding = await extractPrimaryFaceEncoding(object.buffer, job.input.mimeType, { persistUpload: false });
    person = await detectExistingPersonForEncoding({
      galleryId: gallery.id,
      encoding: extractedSelfieEncoding.encoding,
    });

    if (!person) {
      person = await addPerson({
        galleryId: gallery.id,
        name: buildDraftPersonName(),
      });
    }
  }

  const referenceEncodings = await getReferenceEncodingsForMatch({
    person,
    galleryId: gallery.id,
    buffer: object.buffer,
    mimeType: job.input.mimeType,
    extractedSelfieEncoding,
  });
  const photos = await listPhotosByGalleryId(gallery.id);
  const photoFaces = await listPhotoFacesByGallery(gallery.id);
  const result = findPhotoMatches(referenceEncodings, photos, photoFaces);
  const diagnostics = {
    ...result.diagnostics,
    galleryId: gallery.id,
    gallerySlug: gallery.slug,
    personId: person?.id || null,
  };

  return {
    person,
    match: result.matches.length
      ? {
          photoCount: result.matches.length,
          bestScore: result.matches[0].score,
          confidence: result.matches[0].confidence,
          photos: result.matches.map((matchedPhoto) => ({
            ...matchedPhoto.photo,
            matchScore: matchedPhoto.score,
            matchedRegionId: matchedPhoto.regionId,
            matchConfidence: matchedPhoto.confidence,
          })),
        }
      : null,
    diagnostics,
  };
}

export async function createGallerySyncJob(galleryId, requestedBy) {
  return createJob({
    type: "gallery_sync",
    galleryId,
    requestedBy,
    input: {},
  });
}

export async function createPhotoIndexJob(photoId, galleryId, requestedBy) {
  return createJob({
    type: "photo_index",
    photoId,
    galleryId,
    requestedBy,
    input: {},
  });
}

export async function createFaceMatchJob({ gallerySlug, mimeType, buffer, requestedBy = "", personId = "", personName = "" }) {
  const extension = mimeType === "image/png" ? "png" : "jpg";
  const objectPath = await saveUpload(`job-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`, buffer);

  return createJob({
    type: "face_match",
    gallerySlug,
    requestedBy,
    personId,
    input: {
      selfiePath: objectPath,
      mimeType,
      personId,
      personName,
    },
  });
}

export async function savePublicPersonProfileForGallery({ gallerySlug, fields, file }) {
  const gallery = await getGalleryBySlug(gallerySlug);

  if (!gallery || !gallery.isPublic) {
    throw new Error("Gallery not found or public access is disabled");
  }

  const personId = `${fields.personId || ""}`.trim();
  const name = `${fields.name || ""}`.trim();
  const email = `${fields.email || ""}`.trim();
  const phone = `${fields.phone || ""}`.trim();
  const company = `${fields.company || ""}`.trim();

  if (!name) {
    throw new Error("name is required");
  }

  let person;

  if (personId) {
    person = await updatePersonProfile({
      personId,
      name,
      email,
      phone,
      company,
    });
  } else {
    const detectedPerson = file
      ? await detectExistingPersonForBuffer({
          galleryId: gallery.id,
          buffer: file.buffer,
          mimeType: file.mimeType,
        })
      : null;

    if (detectedPerson) {
      person = await updatePersonProfile({
        personId: detectedPerson.id,
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
  }

  if (file) {
    await saveSelfieEncodingForPerson({
      person,
      galleryId: gallery.id,
      buffer: file.buffer,
      mimeType: file.mimeType,
      source: "public_profile",
    });
  }

  const updatedPerson = await findPersonById(person.id);

  if (updatedPerson?.email) {
    await ensureOtpAuthUser(updatedPerson.email, {
      galleryId: gallery.id,
      personId: updatedPerson.id,
      name: updatedPerson.name,
    });
  }

  return updatedPerson;
}
