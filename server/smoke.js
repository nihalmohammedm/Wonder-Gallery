import "dotenv/config";
import { createApp } from "./app.js";
import { ensureStore, readStore } from "./store.js";

try {
  await ensureStore();
} catch (error) {
  console.log(JSON.stringify({ skipped: true, reason: error.message }, null, 2));
  process.exit(0);
}

const app = createApp();

if (!app) {
  throw new Error("App creation failed");
}

try {
  const snapshot = await readStore();

  console.log(
    JSON.stringify(
      {
        ok: true,
        galleryCount: snapshot.galleries.length,
        guestCount: snapshot.guests.length,
        personCount: snapshot.people?.length || 0,
        photoCount: snapshot.photos.length,
        indexedPhotoCount: snapshot.photos.filter((photo) => photo.faceCount > 0).length,
      },
      null,
      2,
    ),
  );
} catch (error) {
  const message = error?.message || "";

  if (message.includes("public.persons") || message.includes("public.person_face_encodings")) {
    console.log(JSON.stringify({ skipped: true, reason: "Apply the updated Supabase schema before running smoke checks." }, null, 2));
    process.exit(0);
  }

  throw error;
}
