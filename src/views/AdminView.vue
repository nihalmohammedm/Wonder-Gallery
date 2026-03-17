<template>
  <main class="shell">
    <header class="page-header">
      <div>
        <p class="eyebrow">Admin Panel</p>
        <h1>Wonder Gallery</h1>
      </div>
      <nav class="header-actions">
        <RouterLink class="button button-secondary" to="/">Overview</RouterLink>
        <button v-if="session" class="button button-primary" type="button" :disabled="authBusy" @click="logout">
          Sign Out
        </button>
      </nav>
    </header>

    <section v-if="!authReady" class="panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Authentication</p>
          <h2>Checking your session</h2>
        </div>
      </div>
      <p class="helper-copy">Verifying whether you already have an active admin login.</p>
    </section>

    <section v-if="true" class="panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Auth Debug</p>
          <h2>Session Diagnostics</h2>
        </div>
      </div>
      <div class="summary-metrics">
        <span class="metric">Origin: {{ debugState.origin }}</span>
        <span class="metric">Hash: {{ debugState.hash ? "present" : "empty" }}</span>
        <span class="metric">Ready: {{ authReady ? "yes" : "no" }}</span>
        <span class="metric">Session: {{ session ? "present" : "missing" }}</span>
      </div>
      <p><strong>Email:</strong> <span>{{ debugState.email || "none" }}</span></p>
      <p><strong>Provider:</strong> <span>{{ debugState.provider || "none" }}</span></p>
      <p><strong>Last auth event:</strong> <span>{{ debugState.lastEvent || "none" }}</span></p>
      <p><strong>Last API error:</strong> <span>{{ debugState.lastApiError || "none" }}</span></p>
    </section>

    <section v-if="authReady && !session" class="panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Authentication</p>
          <h2>Sign in with Google</h2>
        </div>
      </div>
      <p class="helper-copy">
        Admin actions are protected. Sign in with Google to create galleries, sync Drive folders, and manage event photos.
      </p>
      <div class="button-row">
        <button class="button button-primary" type="button" :disabled="authBusy" @click="login">
          Continue with Google
        </button>
      </div>
    </section>

    <div v-if="authReady && session" class="two-column-layout">
      <div class="column-stack">
        <section class="panel">
          <div class="panel-header">
            <div>
              <p class="eyebrow">Step 1</p>
              <h2>Gallery Setup</h2>
            </div>
          </div>
          <form class="form-grid" @submit.prevent="submitGallery">
            <label>
              Gallery name
              <input v-model.trim="galleryForm.title" required type="text" placeholder="Annual Day 2026" />
            </label>
            <label>
              Public slug
              <input v-model.trim="galleryForm.slug" required type="text" placeholder="annual-day-2026" />
            </label>
            <label class="full-width">
              Shared Google Drive folder link
              <input
                v-model.trim="galleryForm.driveLink"
                required
                type="url"
                placeholder="https://drive.google.com/drive/folders/..."
              />
            </label>
            <label class="full-width checkbox-row">
              <input v-model="galleryForm.isPublic" type="checkbox" />
              Public link enabled
            </label>
            <button class="button button-primary" type="submit" :disabled="saving.gallery">Save Gallery</button>
          </form>
        </section>

        <section class="panel">
          <div class="panel-header">
            <div>
              <p class="eyebrow">Step 2</p>
              <h2>Optional Reference Guests</h2>
            </div>
          </div>
          <p class="helper-copy">
            This is optional legacy data. The public selfie flow now matches directly against synced event photos.
          </p>
          <form class="form-grid" @submit.prevent="submitGuest">
            <label>
              Guest name
              <input v-model.trim="guestForm.name" required type="text" placeholder="Nihal" />
            </label>
            <label>
              Linked gallery
              <select v-model="guestForm.galleryId" required>
                <option disabled value="">Select a gallery</option>
                <option v-for="gallery in galleries" :key="gallery.id" :value="gallery.id">{{ gallery.title }}</option>
              </select>
            </label>
            <label class="full-width">
              Reference selfie
              <input required type="file" accept="image/*" @change="handleGuestFile" />
            </label>
            <button class="button button-primary" type="submit" :disabled="saving.guest">Add Reference</button>
          </form>

          <div v-if="guests.length" class="token-list">
            <div v-for="guest in guests" :key="guest.id" class="token">
              <img :src="guest.referenceImageUrl" :alt="`${guest.name} reference`" />
              <span>{{ guest.name }}</span>
            </div>
          </div>
          <div v-else class="empty-state">No guests registered yet.</div>
        </section>
      </div>

      <div class="column-stack">
        <section class="panel">
          <div class="panel-header">
            <div>
              <p class="eyebrow">Step 3</p>
              <h2>Photo Sources</h2>
            </div>
          </div>
          <p class="helper-copy">
            Drive sync is the main ingestion path. Each synced image is stored and sent to the face-encoding API so matching can run on extracted face embeddings.
          </p>
          <form class="form-grid" @submit.prevent="submitPhoto">
            <label>
              Linked gallery
              <select v-model="photoForm.galleryId" required>
                <option disabled value="">Select a gallery</option>
                <option v-for="gallery in galleries" :key="gallery.id" :value="gallery.id">{{ gallery.title }}</option>
              </select>
            </label>
            <label>
              Photo label
              <input v-model.trim="photoForm.title" required type="text" placeholder="Stage photo 014" />
            </label>
            <label class="full-width">
              Google Drive file link
              <input
                v-model.trim="photoForm.driveLink"
                required
                type="url"
                placeholder="https://drive.google.com/file/d/.../view"
              />
            </label>
            <label>
              Captured on
              <input v-model="photoForm.capturedAt" type="date" />
            </label>
            <label class="full-width">
              Tagged guests
              <select v-model="photoForm.guestIds" multiple size="5">
                <option v-for="guest in photoGuests" :key="guest.id" :value="guest.id">{{ guest.name }}</option>
              </select>
            </label>
            <button class="button button-primary" type="submit" :disabled="saving.photo">Add Manual Photo</button>
          </form>
        </section>

        <section class="panel">
          <div class="panel-header">
            <div>
              <p class="eyebrow">Live Data</p>
              <h2>Gallery Preview</h2>
            </div>
          </div>
          <div v-if="galleries.length" class="summary-stack">
            <article v-for="gallery in galleries" :key="gallery.id" class="summary-card">
              <header>
                <div>
                  <h3>{{ gallery.title }}</h3>
                  <p>{{ gallery.slug }}</p>
                </div>
                <div class="header-actions">
                  <button
                    class="button button-primary"
                    type="button"
                    :disabled="saving.connectDriveId === gallery.id"
                    @click="connectDrive(gallery)"
                  >
                    {{ saving.connectDriveId === gallery.id ? "Redirecting..." : gallery.hasDriveConnection ? "Reconnect Drive" : "Connect Drive" }}
                  </button>
                  <button
                    class="button button-primary"
                    type="button"
                    :disabled="saving.syncGalleryId === gallery.id || !gallery.hasDriveConnection"
                    @click="syncDriveGallery(gallery)"
                  >
                    {{ saving.syncGalleryId === gallery.id ? "Syncing..." : "Sync Drive" }}
                  </button>
                  <RouterLink class="button button-secondary" :to="`/g/${gallery.slug}`">Personal Link</RouterLink>
                  <RouterLink class="button button-secondary" :to="`/g/${gallery.slug}/all`">Common Link</RouterLink>
                </div>
              </header>
              <div class="summary-metrics">
                <span class="metric">{{ gallery.isPublic ? "Public" : "Private" }}</span>
                <span class="metric">{{ galleryGuestCount(gallery.id) }} guests</span>
                <span class="metric">{{ galleryPhotoCount(gallery.id) }} photos</span>
                <span class="metric">{{ galleryIndexedPhotoCount(gallery.id) }} indexed</span>
                <span class="metric">{{ gallery.hasDriveConnection ? "Drive connected" : "Drive not connected" }}</span>
              </div>
              <p><strong>Drive folder:</strong> <a :href="gallery.driveLink" target="_blank" rel="noreferrer">{{ gallery.driveLink }}</a></p>
              <p><strong>Sync:</strong> Connect the organizer's Google account, then click Sync Drive to download and index the event photos from that folder.</p>
              <p><strong>Personal URL:</strong> <span>{{ personalUrl(gallery.slug) }}</span></p>
              <p><strong>Common URL:</strong> <span>{{ commonUrl(gallery.slug) }}</span></p>
              <div class="photo-grid">
                <article v-for="photo in galleryPhotos(gallery.id)" :key="photo.id" class="photo-card">
                  <img :src="photo.storageImageUrl || photo.thumbnailUrl" :alt="photo.title" />
                  <div>
                    <h3>{{ photo.title }}</h3>
                    <p>{{ formatDate(photo.capturedAt) }}</p>
                    <p>Tagged: {{ photoGuestNames(photo) || "No guests tagged" }}</p>
                    <p>Indexed faces: {{ photo.faceCount || 0 }}</p>
                    <button
                      class="button button-secondary"
                      type="button"
                      :disabled="saving.indexPhotoId === photo.id"
                      @click="runPhotoIndex(photo)"
                    >
                      {{ saving.indexPhotoId === photo.id ? "Indexing..." : "Run Index" }}
                    </button>
                  </div>
                </article>
                <div v-if="!galleryPhotos(gallery.id).length" class="empty-state">No Drive photos added yet.</div>
              </div>
            </article>
          </div>
          <div v-else class="empty-state">Create a gallery to generate a public link and preview photos.</div>
        </section>
      </div>
    </div>

    <p v-if="feedback" class="footer-note">{{ feedback }}</p>
    <p v-if="error" class="footer-error">{{ error }}</p>
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { createGallery, createGuest, createPhoto, getAdminSnapshot, getDriveAuthUrl, indexPhoto, syncGalleryDrive } from "../lib/api.js";
import { getSession, getSupabaseBrowserClient, signInWithGoogle, signOut } from "../lib/auth.js";

const route = useRoute();
const router = useRouter();
const galleries = ref([]);
const guests = ref([]);
const photos = ref([]);
const feedback = ref("");
const error = ref("");
const session = ref(null);
const authReady = ref(false);
const authBusy = ref(false);
const debugState = reactive({
  origin: typeof window !== "undefined" ? window.location.origin : "",
  hash: typeof window !== "undefined" ? window.location.hash : "",
  email: "",
  provider: "",
  lastEvent: "",
  lastApiError: "",
});
const saving = reactive({
  gallery: false,
  guest: false,
  photo: false,
  connectDriveId: "",
  syncGalleryId: "",
  indexPhotoId: "",
});

const galleryForm = reactive({
  title: "",
  slug: "",
  driveLink: "",
  isPublic: true,
});

const guestForm = reactive({
  name: "",
  galleryId: "",
  image: null,
});

const photoForm = reactive({
  galleryId: "",
  title: "",
  driveLink: "",
  capturedAt: "",
  guestIds: [],
});

const photoGuests = computed(() => guests.value.filter((guest) => guest.galleryId === photoForm.galleryId));
let authSubscription;

watch(
  () => galleryForm.title,
  (value) => {
    if (!galleryForm.slug || galleryForm.slug === slugify(galleryForm.slug)) {
      galleryForm.slug = slugify(value);
    }
  },
);

watch(
  () => galleries.value,
  (list) => {
    if (!guestForm.galleryId && list.length) {
      guestForm.galleryId = list[0].id;
    }

    if (!photoForm.galleryId && list.length) {
      photoForm.galleryId = list[0].id;
    }
  },
  { immediate: true },
);

watch(
  () => photoForm.galleryId,
  () => {
    photoForm.guestIds = photoForm.guestIds.filter((guestId) => photoGuests.value.some((guest) => guest.id === guestId));
  },
);

onMounted(initializeAuth);
onBeforeUnmount(() => {
  authSubscription?.unsubscribe();
});

async function initializeAuth() {
  try {
    const client = getSupabaseBrowserClient();
    debugState.hash = window.location.hash;
    const listener = client.auth.onAuthStateChange((_event, nextSession) => {
      debugState.lastEvent = _event;
      debugState.hash = window.location.hash;
      void handleSessionChange(nextSession);
    });
    authSubscription = listener.data.subscription;
    session.value = await getSession();
    syncDebugSession(session.value);

    if (session.value) {
      await loadSnapshot();
    } else {
      clearSnapshot();
    }
  } catch (loadError) {
    error.value = loadError.message;
  } finally {
    authReady.value = true;
    await handleDriveRedirectMessage();
  }
}

async function handleSessionChange(nextSession) {
  session.value = nextSession;
  error.value = "";
  syncDebugSession(nextSession);

  if (!nextSession) {
    clearSnapshot();
    return;
  }

  await loadSnapshot();
}

function clearSnapshot() {
  galleries.value = [];
  guests.value = [];
  photos.value = [];
}

async function loadSnapshot() {
  try {
    error.value = "";
    debugState.lastApiError = "";
    const snapshot = await getAdminSnapshot();
    galleries.value = snapshot.galleries;
    guests.value = snapshot.guests;
    photos.value = snapshot.photos;
  } catch (loadError) {
    error.value = loadError.message;
    debugState.lastApiError = loadError.message;
  }
}

async function handleDriveRedirectMessage() {
  const status = route.query.drive;
  const message = route.query.message;

  if (!status) {
    return;
  }

  if (status === "connected") {
    feedback.value = message ? `Drive connected: ${message}` : "Drive connected.";

    if (session.value) {
      await loadSnapshot();
    }
  } else if (status === "error") {
    error.value = typeof message === "string" ? message : "Unable to connect Google Drive.";
  }

  await router.replace({
    path: route.path,
    query: {
      ...Object.fromEntries(Object.entries(route.query).filter(([key]) => !["drive", "message", "galleryId"].includes(key))),
    },
  });
}

async function login() {
  try {
    authBusy.value = true;
    error.value = "";
    feedback.value = "";
    await signInWithGoogle();
  } catch (loginError) {
    error.value = loginError.message;
    debugState.lastApiError = loginError.message;
  } finally {
    authBusy.value = false;
  }
}

async function logout() {
  try {
    authBusy.value = true;
    error.value = "";
    await signOut();
    feedback.value = "Signed out.";
    clearSnapshot();
  } catch (logoutError) {
    error.value = logoutError.message;
    debugState.lastApiError = logoutError.message;
  } finally {
    authBusy.value = false;
  }
}

function syncDebugSession(nextSession) {
  debugState.email = nextSession?.user?.email || "";
  debugState.provider = nextSession?.user?.app_metadata?.provider || nextSession?.user?.app_metadata?.providers?.join(", ") || "";
}

async function submitGallery() {
  try {
    saving.gallery = true;
    error.value = "";
    await createGallery({
      title: galleryForm.title,
      slug: slugify(galleryForm.slug),
      driveLink: galleryForm.driveLink,
      isPublic: galleryForm.isPublic,
    });
    feedback.value = "Gallery saved.";
    Object.assign(galleryForm, {
      title: "",
      slug: "",
      driveLink: "",
      isPublic: true,
    });
    await loadSnapshot();
  } catch (submitError) {
    error.value = submitError.message;
  } finally {
    saving.gallery = false;
  }
}

function handleGuestFile(event) {
  guestForm.image = event.target.files?.[0] || null;
}

async function submitGuest() {
  if (!guestForm.image) {
    error.value = "Choose a reference selfie for the guest.";
    return;
  }

  try {
    saving.guest = true;
    error.value = "";
    const formData = new FormData();
    formData.set("name", guestForm.name);
    formData.set("galleryId", guestForm.galleryId);
    formData.set("image", guestForm.image);
    await createGuest(formData);
    feedback.value = "Guest added.";
    Object.assign(guestForm, {
      name: "",
      galleryId: guestForm.galleryId,
      image: null,
    });
    await loadSnapshot();
  } catch (submitError) {
    error.value = submitError.message;
  } finally {
    saving.guest = false;
  }
}

async function submitPhoto() {
  try {
    saving.photo = true;
    error.value = "";
    const result = await createPhoto({
      galleryId: photoForm.galleryId,
      title: photoForm.title,
      driveLink: photoForm.driveLink,
      capturedAt: photoForm.capturedAt,
      guestIds: photoForm.guestIds,
    });
    feedback.value = buildIndexingFeedback(result.indexing, "Photo mapped.");
    Object.assign(photoForm, {
      galleryId: photoForm.galleryId,
      title: "",
      driveLink: "",
      capturedAt: "",
      guestIds: [],
    });
    await loadSnapshot();
  } catch (submitError) {
    error.value = submitError.message;
  } finally {
    saving.photo = false;
  }
}

async function runPhotoIndex(photo) {
  try {
    saving.indexPhotoId = photo.id;
    error.value = "";
    const result = await indexPhoto(photo.id);
    feedback.value = buildIndexingFeedback(result.indexing, `Re-indexed ${photo.title}.`);
    await loadSnapshot();
  } catch (indexError) {
    error.value = indexError.message;
  } finally {
    saving.indexPhotoId = "";
  }
}

async function syncDriveGallery(gallery) {
  try {
    saving.syncGalleryId = gallery.id;
    error.value = "";
    const result = await syncGalleryDrive(gallery.id);
    const feedbackParts = [
      `Synced ${result.syncedCount} image${result.syncedCount === 1 ? "" : "s"} from Google Drive.`,
    ];

    if (result.skippedCount) {
      const skippedPreview = (result.skippedFiles || [])
        .slice(0, 3)
        .map((file) => `${file.name}: ${file.reason}`)
        .join(" | ");

      feedbackParts.push(
        `Skipped ${result.skippedCount} image${result.skippedCount === 1 ? "" : "s"}${skippedPreview ? ` (${skippedPreview})` : ""}.`,
      );
    }

    feedback.value = feedbackParts.join(" ");
    await loadSnapshot();
  } catch (syncError) {
    error.value = syncError.message;
  } finally {
    saving.syncGalleryId = "";
  }
}

async function connectDrive(gallery) {
  try {
    saving.connectDriveId = gallery.id;
    error.value = "";
    feedback.value = "";
    const result = await getDriveAuthUrl(gallery.id);
    window.location.assign(result.url);
  } catch (connectError) {
    error.value = connectError.message;
  } finally {
    saving.connectDriveId = "";
  }
}

function galleryGuestCount(galleryId) {
  return guests.value.filter((guest) => guest.galleryId === galleryId).length;
}

function galleryPhotoCount(galleryId) {
  return photos.value.filter((photo) => photo.galleryId === galleryId).length;
}

function galleryIndexedPhotoCount(galleryId) {
  return photos.value.filter((photo) => photo.galleryId === galleryId && photo.faceCount > 0).length;
}

function galleryPhotos(galleryId) {
  return photos.value.filter((photo) => photo.galleryId === galleryId).slice(0, 6);
}

function photoGuestNames(photo) {
  return photo.guestIds
    .map((guestId) => guests.value.find((guest) => guest.id === guestId)?.name)
    .filter(Boolean)
    .join(", ");
}

function personalUrl(slug) {
  return `${window.location.origin}/g/${slug}`;
}

function commonUrl(slug) {
  return `${window.location.origin}/g/${slug}/all`;
}

function formatDate(value) {
  if (!value) {
    return "Date not set";
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildIndexingFeedback(indexing, fallbackMessage) {
  if (!indexing) {
    return fallbackMessage;
  }

  if (!indexing.attempted) {
    return `${fallbackMessage} Index not attempted: ${indexing.reason}`;
  }

  if (!indexing.indexed) {
    return `${fallbackMessage} Index failed: ${indexing.reason}`;
  }

  return `${fallbackMessage} Indexed ${indexing.faceCount || 0} face${indexing.faceCount === 1 ? "" : "s"} from ${indexing.syncSource === "thumbnail_fallback" ? "Drive thumbnail fallback" : "original image"}.`;
}
</script>
