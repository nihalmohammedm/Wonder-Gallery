<template>
  <main class="app-shell">
    <Card v-if="!authReady" class="surface-panel">
      <template #content>
        <div class="space-y-3">
          <p class="eyebrow">Authentication</p>
          <h1 class="section-title">Checking your session</h1>
          <p class="helper-copy">Verifying whether you already have an active admin login.</p>
        </div>
      </template>
    </Card>

    <Card v-else-if="!session" class="surface-panel">
      <template #content>
        <div class="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div class="space-y-3">
            <p class="eyebrow">Admin Access</p>
            <h1 class="page-title !text-4xl">Sign in to manage PicDrop</h1>
            <p class="max-w-2xl text-base leading-7 text-slate-600">
              Admin access is protected with Google sign-in. Use it to create galleries, sync Drive folders,
              upload headers, refresh common PINs, and review scanned people.
            </p>
          </div>

          <div class="flex flex-wrap gap-3">
            <Button label="Continue with Google" icon="pi pi-google" :loading="authBusy" @click="login" />
          </div>
        </div>
      </template>
    </Card>

    <template v-else>
      <section class="space-y-6">
        <Card v-if="!isGalleryRoute" class="surface-panel overflow-hidden">
          <template #content>
            <div class="space-y-6">
              <div class="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                <div class="space-y-3">
                  <p class="eyebrow">Admin Dashboard</p>
                  <h1 class="page-title !text-4xl">Common dashboard</h1>
                  <p class="max-w-3xl text-base leading-7 text-slate-600">
                    Monitor the whole workspace first, then open any gallery card to manage that event in a dedicated panel.
                  </p>
                  <p class="helper-copy">Signed in as <strong>{{ session.user?.email || "Unknown account" }}</strong></p>
                </div>

                <div class="flex flex-wrap gap-3">
                  <Button label="Sign Out" severity="secondary" outlined icon="pi pi-sign-out" :loading="authBusy" @click="logout" />
                </div>
              </div>

              <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div class="surface-muted p-5">
                  <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Galleries</p>
                  <p class="mt-2 text-3xl font-semibold text-slate-950">{{ galleries.length }}</p>
                </div>
                <div class="surface-muted p-5">
                  <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Total Images</p>
                  <p class="mt-2 text-3xl font-semibold text-slate-950">{{ totalImages }}</p>
                </div>
                <div class="surface-muted p-5">
                  <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">People Registered</p>
                  <p class="mt-2 text-3xl font-semibold text-slate-950">{{ totalPeopleRegistered }}</p>
                </div>
                <div class="surface-muted p-5">
                  <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Faces Indexed</p>
                  <p class="mt-2 text-3xl font-semibold text-slate-950">{{ totalFacesIndexed }}</p>
                </div>
              </div>
            </div>
          </template>
        </Card>

        <div v-if="!isGalleryRoute" class="space-y-3">
          <Message v-if="feedback" severity="success" :closable="false">{{ feedback }}</Message>
          <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
        </div>

        <Card v-if="!isGalleryRoute" class="surface-panel">
          <template #content>
            <div class="space-y-6">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div class="space-y-2">
                  <p class="eyebrow">Gallery Library</p>
                  <h2 class="section-title">Events</h2>
                  <p class="helper-copy">Each card opens the gallery management panel.</p>
                </div>
                <div class="flex flex-wrap gap-3">
                  <Tag :value="`${galleries.length} event${galleries.length === 1 ? '' : 's'}`" severity="contrast" rounded />
                  <Button label="Add Gallery" icon="pi pi-plus" @click="openCreateGalleryDialog" />
                </div>
              </div>

              <div v-if="galleries.length" class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <button
                  v-for="gallery in galleries"
                  :key="gallery.id"
                  type="button"
                  class="group overflow-hidden rounded-[10px] border border-slate-200 bg-white text-left transition hover:border-sky-300"
                  @click="openGalleryPanel(gallery.id)"
                >
                  <div class="aspect-[16/9] overflow-hidden bg-slate-100">
                    <img
                      v-if="gallery.headerImageUrl"
                      :src="gallery.headerImageUrl"
                      :alt="`${gallery.title} header`"
                      class="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                    />
                    <div v-else class="flex h-full w-full items-end bg-gradient-to-br from-white via-sky-50 to-cyan-100 p-5">
                      <p class="text-2xl font-semibold tracking-tight text-slate-900">{{ gallery.title }}</p>
                    </div>
                  </div>
                  <div class="space-y-3 p-5">
                    <div class="space-y-1">
                      <p class="text-lg font-semibold tracking-tight text-slate-950">{{ gallery.title }}</p>
                      <p class="text-xs uppercase tracking-[0.2em] text-slate-500">{{ gallery.slug }}</p>
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <span class="metric-pill">{{ galleryPhotoCount(gallery.id) }} images</span>
                      <span class="metric-pill">{{ galleryGuestCount(gallery.id) }} people</span>
                      <span class="metric-pill">{{ galleryIndexedPhotoCount(gallery.id) }} indexed</span>
                    </div>
                  </div>
                </button>
              </div>

              <div v-else class="surface-muted p-6 text-sm text-slate-500">
                No galleries yet. Create the first gallery to start the admin workspace.
              </div>
            </div>
          </template>
        </Card>

        <section v-if="isGalleryRoute && selectedGallery" class="space-y-6">
          <div class="space-y-3">
            <Message v-if="feedback" severity="success" :closable="false">{{ feedback }}</Message>
            <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <RouterLink to="/admin">
                <Button label="Back to Dashboard" severity="secondary" outlined icon="pi pi-arrow-left" />
              </RouterLink>
              <div class="space-y-1">
              <p class="eyebrow">Full Workspace</p>
              <h2 class="section-title">{{ selectedGallery.title }}</h2>
              </div>
            </div>
          </div>

          <AdminGalleryWorkspace
            :selected-gallery="selectedGallery"
            :selected-gallery-guests="selectedGalleryGuests"
            :selected-gallery-photos="selectedGalleryPhotos"
            :galleries="galleries"
            :photo-guests="photoGuests"
            :guest-form="guestForm"
            :photo-form="photoForm"
            :saving="saving"
            :gallery-photo-count="galleryPhotoCount(selectedGallery.id)"
            :gallery-guest-count="galleryGuestCount(selectedGallery.id)"
            :gallery-face-count="galleryFaceCount(selectedGallery.id)"
            :gallery-indexed-photo-count="galleryIndexedPhotoCount(selectedGallery.id)"
            :personal-url="personalUrl"
            :common-url="commonUrl"
            :on-edit-gallery="openEditGalleryDialog"
            :on-delete-gallery="removeGallery"
            :on-connect-drive="connectDrive"
            :on-sync-drive="syncDriveGallery"
            :on-refresh-pin="refreshPin"
            :on-upload-header-image="uploadHeaderImage"
            :on-submit-guest="submitGuest"
            :on-handle-guest-file="handleGuestFile"
            :on-submit-photo="submitPhoto"
            :on-open-photo="openPhoto"
          />
        </section>
      </section>
    </template>

    <Dialog
      v-model:visible="galleryFormDialogOpen"
      modal
      dismissableMask
      :header="galleryFormMode === 'create' ? 'Add Gallery' : 'Edit Gallery'"
      :style="{ width: 'min(92vw, 42rem)' }"
    >
      <form class="grid gap-4 md:grid-cols-2" @submit.prevent="submitGallery">
        <div v-if="galleryFormFeedback || galleryFormError" class="space-y-3 md:col-span-2">
          <Message v-if="galleryFormFeedback" severity="success" :closable="false">{{ galleryFormFeedback }}</Message>
          <Message v-if="galleryFormError" severity="error" :closable="false">{{ galleryFormError }}</Message>
        </div>
        <div class="space-y-2">
          <label class="text-sm font-medium text-slate-700">Gallery name</label>
          <InputText v-model.trim="galleryForm.title" required placeholder="Annual Day 2026" />
        </div>
        <div class="space-y-2">
          <label class="text-sm font-medium text-slate-700">Public slug</label>
          <InputText v-model.trim="galleryForm.slug" required placeholder="annual-day-2026" />
        </div>
        <div class="space-y-2 md:col-span-2">
          <label class="text-sm font-medium text-slate-700">Google Drive folder links</label>
          <div class="space-y-3">
            <div
              v-for="(_driveLink, index) in galleryForm.driveLinks"
              :key="`gallery-drive-link-${index}`"
              class="flex items-start gap-3"
            >
              <InputText
                v-model.trim="galleryForm.driveLinks[index]"
                required
                type="url"
                placeholder="https://drive.google.com/drive/folders/..."
              />
              <Button
                v-if="galleryForm.driveLinks.length > 1"
                type="button"
                severity="secondary"
                outlined
                icon="pi pi-trash"
                @click="removeDriveLinkField(index)"
              />
            </div>
            <Button type="button" label="Add Folder" severity="secondary" outlined icon="pi pi-plus" @click="addDriveLinkField" />
          </div>
          <p class="helper-copy">Add one Google Drive folder per text field. All folders sync into this gallery.</p>
        </div>
        <div class="flex items-center gap-3 md:col-span-2">
          <Checkbox v-model="galleryForm.isPublic" binary input-id="gallery-public" />
          <label for="gallery-public" class="text-sm text-slate-700">Public link enabled</label>
        </div>
        <div class="md:col-span-2 flex justify-end gap-3 pt-2">
          <Button label="Close" severity="secondary" outlined type="button" @click="galleryFormDialogOpen = false" />
          <Button :label="saving.gallery ? 'Saving...' : galleryFormMode === 'create' ? 'Add Gallery' : 'Save Gallery'" :loading="saving.gallery" type="submit" />
        </div>
      </form>
    </Dialog>

    <Drawer v-model:visible="galleryPanelOpen" position="right" class="!w-[min(100vw,58rem)]">
      <template #header>
        <div class="flex w-full items-start justify-between gap-4">
          <div class="space-y-2">
            <p class="eyebrow">Gallery Panel</p>
            <h2 class="section-title !text-2xl">{{ selectedGallery?.title || "Gallery" }}</h2>
          </div>
          <div class="flex items-center gap-3">
            <Button
              v-if="selectedGallery"
              label="Open Full Page"
              severity="secondary"
              outlined
              icon="pi pi-window-maximize"
              @click="openGalleryPage(selectedGallery.id)"
            />
          </div>
        </div>
      </template>
      <AdminGalleryWorkspace
        v-if="selectedGallery"
        class="p-1"
        :selected-gallery="selectedGallery"
        :selected-gallery-guests="selectedGalleryGuests"
        :selected-gallery-photos="selectedGalleryPhotos"
        :galleries="galleries"
        :photo-guests="photoGuests"
        :guest-form="guestForm"
        :photo-form="photoForm"
        :saving="saving"
        :gallery-photo-count="galleryPhotoCount(selectedGallery.id)"
        :gallery-guest-count="galleryGuestCount(selectedGallery.id)"
        :gallery-face-count="galleryFaceCount(selectedGallery.id)"
        :gallery-indexed-photo-count="galleryIndexedPhotoCount(selectedGallery.id)"
        :personal-url="personalUrl"
        :common-url="commonUrl"
        :on-edit-gallery="openEditGalleryDialog"
        :on-delete-gallery="removeGallery"
        :on-connect-drive="connectDrive"
        :on-sync-drive="syncDriveGallery"
        :on-refresh-pin="refreshPin"
        :on-upload-header-image="uploadHeaderImage"
        :on-submit-guest="submitGuest"
        :on-handle-guest-file="handleGuestFile"
        :on-submit-photo="submitPhoto"
        :on-open-photo="openPhoto"
      />
    </Drawer>

    <Dialog
      :visible="Boolean(activePhoto)"
      modal
      dismissableMask
      :header="''"
      :style="{ width: 'min(92vw, 72rem)' }"
      :contentStyle="{ padding: '0', overflow: 'hidden' }"
      @update:visible="closePhoto"
    >
      <div v-if="activePhoto" class="flex h-[78vh] max-h-[78vh] flex-col overflow-hidden">
        <div class="flex min-h-0 flex-1 items-center justify-center p-3 sm:p-4">
          <div class="surface-muted flex h-full w-full items-center justify-center overflow-hidden p-2 sm:p-3">
            <img
              :src="activePhoto.storageImageUrl || activePhoto.thumbnailUrl"
              :alt="activePhoto.title"
              class="block h-auto w-auto max-h-full max-w-full rounded-[10px] object-contain"
            />
          </div>
        </div>

        <div class="border-t border-slate-200 bg-white px-4 py-4 sm:px-6">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              {{ currentPhotoPositionLabel }}
            </p>
            <div class="flex flex-wrap justify-end gap-3">
              <Button label="Previous" severity="secondary" outlined icon="pi pi-angle-left" :disabled="!hasPreviousPhoto" @click="showPreviousPhoto" />
              <Button label="Next" severity="secondary" outlined icon="pi pi-angle-right" iconPos="right" :disabled="!hasNextPhoto" @click="showNextPhoto" />
              <a :href="activePhoto.driveLink" target="_blank" rel="noreferrer">
                <Button label="Open in Drive" severity="secondary" outlined icon="pi pi-external-link" />
              </a>
              <a v-if="activePhoto.driveFileId" :href="driveDownloadUrl(activePhoto)" target="_blank" rel="noreferrer" download>
                <Button label="Download Image" icon="pi pi-download" />
              </a>
              <Button
                label="Run Index"
                severity="secondary"
                outlined
                icon="pi pi-sparkles"
                :loading="saving.indexPhotoId === activePhoto.id"
                @click="runPhotoIndex(activePhoto)"
              />
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Button from "primevue/button";
import Card from "primevue/card";
import Checkbox from "primevue/checkbox";
import Dialog from "primevue/dialog";
import Drawer from "primevue/drawer";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import MultiSelect from "primevue/multiselect";
import Select from "primevue/select";
import Tag from "primevue/tag";
import AdminGalleryWorkspace from "../components/AdminGalleryWorkspace.vue";
import {
  createGallery,
  createGuest,
  createPhoto,
  deleteGallery,
  getAdminSnapshot,
  getDriveAuthUrl,
  indexPhoto,
  refreshGalleryPin,
  syncGalleryDrive,
  uploadGalleryHeaderImage,
} from "../lib/api.js";
import { getSession, getSupabaseBrowserClient, signInWithGoogle, signOut } from "../lib/auth.js";

const route = useRoute();
const router = useRouter();
const galleries = ref([]);
const guests = ref([]);
const photos = ref([]);
const feedback = ref("");
const error = ref("");
const galleryFormFeedback = ref("");
const galleryFormError = ref("");
const session = ref(null);
const authReady = ref(false);
const authBusy = ref(false);
const activeGalleryId = ref("");
const activePhoto = ref(null);
const galleryPanelOpen = ref(false);
const galleryFormDialogOpen = ref(false);
const galleryFormMode = ref("create");
const saving = reactive({
  gallery: false,
  guest: false,
  photo: false,
  headerImageGalleryId: "",
  deleteGalleryId: "",
  refreshPinGalleryId: "",
  connectDriveId: "",
  syncGalleryId: "",
  indexPhotoId: "",
});

const galleryForm = reactive({
  title: "",
  slug: "",
  driveLinks: [""],
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
const totalImages = computed(() => photos.value.length);
const totalPeopleRegistered = computed(() => guests.value.length);
const totalFacesIndexed = computed(() => photos.value.reduce((total, photo) => total + (Number(photo.faceCount) || 0), 0));
const isGalleryRoute = computed(() => Boolean(route.params.galleryId));
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
const currentPhotoIndex = computed(() => selectedGalleryPhotos.value.findIndex((photo) => photo.id === activePhoto.value?.id));
const hasPreviousPhoto = computed(() => currentPhotoIndex.value > 0);
const hasNextPhoto = computed(() => currentPhotoIndex.value >= 0 && currentPhotoIndex.value < selectedGalleryPhotos.value.length - 1);
const currentPhotoPositionLabel = computed(() =>
  currentPhotoIndex.value >= 0 ? `Image ${currentPhotoIndex.value + 1} of ${selectedGalleryPhotos.value.length}` : "",
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
      galleryPanelOpen.value = false;
      return;
    }

    if (!galleryIds.includes(activeGalleryId.value)) {
      activeGalleryId.value = galleryIds[0];
    }
  },
  { immediate: true },
);

watch(
  () => route.params.galleryId,
  (galleryId) => {
    if (typeof galleryId === "string" && galleryId) {
      setActiveGallery(galleryId);
      galleryPanelOpen.value = false;
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
    feedback.value = "";
    error.value = "";
    galleryFormFeedback.value = "";
    galleryFormError.value = "";
    const driveLinks = parseDriveLinks(galleryForm.driveLinks);
    const result = await createGallery({
      title: galleryForm.title,
      slug: slugify(galleryForm.slug),
      driveLinks,
      isPublic: galleryForm.isPublic,
    });
    galleryFormFeedback.value = "Gallery saved.";
    feedback.value = "Gallery saved.";
    Object.assign(galleryForm, {
      title: "",
      slug: "",
      driveLinks: [""],
      isPublic: true,
    });
    await loadSnapshot();
    setActiveGallery(result.gallery.id);
    galleryFormDialogOpen.value = false;
    if (isGalleryRoute.value) {
      await router.push({ name: "admin-gallery", params: { galleryId: result.gallery.id } });
    } else {
      galleryPanelOpen.value = true;
    }
  } catch (submitError) {
    galleryFormError.value = submitError.message;
  } finally {
    saving.gallery = false;
  }
}

function populateGalleryForm(gallery) {
  if (!gallery) {
    return;
  }

  Object.assign(galleryForm, {
    title: gallery.title,
    slug: gallery.slug,
    driveLinks: (gallery.driveLinks || [gallery.driveLink].filter(Boolean)).length
      ? [...(gallery.driveLinks || [gallery.driveLink].filter(Boolean))]
      : [""],
    isPublic: gallery.isPublic,
  });
}

function openCreateGalleryDialog() {
  galleryFormMode.value = "create";
  galleryFormFeedback.value = "";
  galleryFormError.value = "";
  Object.assign(galleryForm, {
    title: "",
    slug: "",
    driveLinks: [""],
    isPublic: true,
  });
  galleryFormDialogOpen.value = true;
}

function addDriveLinkField() {
  galleryForm.driveLinks.push("");
}

function removeDriveLinkField(index) {
  if (galleryForm.driveLinks.length === 1) {
    galleryForm.driveLinks[0] = "";
    return;
  }

  galleryForm.driveLinks.splice(index, 1);
}

function openEditGalleryDialog(gallery) {
  galleryFormFeedback.value = "";
  galleryFormError.value = "";
  populateGalleryForm(gallery);
  galleryFormMode.value = "edit";
  galleryFormDialogOpen.value = true;
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

    if (route.params.galleryId === gallery.id) {
      await router.push({ name: "admin" });
    }
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

async function refreshPin(gallery) {
  try {
    saving.refreshPinGalleryId = gallery.id;
    error.value = "";
    const result = await refreshGalleryPin(gallery.id);
    await loadSnapshot();
    feedback.value = `Common PIN refreshed for ${result.gallery.title}.`;
  } catch (refreshError) {
    error.value = refreshError.message;
  } finally {
    saving.refreshPinGalleryId = "";
  }
}

function setActiveGallery(galleryId) {
  activeGalleryId.value = galleryId;
  guestForm.galleryId = galleryId;
  photoForm.galleryId = galleryId;
}

function openGalleryPanel(galleryId) {
  setActiveGallery(galleryId);
  galleryPanelOpen.value = true;
}

async function openGalleryPage(galleryId) {
  setActiveGallery(galleryId);
  galleryPanelOpen.value = false;
  await router.push({ name: "admin-gallery", params: { galleryId } });
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

function galleryFaceCount(galleryId) {
  return photos.value
    .filter((photo) => photo.galleryId === galleryId)
    .reduce((total, photo) => total + (Number(photo.faceCount) || 0), 0);
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

function showPreviousPhoto() {
  if (!hasPreviousPhoto.value) {
    return;
  }

  activePhoto.value = selectedGalleryPhotos.value[currentPhotoIndex.value - 1] || activePhoto.value;
}

function showNextPhoto() {
  if (!hasNextPhoto.value) {
    return;
  }

  activePhoto.value = selectedGalleryPhotos.value[currentPhotoIndex.value + 1] || activePhoto.value;
}

function handleKeydown(event) {
  if (!activePhoto.value) {
    return;
  }

  if (event.key === "Escape") {
    closePhoto();
  } else if (event.key === "ArrowLeft") {
    showPreviousPhoto();
  } else if (event.key === "ArrowRight") {
    showNextPhoto();
  }
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

function parseDriveLinks(values) {
  return (values || [])
    .map((item) => item.trim())
    .filter(Boolean);
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
