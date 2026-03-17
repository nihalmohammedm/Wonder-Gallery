import { getAccessToken } from "./auth.js";

const API_ROOT = "/api";

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});

  if (options.auth) {
    const accessToken = await getAccessToken();

    if (!accessToken) {
      throw new Error("You need to sign in to continue.");
    }

    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Request failed");
  }

  return response.json();
}

export function getAdminSnapshot() {
  return request("/admin/snapshot", { auth: true });
}

export function createGallery(payload) {
  return request("/admin/galleries", {
    method: "POST",
    auth: true,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export function createGuest(formData) {
  return request("/admin/guests", {
    method: "POST",
    auth: true,
    body: formData,
  });
}

export function createPerson(payload) {
  return request("/admin/persons", {
    method: "POST",
    auth: true,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export function addPersonSelfie(personId, formData) {
  return request(`/admin/persons/${personId}/selfies`, {
    method: "POST",
    auth: true,
    body: formData,
  });
}

export function createPhoto(payload) {
  return request("/admin/photos", {
    method: "POST",
    auth: true,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export function indexPhoto(photoId) {
  return request(`/admin/photos/${photoId}/index`, {
    method: "POST",
    auth: true,
  });
}

export function syncGalleryDrive(galleryId) {
  return request(`/admin/galleries/${galleryId}/sync-drive`, {
    method: "POST",
    auth: true,
  });
}

export function getDriveAuthUrl(galleryId) {
  return request(`/admin/galleries/${galleryId}/drive-auth-url`, {
    auth: true,
  });
}

export function getPublicGallery(slug) {
  return request(`/public/galleries/${slug}`);
}

export function getPublicGalleryPhotos(slug) {
  return request(`/public/galleries/${slug}/photos`);
}

export function matchSelfie(slug, formData) {
  return request(`/public/galleries/${slug}/match`, {
    method: "POST",
    body: formData,
  });
}
