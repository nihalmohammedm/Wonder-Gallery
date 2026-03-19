import { getGalleryBucket, getStorageBucket, getSupabaseAdmin } from "./supabase.js";

const DEFAULT_PERSONAL_ACCENT_COLOR = "#0f5bd8";
const DEFAULT_COMMON_ACCENT_COLOR = "#0f5bd8";
const STORE_CACHE_TTL_MS = 5000;

let cachedStoreValue = null;
let cachedStoreExpiresAt = 0;
let inflightStorePromise = null;

export async function ensureStore() {
  getSupabaseAdmin();
}

export async function readStore() {
  if (cachedStoreValue && cachedStoreExpiresAt > Date.now()) {
    return cachedStoreValue;
  }

  if (inflightStorePromise) {
    return inflightStorePromise;
  }

  inflightStorePromise = loadStoreSnapshot();

  try {
    const snapshot = await inflightStorePromise;
    cachedStoreValue = snapshot;
    cachedStoreExpiresAt = Date.now() + STORE_CACHE_TTL_MS;
    return snapshot;
  } finally {
    inflightStorePromise = null;
  }
}

async function loadStoreSnapshot() {
  const supabase = getSupabaseAdmin();
  const [galleriesResult, legacyGuestsResult, peopleResult, personEncodingsResult, photosResult, photoFacesResult] =
    await Promise.all([
      supabase.from("galleries").select("*").order("created_at", { ascending: false }),
      supabase.from("guests").select("*").order("created_at", { ascending: false }),
      supabase.from("persons").select("*").order("created_at", { ascending: false }),
      supabase.from("person_face_encodings").select("person_id"),
      supabase.from("photos").select("*").order("created_at", { ascending: false }),
      supabase.from("photo_faces").select("photo_id"),
    ]);

  throwIfError(galleriesResult.error);
  throwIfError(legacyGuestsResult.error);
  throwIfError(peopleResult.error);
  throwIfError(personEncodingsResult.error);
  throwIfError(photosResult.error);
  throwIfError(photoFacesResult.error);

  const personEncodingCountByPersonId = countById((personEncodingsResult.data || []).map((row) => row.person_id));
  const photoFaceCountByPhotoId = countById((photoFacesResult.data || []).map((row) => row.photo_id));
  const galleryUrlMap = await createSignedUrlMap(
    getGalleryBucket(),
    (galleriesResult.data || []).map((row) => row.header_image_path),
  );
  const referenceImageUrlMap = await createSignedUrlMap(
    getStorageBucket(),
    [...(legacyGuestsResult.data || []), ...(peopleResult.data || [])].map((row) => row.reference_image_path),
  );
  const photoStoragePathsByBucket = groupStoragePathsByBucket(photosResult.data || []);
  const photoUrlMapsByBucket = new Map();

  for (const [bucket, paths] of photoStoragePathsByBucket) {
    photoUrlMapsByBucket.set(bucket, await createSignedUrlMap(bucket, paths));
  }

  const galleries = await Promise.all((galleriesResult.data || []).map((row) => toGalleryRecord(row, galleryUrlMap)));
  const legacyGuests = await Promise.all((legacyGuestsResult.data || []).map((row) => toLegacyGuestRecord(row, referenceImageUrlMap)));
  const people = await Promise.all(
    (peopleResult.data || []).map((row) => toPersonRecord(row, personEncodingCountByPersonId.get(row.id) || 0, referenceImageUrlMap)),
  );
  const photos = await Promise.all(
    (photosResult.data || []).map((row) =>
      toPhotoRecord(row, photoFaceCountByPhotoId, photoUrlMapsByBucket.get(row.storage_bucket) || new Map()),
    ),
  );

  return {
    galleries,
    people,
    guests: mergeGuests(legacyGuests, people),
    photos,
  };
}

export function parseDriveId(link) {
  if (!link) {
    return "";
  }

  const patterns = [
    /\/folders\/([a-zA-Z0-9_-]+)/,
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
  ];

  for (const pattern of patterns) {
    const match = link.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return "";
}

export function buildDriveThumbnailUrl(driveFileId) {
  return `https://drive.google.com/thumbnail?id=${driveFileId}&sz=w1200`;
}

export async function getGalleryBySlug(slug) {
  const supabase = getSupabaseAdmin();
  const result = await supabase.from("galleries").select("*").eq("slug", slug).maybeSingle();
  throwIfError(result.error);
  return result.data ? toGalleryRecord(result.data) : null;
}

export async function getGalleryById(galleryId) {
  const supabase = getSupabaseAdmin();
  const result = await supabase.from("galleries").select("*").eq("id", galleryId).maybeSingle();
  throwIfError(result.error);
  return result.data ? toGalleryRecord(result.data) : null;
}

export async function getPhotoById(photoId) {
  const supabase = getSupabaseAdmin();
  const result = await supabase.from("photos").select("*").eq("id", photoId).maybeSingle();
  throwIfError(result.error);
  return result.data ? toPhotoRecord(result.data, new Map()) : null;
}

export async function listPhotosByGalleryId(galleryId) {
  const supabase = getSupabaseAdmin();
  const [photosResult, photoFacesResult] = await Promise.all([
    supabase.from("photos").select("*").eq("gallery_id", galleryId).order("created_at", { ascending: false }),
    supabase.from("photo_faces").select("photo_id").eq("gallery_id", galleryId),
  ]);

  throwIfError(photosResult.error);
  throwIfError(photoFacesResult.error);

  const photoFaceCountByPhotoId = countById((photoFacesResult.data || []).map((row) => row.photo_id));
  const photoStoragePathsByBucket = groupStoragePathsByBucket(photosResult.data || []);
  const photoUrlMapsByBucket = new Map();

  for (const [bucket, paths] of photoStoragePathsByBucket) {
    photoUrlMapsByBucket.set(bucket, await createSignedUrlMap(bucket, paths));
  }

  return Promise.all(
    (photosResult.data || []).map((row) =>
      toPhotoRecord(row, photoFaceCountByPhotoId, photoUrlMapsByBucket.get(row.storage_bucket) || new Map()),
    ),
  );
}

export async function upsertGallery(input) {
  const supabase = getSupabaseAdmin();
  const existingResult = await supabase.from("galleries").select("*").eq("slug", input.slug).maybeSingle();
  throwIfError(existingResult.error);

  const payload = {
    title: input.title,
    slug: input.slug,
    drive_links: input.driveLinks,
    drive_folder_ids: input.driveFolderIds,
    personal_accent_color: normalizeAccentColor(input.personalAccentColor, DEFAULT_PERSONAL_ACCENT_COLOR),
    common_accent_color: normalizeAccentColor(input.commonAccentColor, DEFAULT_COMMON_ACCENT_COLOR),
    is_public: input.isPublic,
    updated_at: new Date().toISOString(),
  };

  if (existingResult.data) {
    if (!existingResult.data.common_access_pin) {
      payload.common_access_pin = generateGalleryAccessPin();
    }

    const updateResult = await supabase
      .from("galleries")
      .update(payload)
      .eq("id", existingResult.data.id)
      .select("*")
      .single();
    throwIfError(updateResult.error);
    invalidateStoreCache();
    return await toGalleryRecord(updateResult.data);
  }

  const insertResult = await supabase
    .from("galleries")
    .insert({
      ...payload,
      common_access_pin: generateGalleryAccessPin(),
      created_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  throwIfError(insertResult.error);
  invalidateStoreCache();
  return await toGalleryRecord(insertResult.data);
}

export async function saveGalleryDriveConnection(input) {
  const supabase = getSupabaseAdmin();
  const updateResult = await supabase
    .from("galleries")
    .update({
      drive_refresh_token: input.refreshToken,
      drive_connected_email: input.email || null,
      drive_connected_name: input.name || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.galleryId)
    .select("*")
    .single();

  throwIfError(updateResult.error);
  invalidateStoreCache();
  return await toGalleryRecord(updateResult.data);
}

export async function refreshGalleryAccessPin(galleryId) {
  const supabase = getSupabaseAdmin();
  const updateResult = await supabase
    .from("galleries")
    .update({
      common_access_pin: generateGalleryAccessPin(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", galleryId)
    .select("*")
    .single();

  throwIfError(updateResult.error);
  invalidateStoreCache();
  return await toGalleryRecord(updateResult.data);
}

export async function updateGalleryHeaderImage(input) {
  const supabase = getSupabaseAdmin();
  const galleryResult = await supabase.from("galleries").select("*").eq("id", input.galleryId).maybeSingle();
  throwIfError(galleryResult.error);

  if (!galleryResult.data) {
    return null;
  }

  const objectPath = `${input.galleryId}/header-${Date.now()}.${inferImageExtension(input.mimeType)}`;
  await saveGalleryImage(objectPath, input.buffer, input.mimeType);

  if (galleryResult.data.header_image_path && galleryResult.data.header_image_path !== objectPath) {
    await removeStorageObjects(getGalleryBucket(), [galleryResult.data.header_image_path]);
  }

  const updateResult = await supabase
    .from("galleries")
    .update({
      header_image_path: objectPath,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.galleryId)
    .select("*")
    .single();
  throwIfError(updateResult.error);
  invalidateStoreCache();

  return await toGalleryRecord(updateResult.data);
}

export async function deleteGallery(galleryId) {
  const supabase = getSupabaseAdmin();
  const [galleryResult, photosResult, peopleResult, legacyGuestsResult] = await Promise.all([
    supabase.from("galleries").select("id, title, slug, header_image_path").eq("id", galleryId).maybeSingle(),
    supabase.from("photos").select("storage_bucket, storage_object_path").eq("gallery_id", galleryId),
    supabase.from("persons").select("reference_image_path").eq("gallery_id", galleryId),
    supabase.from("guests").select("reference_image_path").eq("gallery_id", galleryId),
  ]);

  throwIfError(galleryResult.error);
  throwIfError(photosResult.error);
  throwIfError(peopleResult.error);
  throwIfError(legacyGuestsResult.error);

  if (!galleryResult.data) {
    return null;
  }

  const galleryImagePathsByBucket = new Map();

  for (const row of photosResult.data || []) {
    if (!row.storage_bucket || !row.storage_object_path) {
      continue;
    }

    const bucketPaths = galleryImagePathsByBucket.get(row.storage_bucket) || new Set();
    bucketPaths.add(row.storage_object_path);
    galleryImagePathsByBucket.set(row.storage_bucket, bucketPaths);
  }

  const referenceImagePaths = new Set(
    [...(peopleResult.data || []), ...(legacyGuestsResult.data || [])]
      .map((row) => row.reference_image_path)
      .filter(Boolean),
  );

  for (const [bucket, paths] of galleryImagePathsByBucket) {
    await removeStorageObjects(bucket, [...paths]);
  }

  await removeStorageObjects(getGalleryBucket(), [galleryResult.data.header_image_path].filter(Boolean));
  await removeStorageObjects(getStorageBucket(), [...referenceImagePaths]);

  const deleteResult = await supabase.from("galleries").delete().eq("id", galleryId).select("id").maybeSingle();
  throwIfError(deleteResult.error);
  invalidateStoreCache();

  return {
    id: galleryResult.data.id,
    title: galleryResult.data.title,
    slug: galleryResult.data.slug,
  };
}

export async function getGalleryDriveConnection(galleryId) {
  const supabase = getSupabaseAdmin();
  const result = await supabase
    .from("galleries")
    .select("id, drive_refresh_token, drive_connected_email, drive_connected_name")
    .eq("id", galleryId)
    .maybeSingle();

  throwIfError(result.error);

  if (!result.data) {
    return null;
  }

  return {
    galleryId: result.data.id,
    refreshToken: result.data.drive_refresh_token || "",
    email: result.data.drive_connected_email || "",
    name: result.data.drive_connected_name || "",
  };
}

export async function addPerson(input) {
  const supabase = getSupabaseAdmin();
  const insertResult = await supabase
    .from("persons")
    .insert({
      gallery_id: input.galleryId,
      name: input.name,
      email: input.email || null,
      phone: input.phone || null,
      company: input.company || null,
      reference_image_path: input.referenceImagePath || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  throwIfError(insertResult.error);
  invalidateStoreCache();
  return toPersonRecord(insertResult.data, 0);
}

export async function updatePersonProfile(input) {
  const supabase = getSupabaseAdmin();
  const updateResult = await supabase
    .from("persons")
    .update({
      name: input.name,
      email: input.email || null,
      phone: input.phone || null,
      company: input.company || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.personId)
    .select("*")
    .single();
  throwIfError(updateResult.error);
  invalidateStoreCache();

  const encodingCount = await countPersonEncodings(updateResult.data.id);
  return toPersonRecord(updateResult.data, encodingCount);
}

export async function findPersonById(personId) {
  const supabase = getSupabaseAdmin();
  const result = await supabase.from("persons").select("*").eq("id", personId).maybeSingle();
  throwIfError(result.error);

  if (!result.data) {
    return null;
  }

  const encodingCount = await countPersonEncodings(result.data.id);
  return toPersonRecord(result.data, encodingCount);
}

export async function addPersonFaceEncoding(input) {
  const supabase = getSupabaseAdmin();
  const insertResult = await supabase
    .from("person_face_encodings")
    .insert({
      gallery_id: input.galleryId,
      person_id: input.personId,
      source: input.source || "selfie",
      source_image_path: input.sourceImagePath || null,
      source_mime_type: input.sourceMimeType || null,
      box_top: sanitizeBoxValue(input.box?.top),
      box_right: sanitizeBoxValue(input.box?.right),
      box_bottom: sanitizeBoxValue(input.box?.bottom),
      box_left: sanitizeBoxValue(input.box?.left),
      encoding: input.encoding,
      created_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  throwIfError(insertResult.error);

  if (input.sourceImagePath) {
    const updateResult = await supabase
      .from("persons")
      .update({
        reference_image_path: input.sourceImagePath,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.personId)
      .select("*")
      .single();
    throwIfError(updateResult.error);
  }

  invalidateStoreCache();
  return toPersonFaceEncodingRecord(insertResult.data);
}

export async function replacePersonFaceEncodings(personId) {
  const supabase = getSupabaseAdmin();
  const [personResult, encodingsResult] = await Promise.all([
    supabase.from("persons").select("reference_image_path").eq("id", personId).maybeSingle(),
    supabase.from("person_face_encodings").select("source_image_path").eq("person_id", personId),
  ]);

  throwIfError(personResult.error);
  throwIfError(encodingsResult.error);

  const pathsToRemove = new Set(
    [personResult.data?.reference_image_path, ...(encodingsResult.data || []).map((row) => row.source_image_path)]
      .filter(Boolean),
  );

  if (pathsToRemove.size) {
    await removeStorageObjects(getStorageBucket(), [...pathsToRemove]);
  }

  const deleteResult = await supabase.from("person_face_encodings").delete().eq("person_id", personId);
  throwIfError(deleteResult.error);
  invalidateStoreCache();
}

export async function listPersonFaceEncodings(personId) {
  const supabase = getSupabaseAdmin();
  const result = await supabase
    .from("person_face_encodings")
    .select("*")
    .eq("person_id", personId)
    .order("created_at", { ascending: false });
  throwIfError(result.error);
  return (result.data || []).map(toPersonFaceEncodingRecord);
}

export async function listAllPersonEncodings() {
  const supabase = getSupabaseAdmin();
  const result = await supabase
    .from("person_face_encodings")
    .select("*");
  throwIfError(result.error);
  return (result.data || []).map(toPersonFaceEncodingRecord);
}

export async function addPhoto(input) {
  const supabase = getSupabaseAdmin();
  const insertResult = await supabase
    .from("photos")
    .insert({
      gallery_id: input.galleryId,
      title: input.title,
      drive_link: input.driveLink,
      drive_file_id: input.driveFileId,
      thumbnail_url: input.thumbnailUrl,
      storage_bucket: input.storageBucket || null,
      storage_object_path: input.storageObjectPath || null,
      source_mime_type: input.sourceMimeType || null,
      drive_modified_time: input.driveModifiedTime || null,
      drive_checksum: input.driveChecksum || null,
      drive_file_size_bytes: input.driveFileSizeBytes || null,
      image_width: input.imageWidth || null,
      image_height: input.imageHeight || null,
      captured_at: input.capturedAt || null,
      guest_ids: input.guestIds,
      source: input.source || "manual",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  throwIfError(insertResult.error);
  invalidateStoreCache();
  return toPhotoRecord(insertResult.data, new Map());
}

export async function upsertDrivePhoto(input) {
  const supabase = getSupabaseAdmin();
  const existingResult = await supabase
    .from("photos")
    .select("*")
    .eq("gallery_id", input.galleryId)
    .eq("drive_file_id", input.driveFileId)
    .maybeSingle();
  throwIfError(existingResult.error);

  const payload = {
    title: input.title,
    drive_link: input.driveLink,
    drive_file_id: input.driveFileId,
    thumbnail_url: input.thumbnailUrl,
    storage_bucket: input.storageBucket || null,
    storage_object_path: input.storageObjectPath || null,
    source_mime_type: input.sourceMimeType || null,
    drive_modified_time: input.driveModifiedTime || null,
    drive_checksum: input.driveChecksum || null,
    drive_file_size_bytes: input.driveFileSizeBytes || null,
    image_width: input.imageWidth || null,
    image_height: input.imageHeight || null,
    captured_at: input.capturedAt || null,
    source: "drive_sync",
    updated_at: new Date().toISOString(),
  };

  if (existingResult.data) {
    const updateResult = await supabase
      .from("photos")
      .update(payload)
      .eq("id", existingResult.data.id)
      .select("*")
      .single();
    throwIfError(updateResult.error);
    invalidateStoreCache();
    return toPhotoRecord(updateResult.data, new Map());
  }

  const insertResult = await supabase
    .from("photos")
    .insert({
      gallery_id: input.galleryId,
      guest_ids: [],
      created_at: new Date().toISOString(),
      ...payload,
    })
    .select("*")
    .single();
  throwIfError(insertResult.error);
  invalidateStoreCache();
  return toPhotoRecord(insertResult.data, new Map());
}

export async function listDriveSyncStatesByGallery(galleryId) {
  const supabase = getSupabaseAdmin();
  const result = await supabase
    .from("photos")
    .select("id, drive_file_id, drive_modified_time, drive_checksum, drive_file_size_bytes")
    .eq("gallery_id", galleryId)
    .eq("source", "drive_sync");
  throwIfError(result.error);

  return (result.data || []).map((row) => ({
    id: row.id,
    driveFileId: row.drive_file_id,
    driveModifiedTime: row.drive_modified_time,
    driveChecksum: row.drive_checksum,
    driveFileSizeBytes: row.drive_file_size_bytes,
  }));
}

export async function replacePhotoFacesForPhoto(input) {
  const supabase = getSupabaseAdmin();
  const deleteResult = await supabase.from("photo_faces").delete().eq("photo_id", input.photoId);
  throwIfError(deleteResult.error);

  if (!input.faces.length) {
    return [];
  }

  const insertPayload = input.faces.map((face, index) => ({
    gallery_id: input.galleryId,
    photo_id: input.photoId,
    face_index: index,
    box_top: sanitizeBoxValue(face.box?.top),
    box_right: sanitizeBoxValue(face.box?.right),
    box_bottom: sanitizeBoxValue(face.box?.bottom),
    box_left: sanitizeBoxValue(face.box?.left),
    encoding: face.encoding,
    created_at: new Date().toISOString(),
  }));

  const insertResult = await supabase.from("photo_faces").insert(insertPayload).select("*");
  throwIfError(insertResult.error);
  invalidateStoreCache();
  return (insertResult.data || []).map(toPhotoFaceRecord);
}

export async function listPhotoFacesByGallery(galleryId) {
  const supabase = getSupabaseAdmin();
  const result = await supabase.from("photo_faces").select("*").eq("gallery_id", galleryId);
  throwIfError(result.error);
  return (result.data || []).map(toPhotoFaceRecord);
}

export async function saveUpload(fileName, buffer) {
  const supabase = getSupabaseAdmin();
  const bucket = getStorageBucket();
  const objectPath = `person-selfies/${fileName}`;
  const uploadResult = await supabase.storage.from(bucket).upload(objectPath, buffer, {
    contentType: inferContentType(fileName),
    upsert: false,
  });
  throwIfError(uploadResult.error);
  return objectPath;
}

export async function saveGalleryImage(fileName, buffer, mimeType) {
  const supabase = getSupabaseAdmin();
  const bucket = getGalleryBucket();
  const objectPath = fileName;
  const uploadResult = await supabase.storage.from(bucket).upload(objectPath, buffer, {
    contentType: mimeType,
    upsert: true,
  });
  throwIfError(uploadResult.error);

  return {
    bucket,
    objectPath,
  };
}

export async function getStorageObjectBuffer(objectPath, bucket = getStorageBucket()) {
  const supabase = getSupabaseAdmin();
  const result = await supabase.storage.from(bucket).download(objectPath);
  throwIfError(result.error);

  return {
    bucket,
    objectPath,
    buffer: Buffer.from(await result.data.arrayBuffer()),
  };
}

export async function createJob(input) {
  const supabase = getSupabaseAdmin();
  const insertResult = await supabase
    .from("jobs")
    .insert({
      type: input.type,
      status: "queued",
      gallery_id: input.galleryId || null,
      gallery_slug: input.gallerySlug || null,
      photo_id: input.photoId || null,
      person_id: input.personId || null,
      requested_by: input.requestedBy || null,
      input: input.input || {},
      progress: {},
      result: null,
      error: null,
      created_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  throwIfError(insertResult.error);
  return toJobRecord(insertResult.data);
}

export async function findJobById(jobId) {
  const supabase = getSupabaseAdmin();
  const result = await supabase.from("jobs").select("*").eq("id", jobId).maybeSingle();
  throwIfError(result.error);
  return result.data ? toJobRecord(result.data) : null;
}

export async function markJobRunning(jobId, progress = {}) {
  return updateJob(jobId, {
    status: "running",
    progress,
    started_at: new Date().toISOString(),
    error: null,
  });
}

export async function markJobCompleted(jobId, resultPayload = {}, progress = {}) {
  return updateJob(jobId, {
    status: "completed",
    result: resultPayload,
    progress,
    error: null,
    finished_at: new Date().toISOString(),
  });
}

export async function markJobFailed(jobId, errorMessage, progress = {}) {
  return updateJob(jobId, {
    status: "failed",
    progress,
    error: errorMessage || "Job failed",
    finished_at: new Date().toISOString(),
  });
}

export async function updateJob(jobId, patch) {
  const supabase = getSupabaseAdmin();
  const result = await supabase
    .from("jobs")
    .update({
      status: patch.status,
      progress: patch.progress,
      result: patch.result,
      error: patch.error,
      started_at: patch.started_at,
      finished_at: patch.finished_at,
    })
    .eq("id", jobId)
    .select("*")
    .single();
  throwIfError(result.error);
  return toJobRecord(result.data);
}

async function createSignedImageUrl(objectPath) {
  if (!objectPath) {
    return "";
  }

  const supabase = getSupabaseAdmin();
  const bucket = getStorageBucket();
  const signedResult = await supabase.storage.from(bucket).createSignedUrl(objectPath, 60 * 60);
  throwIfError(signedResult.error);
  return signedResult.data?.signedUrl || "";
}

async function createSignedStorageUrl(bucket, objectPath) {
  if (!bucket || !objectPath) {
    return "";
  }

  const supabase = getSupabaseAdmin();
  const signedResult = await supabase.storage.from(bucket).createSignedUrl(objectPath, 60 * 60);
  throwIfError(signedResult.error);
  return signedResult.data?.signedUrl || "";
}

async function toLegacyGuestRecord(row, referenceImageUrlMap = null) {
  return {
    id: row.id,
    galleryId: row.gallery_id,
    name: row.name,
    faceHash: row.face_hash,
    faceProfile: row.face_profile,
    referenceImagePath: row.reference_image_path,
    referenceImageUrl: referenceImageUrlMap?.get(row.reference_image_path) || await createSignedImageUrl(row.reference_image_path),
    selfieCount: row.face_profile?.encoding ? 1 : 0,
    kind: "legacy_guest",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function toPersonRecord(row, selfieCount, referenceImageUrlMap = null) {
  return {
    id: row.id,
    galleryId: row.gallery_id,
    name: row.name,
    email: row.email || "",
    phone: row.phone || "",
    company: row.company || "",
    referenceImagePath: row.reference_image_path,
    referenceImageUrl: referenceImageUrlMap?.get(row.reference_image_path) || await createSignedImageUrl(row.reference_image_path),
    selfieCount,
    kind: "person",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function toGalleryRecord(row, galleryUrlMap = null) {
  const headerImageUrl = galleryUrlMap?.get(row.header_image_path) || await createSignedStorageUrl(getGalleryBucket(), row.header_image_path);
  const driveLinks = normalizeTextArray(row.drive_links);
  const driveFolderIds = normalizeTextArray(row.drive_folder_ids);
  const primaryDriveLink = driveLinks[0] || "";
  const primaryDriveFolderId = driveFolderIds[0] || "";
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    driveLink: primaryDriveLink,
    driveFolderId: primaryDriveFolderId,
    driveLinks: driveLinks.length ? driveLinks : [primaryDriveLink].filter(Boolean),
    driveFolderIds: driveFolderIds.length ? driveFolderIds : [primaryDriveFolderId].filter(Boolean),
    commonAccessPin: row.common_access_pin || "",
    personalAccentColor: normalizeAccentColor(row.personal_accent_color, DEFAULT_PERSONAL_ACCENT_COLOR),
    commonAccentColor: normalizeAccentColor(row.common_accent_color, DEFAULT_COMMON_ACCENT_COLOR),
    headerImagePath: row.header_image_path || "",
    headerImageUrl,
    hasDriveConnection: Boolean(row.drive_refresh_token),
    isPublic: row.is_public,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function generateGalleryAccessPin() {
  return `${Math.floor(1000 + Math.random() * 9000)}`;
}

async function toPhotoRecord(row, photoFaceCountByPhotoId, photoUrlMap = null) {
  const storageUrl = photoUrlMap?.get(row.storage_object_path) || await createSignedStorageUrl(row.storage_bucket, row.storage_object_path);
  return {
    id: row.id,
    galleryId: row.gallery_id,
    title: row.title,
    driveLink: row.drive_link,
    driveFileId: row.drive_file_id,
    thumbnailUrl: row.thumbnail_url,
    driveThumbnailUrl: row.thumbnail_url,
    storageImageUrl: storageUrl,
    storageBucket: row.storage_bucket,
    storageObjectPath: row.storage_object_path,
    sourceMimeType: row.source_mime_type,
    driveModifiedTime: row.drive_modified_time,
    driveChecksum: row.drive_checksum,
    driveFileSizeBytes: row.drive_file_size_bytes,
    imageWidth: row.image_width,
    imageHeight: row.image_height,
    faceCount: photoFaceCountByPhotoId.get(row.id) || 0,
    capturedAt: row.captured_at,
    guestIds: row.guest_ids || [],
    source: row.source || "manual",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toPhotoFaceRecord(row) {
  return {
    id: row.id,
    galleryId: row.gallery_id,
    photoId: row.photo_id,
    faceIndex: row.face_index,
    box: {
      top: row.box_top,
      right: row.box_right,
      bottom: row.box_bottom,
      left: row.box_left,
    },
    encoding: row.encoding,
    createdAt: row.created_at,
  };
}

function toJobRecord(row) {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    galleryId: row.gallery_id || "",
    gallerySlug: row.gallery_slug || "",
    photoId: row.photo_id || "",
    personId: row.person_id || "",
    requestedBy: row.requested_by || "",
    input: row.input || {},
    progress: row.progress || {},
    result: row.result,
    error: row.error || "",
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

function toPersonFaceEncodingRecord(row) {
  return {
    id: row.id,
    galleryId: row.gallery_id,
    personId: row.person_id,
    source: row.source,
    sourceImagePath: row.source_image_path,
    sourceMimeType: row.source_mime_type,
    box: {
      top: row.box_top,
      right: row.box_right,
      bottom: row.box_bottom,
      left: row.box_left,
    },
    encoding: row.encoding,
    createdAt: row.created_at,
  };
}

async function countPersonEncodings(personId) {
  const supabase = getSupabaseAdmin();
  const result = await supabase.from("person_face_encodings").select("person_id").eq("person_id", personId);
  throwIfError(result.error);
  return (result.data || []).length;
}

function inferContentType(fileName) {
  if (fileName.endsWith(".png")) {
    return "image/png";
  }

  return "image/jpeg";
}

function inferImageExtension(mimeType) {
  if (mimeType === "image/png") {
    return "png";
  }

  if (mimeType === "image/webp") {
    return "webp";
  }

  return "jpg";
}

function sanitizeBoxValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function throwIfError(error) {
  if (error) {
    throw new Error(error.message);
  }
}

async function removeStorageObjects(bucket, paths) {
  if (!bucket || !paths.length) {
    return;
  }

  const supabase = getSupabaseAdmin();

  for (let index = 0; index < paths.length; index += 100) {
    const batch = paths.slice(index, index + 100);
    const removeResult = await supabase.storage.from(bucket).remove(batch);
    throwIfError(removeResult.error);
  }
}

async function createSignedUrlMap(bucket, paths, expiresIn = 60 * 60) {
  if (!bucket) {
    return new Map();
  }

  const normalizedPaths = [...new Set((paths || []).filter(Boolean))];

  if (!normalizedPaths.length) {
    return new Map();
  }

  const supabase = getSupabaseAdmin();
  const signedUrlMap = new Map();

  for (let index = 0; index < normalizedPaths.length; index += 100) {
    const batch = normalizedPaths.slice(index, index + 100);
    const signedResult = await supabase.storage.from(bucket).createSignedUrls(batch, expiresIn);
    throwIfError(signedResult.error);

    for (const item of signedResult.data || []) {
      if (item?.path && item?.signedUrl) {
        signedUrlMap.set(item.path, item.signedUrl);
      }
    }
  }

  return signedUrlMap;
}

function groupStoragePathsByBucket(photoRows) {
  const grouped = new Map();

  for (const row of photoRows || []) {
    if (!row.storage_bucket || !row.storage_object_path) {
      continue;
    }

    const paths = grouped.get(row.storage_bucket) || [];
    paths.push(row.storage_object_path);
    grouped.set(row.storage_bucket, paths);
  }

  return grouped;
}

function countById(ids) {
  const counts = new Map();

  for (const id of ids) {
    counts.set(id, (counts.get(id) || 0) + 1);
  }

  return counts;
}

function normalizeTextArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}

function invalidateStoreCache() {
  cachedStoreValue = null;
  cachedStoreExpiresAt = 0;
}

function normalizeAccentColor(value, fallback) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : fallback;
}

function mergeGuests(legacyGuests, people) {
  const merged = new Map();

  for (const guest of [...legacyGuests, ...people]) {
    merged.set(guest.id, guest);
  }

  return [...merged.values()];
}
