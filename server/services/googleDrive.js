import crypto from "node:crypto";
import path from "node:path";
import { google } from "googleapis";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const STATE_TTL_MS = 10 * 60 * 1000;
const UNSUPPORTED_IMAGE_EXTENSIONS = new Set(["heic", "heif"]);
const UNSUPPORTED_IMAGE_MIME_TYPES = new Set(["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"]);

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
    scope: [DRIVE_SCOPE],
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

  if (payload.adminEmail && driveEmail && payload.adminEmail.toLowerCase() !== driveEmail.toLowerCase()) {
    throw new Error("Connect Drive using the same Google account you used to sign into admin.");
  }

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
  const adminAppUrl = process.env.ADMIN_APP_URL || "http://localhost:5173/admin";
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

export function getDriveFileExtension(fileName, mimeType) {
  const existingExtension = path.extname(fileName || "").toLowerCase();

  if (existingExtension) {
    return existingExtension.replace(".", "");
  }

  if (mimeType === "image/png") {
    return "png";
  }

  if (mimeType === "image/webp") {
    return "webp";
  }

  return "jpg";
}

export function isUnsupportedDriveImage(fileName, mimeType) {
  const extension = path.extname(fileName || "").toLowerCase().replace(".", "");

  return UNSUPPORTED_IMAGE_EXTENSIONS.has(extension) || UNSUPPORTED_IMAGE_MIME_TYPES.has((mimeType || "").toLowerCase());
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

  return value.slice(0, 10);
}
