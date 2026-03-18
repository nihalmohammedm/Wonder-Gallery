<template>
  <main class="shell admin-shell">
    <section v-if="!authReady" class="panel admin-full">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Authentication</p>
          <h2>Checking your session</h2>
        </div>
      </div>
      <p class="helper-copy">Verifying whether you already have an active admin login.</p>
    </section>

    <section v-else-if="!session" class="panel admin-full">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Authentication</p>
          <h2>Sign in with Google</h2>
        </div>
        <RouterLink class="button button-secondary" to="/">Overview</RouterLink>
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

    <template v-else>
      <aside class="admin-sidebar">
        <section class="panel admin-sidebar-panel">
          <div class="admin-brand">
            <div>
              <p class="eyebrow">Admin Panel</p>
              <h1>PicDrop</h1>
            </div>
            <div class="admin-sidebar-actions">
              <RouterLink class="button button-secondary" to="/">Overview</RouterLink>
              <button class="button button-primary" type="button" :disabled="authBusy" @click="logout">
                Sign Out
              </button>
            </div>
          </div>

          <div class="summary-metrics">
            <span class="metric">{{ galleries.length }} galleries</span>
            <span class="metric">{{ photos.length }} photos</span>
            <span class="metric">{{ guests.length }} guests</span>
          </div>

          <p class="helper-copy admin-session-copy">
            Signed in as <strong>{{ session.user?.email || "Unknown account" }}</strong>
          </p>
        </section>

        <section class="panel admin-sidebar-panel">
          <div class="panel-header">
            <div>
              <p class="eyebrow">Workspace</p>
              <h2>Navigate</h2>
            </div>
          </div>

          <div class="admin-nav">
            <button
              v-for="section in workspaceSections"
              :key="section.id"
              class="admin-nav-button"
              type="button"
              @click="scrollToSection(section.id)"
            >
              <span>{{ section.label }}</span>
              <small>{{ section.caption }}</small>
            </button>
          </div>
        </section>

        <section class="panel admin-sidebar-panel">
          <div class="panel-header">
            <div>
              <p class="eyebrow">Gallery Library</p>
              <h2>Select Gallery</h2>
            </div>
          </div>

          <div v-if="galleries.length" class="gallery-picker">
            <button
              v-for="gallery in galleries"
              :key="gallery.id"
              class="gallery-picker-item"
              :class="{ 'is-active': gallery.id === selectedGallery?.id }"
              type="button"
              @click="setActiveGallery(gallery.id)"
            >
              <strong>{{ gallery.title }}</strong>
              <span>{{ gallery.slug }}</span>
              <small>{{ galleryPhotoCount(gallery.id) }} photos</small>
            </button>
          </div>
          <div v-else class="empty-state">Create your first gallery to unlock the admin workspace.</div>
        </section>

        <section v-if="feedback || error" class="admin-message-stack">
          <div v-if="feedback" class="status-card admin-message">{{ feedback }}</div>
          <div v-if="error" class="status-card admin-message admin-message-error">{{ error }}</div>
        </section>
      </aside>

      <section class="admin-workspace">
        <section class="panel admin-workspace-hero">
          <div class="admin-workspace-top">
            <div>
              <p class="eyebrow">Selected Gallery</p>
              <h2>{{ selectedGallery?.title || "Create a gallery" }}</h2>
              <p class="helper-copy">
                {{
                  selectedGallery
                    ? "Work inside a single event context. Forms, gallery view, sync, and downloads stay tied to the selected gallery."
                    : "Start by creating a gallery and connecting its Google Drive folder."
                }}
              </p>
            </div>

            <div v-if="selectedGallery" class="header-actions">
              <button
                class="button button-secondary"
                type="button"
                :disabled="saving.deleteGalleryId === selectedGallery.id"
                @click="removeGallery(selectedGallery)"
              >
                {{ saving.deleteGalleryId === selectedGallery.id ? "Deleting..." : "Delete Gallery" }}
              </button>
              <button
                class="button button-primary"
                type="button"
                :disabled="saving.connectDriveId === selectedGallery.id"
                @click="connectDrive(selectedGallery)"
              >
                {{ saving.connectDriveId === selectedGallery.id ? "Redirecting..." : selectedGallery.hasDriveConnection ? "Reconnect Drive" : "Connect Drive" }}
              </button>
              <button
                class="button button-primary"
                type="button"
                :disabled="saving.syncGalleryId === selectedGallery.id || !selectedGallery.hasDriveConnection"
                @click="syncDriveGallery(selectedGallery)"
              >
                {{ saving.syncGalleryId === selectedGallery.id ? "Syncing..." : "Sync Drive" }}
              </button>
              <RouterLink class="button button-secondary" :to="`/g/${selectedGallery.slug}`">Personal Link</RouterLink>
              <RouterLink class="button button-secondary" :to="`/g/${selectedGallery.slug}/all`">Common Link</RouterLink>
            </div>
          </div>

          <div v-if="selectedGallery" class="admin-stat-grid">
            <article class="gallery-stat">
              <strong>{{ galleryPhotoCount(selectedGallery.id) }}</strong>
              <span>Photos</span>
            </article>
            <article class="gallery-stat">
              <strong>{{ galleryGuestCount(selectedGallery.id) }}</strong>
              <span>Guests</span>
            </article>
            <article class="gallery-stat">
              <strong>{{ galleryIndexedPhotoCount(selectedGallery.id) }}</strong>
              <span>Indexed</span>
            </article>
            <article class="gallery-stat">
              <strong>{{ selectedGallery.hasDriveConnection ? "Yes" : "No" }}</strong>
              <span>Drive Connected</span>
            </article>
          </div>

          <div v-if="selectedGallery" class="admin-link-grid">
            <div class="admin-link-card">
              <span class="eyebrow">Personal URL</span>
              <p>{{ personalUrl(selectedGallery.slug) }}</p>
            </div>
            <div class="admin-link-card">
              <span class="eyebrow">Common URL</span>
              <p>{{ commonUrl(selectedGallery.slug) }}</p>
            </div>
            <div class="admin-link-card">
              <span class="eyebrow">Drive Folder</span>
              <p>
                <a :href="selectedGallery.driveLink" target="_blank" rel="noreferrer">{{ selectedGallery.driveLink }}</a>
              </p>
            </div>
            <div class="admin-link-card admin-cover-card">
              <span class="eyebrow">Header Image</span>
              <img
                v-if="selectedGallery.headerImageUrl"
                class="admin-cover-preview"
                :src="selectedGallery.headerImageUrl"
                :alt="`${selectedGallery.title} header`"
              />
              <p v-else>Upload a banner image to brand this gallery on the public pages.</p>
              <label class="button button-secondary file-button">
                {{ saving.headerImageGalleryId === selectedGallery.id ? "Uploading..." : selectedGallery.headerImageUrl ? "Replace Header Image" : "Upload Header Image" }}
                <input
                  hidden
                  type="file"
                  accept="image/*"
                  :disabled="saving.headerImageGalleryId === selectedGallery.id"
                  @change="uploadHeaderImage($event, selectedGallery)"
                />
              </label>
            </div>
          </div>
        </section>

        <section id="gallery-setup" class="panel">
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

        <section id="guest-library" class="panel">
          <div class="panel-header">
            <div>
              <p class="eyebrow">Step 2</p>
              <h2>Reference Guests</h2>
            </div>
          </div>
          <p class="helper-copy">
            Reference guests are optional. Use them when you want a curated person list or extra selfie anchors for a gallery.
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

          <div v-if="selectedGalleryGuests.length" class="token-list">
            <div v-for="guest in selectedGalleryGuests" :key="guest.id" class="token token-guest">
              <img :src="guest.referenceImageUrl" :alt="`${guest.name} reference`" />
              <div>
                <strong>{{ guest.name }}</strong>
                <p>{{ guest.selfieCount || 0 }} {{ guest.selfieCount === 1 ? "selfie" : "selfies" }}</p>
              </div>
            </div>
          </div>
          <div v-else class="empty-state">
            {{ selectedGallery ? "No reference guests added for this gallery yet." : "Select or create a gallery first." }}
          </div>
        </section>

        <section id="photo-sources" class="panel">
          <div class="panel-header">
            <div>
              <p class="eyebrow">Step 3</p>
              <h2>Photo Sources</h2>
            </div>
          </div>
          <p class="helper-copy">
            Drive sync is the primary ingestion path. Manual photo entries are useful when you need to map a single file immediately.
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

        <section id="gallery-view" class="panel">
          <div class="gallery-panel-title">
            <div>
              <p class="eyebrow">Gallery View</p>
              <h2>{{ selectedGallery?.title || "Photo Library" }}</h2>
            </div>
            <div v-if="selectedGalleryPhotos.length" class="summary-metrics">
              <span class="metric">{{ selectedGalleryPhotos.length }} images</span>
              <span class="metric">{{ galleryIndexedPhotoCount(selectedGallery.id) }} indexed</span>
            </div>
          </div>

          <p class="helper-copy">
            Tiles open a larger preview. Download uses the original Google Drive file directly when a Drive file id is available.
          </p>

          <div v-if="selectedGalleryPhotos.length" class="admin-gallery-grid">
            <button
              v-for="photo in selectedGalleryPhotos"
              :key="photo.id"
              class="gallery-tile"
              type="button"
              @click="openPhoto(photo)"
            >
              <img :src="photo.storageImageUrl || photo.thumbnailUrl" :alt="photo.title" />
              <div class="gallery-tile-meta">
                <h3>{{ photo.title }}</h3>
                <p>{{ formatDate(photo.capturedAt) }}</p>
                <div class="summary-metrics">
                  <span class="metric">{{ photo.faceCount || 0 }} faces</span>
                  <span class="metric">{{ photo.source === "drive_sync" ? "Drive sync" : "Manual" }}</span>
                </div>
              </div>
            </button>
          </div>
          <div v-else class="empty-state">
            {{ selectedGallery ? "No images are mapped to this gallery yet." : "Create a gallery to start building its image library." }}
          </div>
        </section>
      </section>
    </template>

    <Teleport to="body">
      <div v-if="activePhoto" class="lightbox" @click.self="closePhoto">
        <article class="lightbox-panel">
          <button class="lightbox-close" type="button" @click="closePhoto" aria-label="Close image preview">Close</button>
          <div class="lightbox-stage">
            <img :src="activePhoto.storageImageUrl || activePhoto.thumbnailUrl" :alt="activePhoto.title" />
          </div>
          <div class="lightbox-details">
            <div>
              <p class="eyebrow">Image Preview</p>
              <h2>{{ activePhoto.title }}</h2>
            </div>
            <p class="helper-copy">
              {{ formatDate(activePhoto.capturedAt) }} · {{ activePhoto.faceCount || 0 }} indexed face{{ activePhoto.faceCount === 1 ? "" : "s" }}
            </p>
            <p class="helper-copy">
              Tagged guests: {{ photoGuestNames(activePhoto) || "No guests tagged" }}
            </p>
            <div class="button-row">
              <a class="button button-secondary" :href="activePhoto.driveLink" target="_blank" rel="noreferrer">
                Open in Drive
              </a>
              <a
                v-if="activePhoto.driveFileId"
                class="button button-primary"
                :href="driveDownloadUrl(activePhoto)"
                target="_blank"
                rel="noreferrer"
                download
              >
                Download Image
              </a>
              <button
                class="button button-secondary"
                type="button"
                :disabled="saving.indexPhotoId === activePhoto.id"
                @click="runPhotoIndex(activePhoto)"
              >
                {{ saving.indexPhotoId === activePhoto.id ? "Indexing..." : "Run Index" }}
              </button>
            </div>
          </div>
        </article>
      </div>
    </Teleport>
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  createGallery,
  createGuest,
  createPhoto,
  deleteGallery,
  getAdminSnapshot,
  getDriveAuthUrl,
  indexPhoto,
  syncGalleryDrive,
  uploadGalleryHeaderImage,
} from "../lib/api.js";
import { getSession, getSupabaseBrowserClient, signInWithGoogle, signOut } from "../lib/auth.js";

const workspaceSections = [
  { id: "gallery-setup", label: "Gallery Setup", caption: "Create or update gallery details" },
  { id: "guest-library", label: "Reference Guests", caption: "Manage guest anchors" },
  { id: "photo-sources", label: "Photo Sources", caption: "Add manual files or sync Drive" },
  { id: "gallery-view", label: "Gallery View", caption: "Open, preview, and download images" },
];

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
const activeGalleryId = ref("");
const activePhoto = ref(null);
const saving = reactive({
  gallery: false,
  guest: false,
  photo: false,
  headerImageGalleryId: "",
  deleteGalleryId: "",
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

const selectedGallery = computed(() => galleries.value.find((gallery) => gallery.id === activeGalleryId.value) || galleries.value[0] || null);
const selectedGalleryGuests = computed(() =>
  selectedGallery.value ? guests.value.filter((guest) => guest.galleryId === selectedGallery.value.id) : [],
);
const selectedGalleryPhotos = computed(() =>
  selectedGallery.value
    ? photos.value
        .filter((photo) => photo.galleryId === selectedGallery.value.id)
        .slice()
        .sort((left, right) => {
          const leftDate = left.capturedAt || left.createdAt || "";
          const rightDate = right.capturedAt || right.createdAt || "";
          return rightDate.localeCompare(leftDate);
        })
    : [],
);
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
  () => galleries.value.map((gallery) => gallery.id),
  (galleryIds) => {
    if (!galleryIds.length) {
      activeGalleryId.value = "";
      return;
    }

    if (!galleryIds.includes(activeGalleryId.value)) {
      activeGalleryId.value = galleryIds[0];
    }
  },
  { immediate: true },
);

watch(selectedGallery, (gallery) => {
  if (!gallery) {
    guestForm.galleryId = "";
    photoForm.galleryId = "";
    return;
  }

  if (!guestForm.galleryId || !galleries.value.some((item) => item.id === guestForm.galleryId)) {
    guestForm.galleryId = gallery.id;
  }

  if (!photoForm.galleryId || !galleries.value.some((item) => item.id === photoForm.galleryId)) {
    photoForm.galleryId = gallery.id;
  }
});

watch(
  () => photoForm.galleryId,
  () => {
    photoForm.guestIds = photoForm.guestIds.filter((guestId) => photoGuests.value.some((guest) => guest.id === guestId));
  },
);

watch(
  () => photos.value,
  (nextPhotos) => {
    if (!activePhoto.value) {
      return;
    }

    activePhoto.value = nextPhotos.find((photo) => photo.id === activePhoto.value.id) || null;
  },
);

onMounted(initializeAuth);
onMounted(() => window.addEventListener("keydown", handleKeydown));

onBeforeUnmount(() => {
  authSubscription?.unsubscribe();
  window.removeEventListener("keydown", handleKeydown);
});

async function initializeAuth() {
  try {
    const client = getSupabaseBrowserClient();
    const listener = client.auth.onAuthStateChange((_event, nextSession) => {
      void handleSessionChange(nextSession);
    });
    authSubscription = listener.data.subscription;
    session.value = await getSession();

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
  activePhoto.value = null;
}

async function loadSnapshot() {
  try {
    error.value = "";
    const snapshot = await getAdminSnapshot();
    galleries.value = snapshot.galleries;
    guests.value = snapshot.guests;
    photos.value = snapshot.photos;
  } catch (loadError) {
    error.value = loadError.message;
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
  } finally {
    authBusy.value = false;
  }
}

async function submitGallery() {
  try {
    saving.gallery = true;
    error.value = "";
    const result = await createGallery({
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
    setActiveGallery(result.gallery.id);
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
    setActiveGallery(guestForm.galleryId);
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
    setActiveGallery(photoForm.galleryId);
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
    const feedbackParts = [`Synced ${result.syncedCount} image${result.syncedCount === 1 ? "" : "s"} from Google Drive.`];

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

async function removeGallery(gallery) {
  const shouldDelete = window.confirm(`Delete "${gallery.title}"? This will remove its photos, guest references, face data, and synced assets.`);

  if (!shouldDelete) {
    return;
  }

  try {
    saving.deleteGalleryId = gallery.id;
    error.value = "";
    feedback.value = "";
    const result = await deleteGallery(gallery.id);

    if (activePhoto.value?.galleryId === gallery.id) {
      activePhoto.value = null;
    }

    await loadSnapshot();
    feedback.value = `Deleted ${result.gallery.title}.`;
  } catch (deleteError) {
    error.value = deleteError.message;
  } finally {
    saving.deleteGalleryId = "";
  }
}

async function uploadHeaderImage(event, gallery) {
  const file = event.target.files?.[0];
  event.target.value = "";

  if (!file) {
    return;
  }

  try {
    saving.headerImageGalleryId = gallery.id;
    error.value = "";
    const formData = new FormData();
    formData.set("image", file);
    await uploadGalleryHeaderImage(gallery.id, formData);
    await loadSnapshot();
    feedback.value = `Updated the header image for ${gallery.title}.`;
  } catch (uploadError) {
    error.value = uploadError.message;
  } finally {
    saving.headerImageGalleryId = "";
  }
}

function setActiveGallery(galleryId) {
  activeGalleryId.value = galleryId;
  guestForm.galleryId = galleryId;
  photoForm.galleryId = galleryId;
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

function photoGuestNames(photo) {
  return photo.guestIds
    .map((guestId) => guests.value.find((guest) => guest.id === guestId)?.name)
    .filter(Boolean)
    .join(", ");
}

function openPhoto(photo) {
  activePhoto.value = photo;
}

function closePhoto() {
  activePhoto.value = null;
}

function handleKeydown(event) {
  if (event.key === "Escape") {
    closePhoto();
  }
}

function scrollToSection(sectionId) {
  document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function personalUrl(slug) {
  return `${window.location.origin}/g/${slug}`;
}

function commonUrl(slug) {
  return `${window.location.origin}/g/${slug}/all`;
}

function driveDownloadUrl(photo) {
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(photo.driveFileId)}`;
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
