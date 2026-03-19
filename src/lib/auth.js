import { createClient } from "@supabase/supabase-js";

let supabaseClient;
function readPublicConfig() {
  const runtimeConfig = typeof useRuntimeConfig === "function" ? useRuntimeConfig() : null;
  const url =
    runtimeConfig?.public?.supabaseUrl ||
    import.meta.env?.NUXT_PUBLIC_SUPABASE_URL ||
    "";
  const anonKey =
    runtimeConfig?.public?.supabaseAnonKey ||
    import.meta.env?.NUXT_PUBLIC_SUPABASE_ANON_KEY ||
    "";

  return { url, anonKey };
}

export function getSupabaseBrowserClient() {
  if (supabaseClient) {
    return supabaseClient;
  }

  const { url, anonKey } = readPublicConfig();

  if (!url || !anonKey) {
    throw new Error("Missing Supabase browser configuration. Set SUPABASE_URL and NUXT_PUBLIC_SUPABASE_ANON_KEY.");
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

export async function signInWithPassword(email, password) {
  const client = getSupabaseBrowserClient();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
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
