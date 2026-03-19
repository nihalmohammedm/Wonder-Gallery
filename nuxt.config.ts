import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
  compatibilityDate: "2025-01-01",
  devtools: { enabled: false },
  css: ["~/src/styles.css", "primeicons/primeicons.css"],
  imports: {
    autoImport: true,
  },
  runtimeConfig: {
    redisUrl: process.env.REDIS_URL || "redis://redis:6379",
    supabaseUrl: process.env.SUPABASE_URL || "",
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    supabaseStorageBucket: process.env.SUPABASE_STORAGE_BUCKET || "guest-reference-images",
    supabaseGalleryBucket: process.env.SUPABASE_GALLERY_BUCKET || "gallery-images",
    adminAppUrl: process.env.ADMIN_APP_URL || "http://localhost:3000/admin",
    googleOauthClientId: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
    googleOauthClientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
    googleOauthRedirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI || "http://localhost:3000/api/google-drive/callback",
    googleOauthStateSecret: process.env.GOOGLE_OAUTH_STATE_SECRET || "",
    faceEncodingApiUrl: process.env.FACE_ENCODING_API_URL || "http://localhost:8000",
    faceEncodingDetectionModel: process.env.FACE_ENCODING_DETECTION_MODEL || "hog",
    faceEncodingModel: process.env.FACE_ENCODING_MODEL || "small",
    faceEncodingNumJitters: process.env.FACE_ENCODING_NUM_JITTERS || "1",
    faceEncodingUpsampleTimes: process.env.FACE_ENCODING_UPSAMPLE_TIMES || "1",
    public: {
      apiRoot: process.env.NUXT_PUBLIC_API_ROOT || "/api",
      supabaseUrl: process.env.NUXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "",
      supabaseAnonKey: process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY || "",
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
