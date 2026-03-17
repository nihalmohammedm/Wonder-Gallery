import { createClient } from "@supabase/supabase-js";

let cachedClient;

export function getSupabaseAdmin() {
  if (cachedClient) {
    return cachedClient;
  }

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Create a .env file from .env.example and restart the server.");
  }

  cachedClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  return cachedClient;
}

export function getStorageBucket() {
  return process.env.SUPABASE_STORAGE_BUCKET || "guest-reference-images";
}

export function getGalleryBucket() {
  return process.env.SUPABASE_GALLERY_BUCKET || "gallery-images";
}

export async function verifySupabaseAccessToken(accessToken) {
  const supabase = getSupabaseAdmin();
  const result = await supabase.auth.getUser(accessToken);

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data.user || null;
}

export function isAllowedAdminEmail(email) {
  const configured = process.env.ADMIN_EMAILS;

  if (!configured) {
    return true;
  }

  const allowedEmails = configured
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return allowedEmails.includes((email || "").toLowerCase());
}
