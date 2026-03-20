import { getAccessToken } from "./auth.js";

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});

  if (options.auth) {
    const accessToken = await getAccessToken();

    if (!accessToken) {
      throw new Error("You need to sign in to continue.");
    }

    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(`${resolveApiRoot()}${path}`, {
    ...options,
    headers,
  });

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  if (!response.ok) {
    if (isJson) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || payload.message || payload.detail || `Request failed (${response.status})`);
    }

    const text = await response.text().catch(() => "");
    throw new Error(buildNonJsonApiError(response.status, text));
  }

  if (!isJson) {
    const text = await response.text().catch(() => "");
    throw new Error(buildNonJsonApiError(response.status, text));
  }

  return response.json();
}

function resolveApiRoot() {
  const runtimeConfig = typeof useRuntimeConfig === "function" ? useRuntimeConfig() : null;
  const configured =
    runtimeConfig?.public?.apiRoot?.trim() ||
    import.meta.env?.NUXT_PUBLIC_API_ROOT?.trim();

  if (!configured) {
    return "/api";
  }

  return configured.endsWith("/") ? configured.slice(0, -1) : configured;
}

function buildNonJsonApiError(status, text) {
  const trimmed = (text || "").trim();

  if (trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html")) {
    return `API returned HTML instead of JSON (${status}). Check your domain routing and /api proxy configuration.`;
  }

  return trimmed || `API returned a non-JSON response (${status}).`;
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

export function deleteGallery(galleryId) {
  return request(`/admin/galleries/${galleryId}`, {
    method: "DELETE",
    auth: true,
  });
}

export function uploadGalleryHeaderImage(galleryId, formData) {
  return request(`/admin/galleries/${galleryId}/header-image`, {
    method: "POST",
    auth: true,
    body: formData,
  });
}

export function refreshGalleryPin(galleryId) {
  return request(`/admin/galleries/${galleryId}/refresh-pin`, {
    method: "POST",
    auth: true,
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

export function getJob(jobId, options = {}) {
  const scope = options.scope === "admin" ? "admin" : "public";
  return request(`/${scope}/jobs/${jobId}`, {
    auth: options.scope === "admin",
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

export function getPublicGalleryPhotos(slug, pin = "") {
  const params = new URLSearchParams();

  if (pin) {
    params.set("pin", pin);
  }

  const suffix = params.size ? `?${params.toString()}` : "";
  return request(`/public/galleries/${slug}/photos${suffix}`);
}

export function getPublicPerson(slug, personId) {
  return request(`/public/galleries/${slug}/people/${personId}`);
}

export function savePublicPersonProfile(slug, formData) {
  return request(`/public/galleries/${slug}/person-profile`, {
    method: "POST",
    body: formData,
  });
}

export function matchSelfie(slug, formData) {
  return request(`/public/galleries/${slug}/match`, {
    method: "POST",
    body: formData,
  });
}
