import { createClient } from "@supabase/supabase-js";

let supabaseClient;

export function getSupabaseBrowserClient() {
  if (supabaseClient) {
    return supabaseClient;
  }

  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.");
  }

  supabaseClient = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return supabaseClient;
}

export async function getSession() {
  const client = getSupabaseBrowserClient();
  await client.auth.initialize();
  await restoreSessionFromHash(client);
  const { data, error } = await client.auth.getSession();

  if (error) {
    throw error;
  }

  return data.session || null;
}

export async function getAccessToken() {
  const session = await getSession();
  return session?.access_token || "";
}

export async function signInWithGoogle() {
  const client = getSupabaseBrowserClient();
  const { data, error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/admin`,
    },
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function signOut() {
  const client = getSupabaseBrowserClient();
  const { error } = await client.auth.signOut();

  if (error) {
    throw error;
  }
}

async function restoreSessionFromHash(client) {
  if (typeof window === "undefined" || !window.location.hash?.includes("access_token=")) {
    return;
  }

  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");
  const errorDescription = hashParams.get("error_description");

  if (errorDescription) {
    throw new Error(errorDescription);
  }

  if (!accessToken || !refreshToken) {
    return;
  }

  const { error } = await client.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (error) {
    throw error;
  }

  const cleanUrl = `${window.location.origin}${window.location.pathname}${window.location.search}`;
  window.history.replaceState({}, document.title, cleanUrl);
}
