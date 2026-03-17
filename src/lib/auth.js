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
      flowType: "pkce",
    },
  });

  return supabaseClient;
}

export async function getSession() {
  const client = getSupabaseBrowserClient();
  await client.auth.initialize();
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
