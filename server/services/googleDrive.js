import crypto from "node:crypto";
import path from "node:path";
import { google } from "googleapis";

const DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];
const STATE_TTL_MS = 10 * 60 * 1000;
const ALLOWED_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "heic", "heif"]);
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);
const THUMBNAIL_FALLBACK_IMAGE_EXTENSIONS = new Set(["heic", "heif"]);
const THUMBNAIL_FALLBACK_IMAGE_MIME_TYPES = new Set(["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"]);

export async function listDriveFolderImages(folderId, refreshToken) {
  const drive = getDriveClient(refreshToken);
  const files = [];
  let pageToken;

  do {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false and mimeType contains 'image/'`,
      fields:
        "nextPageToken, files(id, name, mimeType, webViewLink, thumbnailLink, createdTime, modifiedTime, imageMediaMetadata/time, md5Checksum, size)",
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    files.push(...(response.data.files || []));
    pageToken = response.data.nextPageToken || undefined;
  } while (pageToken);

  return files.map((file) => ({
    id: file.id,
    name: file.name || file.id,
    mimeType: file.mimeType || "image/jpeg",
    driveLink: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
    thumbnailLink: file.thumbnailLink || null,
    capturedAt: normalizeDriveDate(file.imageMediaMetadata?.time || file.createdTime || file.modifiedTime),
    modifiedAt: file.modifiedTime || null,
    checksum: file.md5Checksum || null,
    sizeBytes: file.size ? Number(file.size) : null,
  }));
}

export async function downloadDriveFile(fileId, refreshToken) {
  const drive = getDriveClient(refreshToken);
  const response = await drive.files.get(
    {
      fileId,
      alt: "media",
      supportsAllDrives: true,
    },
    {
      responseType: "arraybuffer",
    },
  );

  return Buffer.from(response.data);
}

export async function downloadDriveThumbnail(thumbnailUrl, refreshToken) {
  if (!thumbnailUrl) {
    throw new Error("No Drive thumbnail URL is available for this image.");
  }

  const auth = getOAuthClient();
  auth.setCredentials({
    refresh_token: refreshToken,
  });

  const accessTokenResponse = await auth.getAccessToken();
  const accessToken = accessTokenResponse?.token;

  if (!accessToken) {
    throw new Error("Unable to get a Google Drive access token for thumbnail download.");
  }

  const response = await fetch(thumbnailUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Drive thumbnail download failed with status ${response.status}.`);
  }

  return Buffer.from(await response.arrayBuffer());
}

export function createDriveAuthUrl({ galleryId, adminEmail }) {
  const state = signState({
    galleryId,
    adminEmail,
    exp: Date.now() + STATE_TTL_MS,
  });

  return getOAuthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: DRIVE_SCOPES,
    state,
  });
}

export async function exchangeDriveCode(code, state) {
  const payload = verifyState(state);
  const oauthClient = getOAuthClient();
  const { tokens } = await oauthClient.getToken(code);

  oauthClient.setCredentials(tokens);

  if (!tokens.refresh_token) {
    throw new Error("Google did not return a refresh token. Reconnect and grant consent again.");
  }

  const oauth2 = google.oauth2({
    version: "v2",
    auth: oauthClient,
  });
  const userInfo = await oauth2.userinfo.get();
  const driveEmail = userInfo.data.email || "";

  return {
    galleryId: payload.galleryId,
    adminEmail: payload.adminEmail,
    refreshToken: tokens.refresh_token,
    driveUser: {
      email: driveEmail,
      name: userInfo.data.name || "",
    },
  };
}

export function buildDriveCallbackRedirect({ status, galleryId, message }) {
  const adminAppUrl = process.env.ADMIN_APP_URL || "http://localhost:3000/admin";
  const url = new URL(adminAppUrl);

  url.searchParams.set("drive", status);

  if (galleryId) {
    url.searchParams.set("galleryId", galleryId);
  }

  if (message) {
    url.searchParams.set("message", message);
  }

  return url.toString();
}

export function isAllowedDriveImage(fileName, mimeType) {
  const extension = path.extname(fileName || "").toLowerCase().replace(".", "");
  const normalizedMimeType = (mimeType || "").toLowerCase();

  return ALLOWED_IMAGE_EXTENSIONS.has(extension) || ALLOWED_IMAGE_MIME_TYPES.has(normalizedMimeType);
}

export function requiresDriveThumbnailFallback(fileName, mimeType) {
  const extension = path.extname(fileName || "").toLowerCase().replace(".", "");
  const normalizedMimeType = (mimeType || "").toLowerCase();

  return THUMBNAIL_FALLBACK_IMAGE_EXTENSIONS.has(extension) || THUMBNAIL_FALLBACK_IMAGE_MIME_TYPES.has(normalizedMimeType);
}

function getDriveClient(refreshToken) {
  const auth = getOAuthClient();
  auth.setCredentials({
    refresh_token: refreshToken,
  });

  return google.drive({
    version: "v3",
    auth,
  });
}

function getOAuthClient() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI || "http://localhost:3000/api/google-drive/callback";

  if (!clientId || !clientSecret) {
    throw new Error("Missing GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET.");
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function signState(payload) {
  const stateSecret = getStateSecret();
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", stateSecret).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function verifyState(state) {
  const [encodedPayload, signature] = `${state || ""}`.split(".");

  if (!encodedPayload || !signature) {
    throw new Error("Invalid Google Drive OAuth state.");
  }

  const expectedSignature = crypto.createHmac("sha256", getStateSecret()).update(encodedPayload).digest("base64url");

  if (signature.length !== expectedSignature.length) {
    throw new Error("Google Drive OAuth state verification failed.");
  }

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    throw new Error("Google Drive OAuth state verification failed.");
  }

  const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));

  if (!payload.exp || payload.exp < Date.now()) {
    throw new Error("Google Drive OAuth state expired. Try connecting Drive again.");
  }

  return payload;
}

function getStateSecret() {
  const secret = process.env.GOOGLE_OAUTH_STATE_SECRET;

  if (!secret) {
    throw new Error("Missing GOOGLE_OAUTH_STATE_SECRET.");
  }

  return secret;
}

function normalizeDriveDate(value) {
  if (!value) {
    return null;
  }

  const trimmed = `${value}`.trim();

  if (!trimmed) {
    return null;
  }

  const exifLikeMatch = trimmed.match(/^(\d{4}):(\d{2}):(\d{2})(?:\s|$)/);

  if (exifLikeMatch) {
    return buildNormalizedDate(exifLikeMatch[1], exifLikeMatch[2], exifLikeMatch[3]);
  }

  const isoLikeMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s]|$)/);

  if (isoLikeMatch) {
    return buildNormalizedDate(isoLikeMatch[1], isoLikeMatch[2], isoLikeMatch[3]);
  }

  const parsed = new Date(trimmed);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return buildNormalizedDate(
    String(parsed.getUTCFullYear()),
    String(parsed.getUTCMonth() + 1).padStart(2, "0"),
    String(parsed.getUTCDate()).padStart(2, "0"),
  );
}

function buildNormalizedDate(year, month, day) {
  const normalized = `${year}-${month}-${day}`;
  const parsed = new Date(`${normalized}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  if (
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() + 1 !== Number(month) ||
    parsed.getUTCDate() !== Number(day)
  ) {
    return null;
  }

  return normalized;
}
