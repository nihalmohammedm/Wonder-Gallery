import { createError, getHeader } from "h3";
import { verifySupabaseAccessToken } from "../supabase.js";
import { applyRuntimeEnvToProcess } from "./runtime.js";

export async function requireAdminUser(event) {
  applyRuntimeEnvToProcess();

  const authorization = getHeader(event, "authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";

  if (!token) {
    throw createError({ statusCode: 401, statusMessage: "Authentication required" });
  }

  let user;

  try {
    user = await verifySupabaseAccessToken(token);
  } catch {
    throw createError({ statusCode: 401, statusMessage: "Unable to verify your session" });
  }

  if (!user) {
    throw createError({ statusCode: 401, statusMessage: "Invalid session" });
  }

  return {
    id: user.id,
    email: user.email,
  };
}
