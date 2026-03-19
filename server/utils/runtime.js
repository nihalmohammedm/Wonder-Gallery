export function applyRuntimeEnvToProcess() {
  const config = useRuntimeConfig();

  process.env.SUPABASE_URL ||= config.supabaseUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= config.supabaseServiceRoleKey;
  process.env.SUPABASE_STORAGE_BUCKET ||= config.supabaseStorageBucket;
  process.env.SUPABASE_GALLERY_BUCKET ||= config.supabaseGalleryBucket;
  process.env.ADMIN_APP_URL ||= config.adminAppUrl;
  process.env.GOOGLE_OAUTH_CLIENT_ID ||= config.googleOauthClientId;
  process.env.GOOGLE_OAUTH_CLIENT_SECRET ||= config.googleOauthClientSecret;
  process.env.GOOGLE_OAUTH_REDIRECT_URI ||= config.googleOauthRedirectUri;
  process.env.GOOGLE_OAUTH_STATE_SECRET ||= config.googleOauthStateSecret;
  process.env.FACE_ENCODING_API_URL ||= config.faceEncodingApiUrl;
  process.env.FACE_ENCODING_DETECTION_MODEL ||= config.faceEncodingDetectionModel;
  process.env.FACE_ENCODING_MODEL ||= config.faceEncodingModel;
  process.env.FACE_ENCODING_NUM_JITTERS ||= config.faceEncodingNumJitters;
  process.env.FACE_ENCODING_UPSAMPLE_TIMES ||= config.faceEncodingUpsampleTimes;
}
