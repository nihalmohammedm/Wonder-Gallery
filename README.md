# PicDrop

PicDrop is now structured as a real application starter:

- Vue 3 frontend for the admin panel and public gallery flow
- Express backend for gallery data, Drive file parsing, selfie uploads, face-encoding sync, and selfie matching
- Supabase Postgres + Storage as the backend data layer

## Why a backend is required

Yes, you need a backend for this product.

The browser alone should not be responsible for:

- accessing Google Drive APIs and managing credentials
- storing per-face encodings
- matching selfies against event photos
- enforcing that guests only receive their own photos
- handling admin-only operations

In this codebase, the backend owns all of those responsibilities. The Vue frontend is only a client.

## Supabase backend layout

This app now expects Supabase for persistence.

- `galleries` table stores gallery metadata, the organizer's Drive folder link, and the Drive OAuth connection state
- `guests` table stores the guest name, face profile, and the path to the guest reference selfie in Supabase Storage
- `photos` table stores Drive file metadata and synced storage paths
- `photo_faces` table stores one row per detected face with bounding box and 128-d encoding
- the backend uses the Supabase `service_role` key, so the key must stay on the server only
- the frontend uses the Supabase `anon` key for Google sign-in on the admin panel

The current Vue frontend still talks only to the Express API. It does not connect to Supabase directly.

## Current architecture

### Frontend

- `src/views/AdminView.vue`: admin setup for galleries, optional guest references, manual photo mapping, and Drive sync
- `src/views/GuestView.vue`: public selfie upload/camera flow that returns direct photo matches
- `src/lib/api.js`: frontend API client

### Backend

- `server/index.js`: API routes
- `server/store.js`: Supabase queries and storage helpers
- `server/supabase.js`: Supabase admin client bootstrap
- `server/services/faceMatcher.js`: matching logic over stored face encodings
- `server/services/faceEncodingApi.js`: HTTP client for the external face encoding service
- `supabase/schema.sql`: database schema to run in Supabase

## API shape

- `GET /api/admin/snapshot`
- `POST /api/admin/galleries`
- `POST /api/admin/guests`
- `POST /api/admin/photos`
- `POST /api/admin/galleries/:galleryId/sync-drive`
- `GET /api/public/galleries/:slug`
- `GET /api/public/galleries/:slug/photos`
- `POST /api/public/galleries/:slug/match`

## What is still placeholder logic

This is a production-oriented starter, but two critical pieces are still intentionally isolated behind service boundaries:

1. Face encoding service
   This app now expects an external face encoding API compatible with [`sidharthmenon/face_recognition_api`](https://github.com/sidharthmenon/face_recognition_api). Gallery sync calls `/v1/faces/encodings`, stores one row per detected face, and selfie matching uses Euclidean distance over those 128-d encodings.

2. Google Drive integration
   The current implementation uses organizer OAuth and syncs a Drive folder on demand from the admin panel. For large galleries this should move to a background job and delta sync strategy.

For a production deployment, replace those with:

- a background Drive sync job using the Google Drive API
- stronger operational controls around the face encoding service, queueing, and retries
- stronger admin authorization rules and signed guest access links

## Run locally

1. Create a Supabase project.

2. In the Supabase SQL editor, run [supabase/schema.sql](/Users/nihalmohammed/Documents/Wonder Gallery/supabase/schema.sql).

3. In Supabase Storage, create private buckets for guest selfies and gallery images.
   Example names: `guest-reference-images` and `gallery-images`.

4. In Supabase Authentication, enable the Google provider and configure the allowed redirect URL for your app.
   For local development, add `http://localhost:5173/admin`.

5. Copy [.env.example](/Users/nihalmohammed/Documents/Wonder Gallery/.env.example) to `.env` and fill in:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_STORAGE_BUCKET`
- `SUPABASE_GALLERY_BUCKET`
- `ADMIN_EMAILS` optional comma-separated Google accounts allowed into `/admin`
- `ADMIN_APP_URL`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`
- `GOOGLE_OAUTH_STATE_SECRET`
- `FACE_ENCODING_API_URL`
- `FACE_ENCODING_DETECTION_MODEL`
- `FACE_ENCODING_MODEL`
- `FACE_ENCODING_NUM_JITTERS`
- `FACE_ENCODING_UPSAMPLE_TIMES`

   For a deployed domain, `ADMIN_APP_URL` and `GOOGLE_OAUTH_REDIRECT_URI` must use that exact host. Example:
   `ADMIN_APP_URL=https://picdrop.nihaal.in/admin`
   `GOOGLE_OAUTH_REDIRECT_URI=https://picdrop.nihaal.in/api/google-drive/callback`

6. In Google Cloud Console, create a web OAuth client for Drive access.
   Add the exact frontend origin and backend callback URL used by your environment.
   Local example: authorized JavaScript origin `http://localhost:5173` and authorized redirect URI `http://localhost:3000/api/google-drive/callback`.
   Deployed example: authorized JavaScript origin `https://picdrop.nihaal.in` and authorized redirect URI `https://picdrop.nihaal.in/api/google-drive/callback`.

7. Start the face encoding API from [sidharthmenon/face_recognition_api](https://github.com/sidharthmenon/face_recognition_api).
   By default this app expects it at `http://localhost:8000`.

8. Start the app and sign in at `/admin`.
   Use `Connect Drive` on a gallery to authorize the organizer's Google account for Drive sync.

9. Install dependencies:

```bash
npm install
```

10. Start both frontend and backend:

```bash
npm run dev
```

11. Open:

- `http://localhost:5173/admin`
- `http://localhost:5173/g/<your-gallery-slug>`
- `http://localhost:5173/g/<your-gallery-slug>/all`

The `/admin` route now requires Google sign-in. The server verifies the Supabase access token on every `/api/admin/*` request.

## Drive sync flow

1. Save a gallery with a Google Drive folder link.
2. Click `Connect Drive` in the admin panel and authorize the same Google account you used for admin login.
3. Click `Sync Drive` in the admin panel.
4. The backend uses that organizer's refresh token to read the Drive folder, creates a compressed preview image, uploads that preview to the Supabase gallery bucket, calls the face encoding API on the preview, and stores one row per detected face in `photo_faces`.
5. The common link shows every synced image, and the personal link returns the photos whose stored encodings best match the uploaded selfie.

## Recommended next backend upgrades

1. Add role-aware admin authorization and audit logging.
2. Add row-level security policies and signed admin sessions.
3. Move Drive sync to a background job with change detection.
4. Add background indexing jobs and retry handling around the face encoding service.
5. Issue signed guest links per event or person instead of fully public gallery slugs.
