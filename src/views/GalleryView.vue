<template>
  <main class="app-shell space-y-6">
    <template v-if="isPersonalResults">
      <section class="space-y-6">
        <section class="hero-banner" :style="bannerStyle(gallery)">
          <div v-if="!gallery?.headerImageUrl" class="hero-banner-fallback">
            <h1 class="page-title">{{ gallery?.title || "Event Name" }}</h1>
          </div>
          <img
            v-else
            :src="gallery.headerImageUrl"
            :alt="gallery.title || 'Gallery header'"
            class="block h-64 w-full object-cover sm:h-80"
          />
        </section>

        <Card class="surface-panel">
          <template #content>
            <div class="space-y-6">
              <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div class="flex items-center gap-4">
                  <div class="grid h-16 w-16 place-items-center overflow-hidden rounded-full border border-slate-200 bg-sky-50 text-lg font-semibold text-sky-700">
                    <img v-if="profilePhotoUrl" :src="profilePhotoUrl" :alt="profileForm.name || 'Profile photo'" class="h-full w-full object-cover" />
                    <span v-else>{{ profileInitials }}</span>
                  </div>
                  <div class="space-y-1">
                    <p class="eyebrow">Personal Gallery</p>
                    <h2 class="section-title">{{ profileForm.name || "Add your profile" }}</h2>
                    <p class="helper-copy">This scan image becomes the profile photo admins use to identify scanned people in the gallery.</p>
                  </div>
                </div>

                <div class="flex flex-wrap gap-3">
                  <RouterLink :to="`/g/${slug}`">
                    <Button label="Scan Again" severity="secondary" outlined icon="pi pi-refresh" />
                  </RouterLink>
                  <Button
                    v-if="profileCompleted && !profileFormVisible"
                    label="Edit Profile"
                    severity="secondary"
                    outlined
                    icon="pi pi-pencil"
                    @click="openProfileEditor"
                  />
                  <RouterLink v-if="profileSummaryVisible" :to="`/g/${slug}/all`">
                    <Button label="View All Photos" icon="pi pi-images" />
                  </RouterLink>
                </div>
              </div>

              <form v-if="profileFormVisible" class="grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto]" @submit.prevent="saveProfile">
                <InputText v-model.trim="profileForm.name" required placeholder="Full name" />
                <InputText v-model.trim="profileForm.email" type="email" required placeholder="Email" />
                <InputText v-model.trim="profileForm.phone" type="tel" placeholder="Phone" />
                <InputText v-model.trim="profileForm.company" placeholder="Company / Team" />
                <div class="flex gap-3 xl:justify-end">
                  <Button
                    v-if="profileCompleted"
                    label="Cancel"
                    type="button"
                    severity="secondary"
                    outlined
                    @click="closeProfileEditor"
                  />
                  <Button :label="savingProfile ? 'Saving...' : profileCompleted ? 'Save Changes' : 'Create Profile'" :loading="savingProfile" type="submit" />
                </div>
              </form>

              <div v-else-if="profileSummaryVisible" class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div class="surface-muted p-4">
                  <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Name</p>
                  <p class="mt-2 text-sm font-semibold text-slate-900">{{ personalResult?.person?.name || profileForm.name }}</p>
                </div>
                <div class="surface-muted p-4">
                  <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Email</p>
                  <p class="mt-2 text-sm font-semibold text-slate-900">{{ personalResult?.person?.email || profileForm.email }}</p>
                </div>
                <div v-if="personalResult?.person?.phone || profileForm.phone" class="surface-muted p-4">
                  <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Phone</p>
                  <p class="mt-2 text-sm font-semibold text-slate-900">{{ personalResult?.person?.phone || profileForm.phone }}</p>
                </div>
                <div v-if="personalResult?.person?.company || profileForm.company" class="surface-muted p-4">
                  <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Company</p>
                  <p class="mt-2 text-sm font-semibold text-slate-900">{{ personalResult?.person?.company || profileForm.company }}</p>
                </div>
              </div>
            </div>
          </template>
        </Card>
      </section>
    </template>

    <template v-else>
      <section class="space-y-6">
        <section class="surface-panel overflow-hidden">
          <div v-if="gallery?.headerImageUrl" class="hero-banner">
            <img :src="gallery.headerImageUrl" :alt="gallery.title || 'Gallery header'" class="block h-64 w-full object-cover sm:h-80" />
          </div>
          <div class="space-y-6 p-6 lg:p-8" :style="heroStyle(gallery)">
            <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div class="space-y-3">
                <p class="eyebrow">Common Link</p>
                <h1 class="page-title !text-4xl">{{ gallery?.title || "Gallery" }}</h1>
                <p class="max-w-2xl text-base leading-7 text-slate-600">Enter the 4-digit gallery PIN to unlock the event wall.</p>
              </div>

              <div class="flex flex-wrap gap-3">
                <RouterLink to="/admin">
                  <Button label="Admin" severity="secondary" outlined icon="pi pi-home" />
                </RouterLink>
                <RouterLink :to="`/g/${slug}`">
                  <Button label="Personal Link" icon="pi pi-camera" />
                </RouterLink>
              </div>
            </div>

            <div v-if="canShowPhotos" class="grid gap-3 md:grid-cols-3">
              <div class="surface-muted p-4">
                <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Total Photos</p>
                <p class="mt-2 text-2xl font-semibold text-slate-950">{{ displayPhotos.length }}</p>
              </div>
              <div class="surface-muted p-4">
                <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Captured Years</p>
                <p class="mt-2 text-2xl font-semibold text-slate-950">{{ photoYears }}</p>
              </div>
              <div class="surface-muted p-4">
                <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Latest Capture</p>
                <p class="mt-2 text-2xl font-semibold text-slate-950">{{ latestDate }}</p>
              </div>
            </div>
          </div>
        </section>
      </section>
    </template>

    <div class="status-copy">{{ status }}</div>

    <Card class="surface-panel">
      <template #content>
        <div class="space-y-6">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div class="space-y-2">
              <p class="eyebrow">{{ isPersonalResults ? "Matched Gallery" : "Photo Wall" }}</p>
              <h2 class="section-title">{{ isPersonalResults ? "Your Photos" : "All Images" }}</h2>
            </div>

            <div v-if="canShowPhotos" class="flex flex-wrap gap-2">
              <Tag :value="`${displayPhotos.length} image${displayPhotos.length === 1 ? '' : 's'}`" severity="contrast" rounded />
              <Tag
                v-if="isPersonalResults && personalResult?.diagnostics?.bestScore != null"
                :value="`Best score ${personalResult.diagnostics.bestScore}`"
                severity="info"
                rounded
              />
            </div>
          </div>

          <div v-if="canShowPhotos && displayPhotos.length" class="gallery-grid">
            <button
              v-for="photo in displayPhotos"
              :key="photo.id"
              type="button"
              @click="openPhoto(photo)"
            >
              <img :src="photo.storageImageUrl || photo.thumbnailUrl" :alt="photo.title" />
            </button>
          </div>

          <div v-else class="surface-muted grid min-h-48 place-items-center p-8 text-center text-sm text-slate-500">
            {{ lockedOrEmptyMessage }}
          </div>
        </div>
      </template>
    </Card>

    <Dialog
      :visible="showCommonPinModal"
      modal
      :closable="false"
      :draggable="false"
      header="Gallery Access"
      :style="{ width: 'min(92vw, 28rem)' }"
    >
      <div class="space-y-4">
        <div class="space-y-2">
          <p class="eyebrow">Common PIN</p>
          <h2 class="section-title !text-2xl">Enter the 4-digit PIN</h2>
          <p class="helper-copy">Ask the organizer for the gallery PIN. Images stay locked until it is correct.</p>
        </div>

        <Message v-if="commonPinMessage" :severity="commonPinMessageSeverity" :closable="false">
          {{ commonPinMessage }}
        </Message>

        <form class="grid gap-3" @submit.prevent="unlockCommonGallery">
          <InputText v-model.trim="commonPinInput" class="pin-input" type="text" inputmode="numeric" maxlength="4" placeholder="4-digit PIN" />
          <Button :label="loadingCommonPhotos ? 'Unlocking...' : 'Open Gallery'" :loading="loadingCommonPhotos" type="submit" :disabled="commonPinInput.trim().length !== 4" />
        </form>
      </div>
    </Dialog>

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
              <a :href="driveDownloadUrl(activePhoto)" target="_blank" rel="noreferrer" download>
                <Button label="Download Image" icon="pi pi-download" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { useRoute } from "vue-router";
import Button from "primevue/button";
import Card from "primevue/card";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Tag from "primevue/tag";
import { getPublicGallery, getPublicGalleryPhotos, savePublicPersonProfile } from "../lib/api.js";

const PERSONAL_MATCH_STORAGE_PREFIX = "picdrop-personal-match";

const props = defineProps({
  slug: {
    type: String,
    required: true,
  },
});

const route = useRoute();
const gallery = ref(null);
const photos = ref([]);
const status = ref("Loading gallery...");
const emptyMessage = ref("No gallery images are available yet.");
const personalResult = ref(null);
const activePhoto = ref(null);
const savingProfile = ref(false);
const loadingCommonPhotos = ref(false);
const commonPinInput = ref("");
const commonPinVerified = ref(false);
const commonPinMessage = ref("");
const commonPinMessageSeverity = ref("error");
const editingProfile = ref(true);
const personalAccessGranted = ref(false);

const profileForm = reactive({
  name: "",
  email: "",
  phone: "",
  company: "",
});

const isPersonalResults = computed(() => route.query.source === "personal" && Boolean(personalResult.value));
const profileCompleted = computed(() => Boolean(personalResult.value?.profileCompleted));
const profileFormVisible = computed(() => isPersonalResults.value && (!personalAccessGranted.value || editingProfile.value));
const profileSummaryVisible = computed(() => isPersonalResults.value && personalAccessGranted.value && profileCompleted.value && !editingProfile.value);
const canShowPhotos = computed(() => (isPersonalResults.value ? personalAccessGranted.value && profileCompleted.value : commonPinVerified.value));
const showCommonPinModal = computed(() => !isPersonalResults.value && gallery.value && !commonPinVerified.value);
const displayPhotos = computed(() => (isPersonalResults.value ? personalResult.value?.match?.photos || [] : photos.value));
const currentPhotoIndex = computed(() => displayPhotos.value.findIndex((photo) => photo.id === activePhoto.value?.id));
const hasPreviousPhoto = computed(() => currentPhotoIndex.value > 0);
const hasNextPhoto = computed(() => currentPhotoIndex.value >= 0 && currentPhotoIndex.value < displayPhotos.value.length - 1);
const currentPhotoPositionLabel = computed(() =>
  currentPhotoIndex.value >= 0 ? `Image ${currentPhotoIndex.value + 1} of ${displayPhotos.value.length}` : "",
);
const photoYears = computed(() => {
  const years = new Set(
    displayPhotos.value
      .map((photo) => (photo.capturedAt ? new Date(photo.capturedAt).getFullYear() : null))
      .filter(Boolean),
  );
  return years.size || 0;
});
const latestDate = computed(() => {
  const datedPhotos = displayPhotos.value
    .filter((photo) => photo.capturedAt)
    .slice()
    .sort((left, right) => right.capturedAt.localeCompare(left.capturedAt));
  return datedPhotos[0] ? formatDate(datedPhotos[0].capturedAt) : "No date";
});
const profilePhotoUrl = computed(() => personalResult.value?.person?.referenceImageUrl || personalResult.value?.selfieDataUrl || "");
const profileInitials = computed(() => {
  const parts = (profileForm.name || "Guest")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() || "").join("") || "G";
});
const lockedOrEmptyMessage = computed(() => {
  if (isPersonalResults.value && !personalAccessGranted.value) {
    return "Enter your details and submit the profile form to view your matched photos.";
  }

  if (!isPersonalResults.value && !commonPinVerified.value) {
    return "Enter the 4-digit PIN to unlock this gallery.";
  }

  return emptyMessage.value;
});

onMounted(loadGallery);
onMounted(() => window.addEventListener("keydown", handleKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", handleKeydown));

async function loadGallery() {
  try {
    restorePersonalMatch();

    const galleryResponse = await getPublicGallery(props.slug);
    gallery.value = galleryResponse.gallery;

    if (isPersonalResults.value) {
      hydrateProfileForm();
      resetPersonalAccess();
      status.value = personalResult.value?.status || "Enter your details and submit the form to open your matched photos.";
      emptyMessage.value = personalResult.value?.status || "No confident match was found for your selfie.";
      return;
    }

    commonPinInput.value = "";
    commonPinVerified.value = false;
    commonPinMessage.value = "";
    status.value = "Enter the 4-digit PIN to unlock this gallery.";
    emptyMessage.value = "Enter the 4-digit PIN to unlock this gallery.";
  } catch (error) {
    status.value = error.message;
    emptyMessage.value = "This gallery is not available.";
  }
}

function restorePersonalMatch() {
  if (route.query.source !== "personal") {
    personalResult.value = null;
    return;
  }

  try {
    const stored = sessionStorage.getItem(matchStorageKey(props.slug));
    personalResult.value = stored ? JSON.parse(stored) : null;
  } catch {
    personalResult.value = null;
  }
}

function hydrateProfileForm() {
  const person = personalResult.value?.person;
  profileForm.name = person?.name || "";
  profileForm.email = person?.email || "";
  profileForm.phone = person?.phone || "";
  profileForm.company = person?.company || "";
}

function resetPersonalAccess() {
  editingProfile.value = true;
  personalAccessGranted.value = false;
}

function openProfileEditor() {
  editingProfile.value = true;
}

function closeProfileEditor() {
  hydrateProfileForm();
  editingProfile.value = false;
}

async function saveProfile() {
  if (!gallery.value || !profileForm.name.trim()) {
    status.value = "Name is required.";
    return;
  }

  if (!profileForm.email.trim()) {
    status.value = "Email is required.";
    return;
  }

  try {
    const optimisticPerson = {
      ...(personalResult.value?.person || {}),
      name: profileForm.name.trim(),
      email: profileForm.email.trim(),
      phone: profileForm.phone.trim(),
      company: profileForm.company.trim(),
    };

    personalResult.value = {
      ...personalResult.value,
      person: optimisticPerson,
      profileCompleted: true,
      status: `Profile saved for ${optimisticPerson.name}. Your matched photos are ready.`,
    };
    persistPersonalResult();
    personalAccessGranted.value = true;
    editingProfile.value = false;
    status.value = `Profile saved for ${optimisticPerson.name}. Your matched photos are ready.`;

    savingProfile.value = true;
    const formData = new FormData();

    if (personalResult.value?.person?.id) {
      formData.set("personId", personalResult.value.person.id);
    }

    formData.set("name", profileForm.name.trim());
    formData.set("email", profileForm.email.trim());
    formData.set("phone", profileForm.phone.trim());
    formData.set("company", profileForm.company.trim());

    if (!personalResult.value?.person?.id && personalResult.value?.selfieDataUrl) {
      formData.set("selfie", dataUrlToFile(personalResult.value.selfieDataUrl, "profile-selfie.jpg"));
    }

    const response = await savePublicPersonProfile(props.slug, formData);

    const savedPerson = {
      ...(personalResult.value?.person || {}),
      ...(response.person || {}),
      name: response.person?.name || profileForm.name.trim(),
      email: response.person?.email || profileForm.email.trim(),
      phone: response.person?.phone || profileForm.phone.trim(),
      company: response.person?.company || profileForm.company.trim(),
    };

    personalResult.value = {
      ...personalResult.value,
      person: savedPerson,
      profileCompleted: true,
      status: `Profile saved for ${savedPerson.name}. Your matched photos are ready.`,
    };
    persistPersonalResult();
    hydrateProfileForm();
    editingProfile.value = false;
    status.value = `Profile saved for ${savedPerson.name}. Your matched photos are ready.`;
  } catch (error) {
    personalAccessGranted.value = false;
    personalResult.value = {
      ...personalResult.value,
      profileCompleted: false,
      status: error.message || "Unable to save the person profile.",
    };
    persistPersonalResult();
    editingProfile.value = true;
    status.value = error.message || "Unable to save the person profile.";
  } finally {
    savingProfile.value = false;
  }
}

async function unlockCommonGallery() {
  await fetchCommonPhotos(commonPinInput.value);
}

async function fetchCommonPhotos(pin, options = {}) {
  const normalizedPin = `${pin || ""}`.trim();

  if (normalizedPin.length !== 4) {
    commonPinMessageSeverity.value = "warn";
    commonPinMessage.value = "Enter the 4-digit gallery PIN.";
    status.value = "Enter the 4-digit gallery PIN.";
    return;
  }

  try {
    loadingCommonPhotos.value = true;
    commonPinMessage.value = "";
    const response = await getPublicGalleryPhotos(props.slug, normalizedPin);
    photos.value = response.photos;
    commonPinVerified.value = true;
    status.value = `${response.photos.length} image${response.photos.length === 1 ? "" : "s"} available in this gallery.`;

    if (!response.photos.length) {
      emptyMessage.value = "This gallery does not have any mapped photos yet.";
    }
  } catch (error) {
    commonPinVerified.value = false;
    photos.value = [];
    commonPinMessageSeverity.value = "error";
    commonPinMessage.value = error.message || "Invalid gallery PIN.";
    if (!options.silent) {
      status.value = error.message || "Invalid gallery PIN.";
    }
    emptyMessage.value = "Enter the correct 4-digit PIN to unlock this gallery.";
  } finally {
    loadingCommonPhotos.value = false;
  }
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

  activePhoto.value = displayPhotos.value[currentPhotoIndex.value - 1] || activePhoto.value;
}

function showNextPhoto() {
  if (!hasNextPhoto.value) {
    return;
  }

  activePhoto.value = displayPhotos.value[currentPhotoIndex.value + 1] || activePhoto.value;
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

function persistPersonalResult() {
  if (!personalResult.value) {
    return;
  }

  sessionStorage.setItem(matchStorageKey(props.slug), JSON.stringify(personalResult.value));
}

function driveDownloadUrl(photo) {
  return photo.driveFileId
    ? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(photo.driveFileId)}`
    : photo.driveLink;
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

function heroStyle(galleryRecord) {
  if (!galleryRecord?.headerImageUrl) {
    return {};
  }

  return {
    backgroundImage: `linear-gradient(135deg, rgba(255, 255, 255, 0.94), rgba(236, 247, 255, 0.88)), url("${galleryRecord.headerImageUrl}")`,
    backgroundPosition: "center",
    backgroundSize: "cover",
  };
}

function bannerStyle(galleryRecord) {
  if (!galleryRecord?.headerImageUrl) {
    return {};
  }

  return {
    backgroundImage: `url("${galleryRecord.headerImageUrl}")`,
    backgroundPosition: "center",
    backgroundSize: "cover",
  };
}

function matchStorageKey(slug) {
  return `${PERSONAL_MATCH_STORAGE_PREFIX}:${slug}`;
}

function dataUrlToFile(dataUrl, fileName) {
  const [metadata, content] = dataUrl.split(",");
  const mimeMatch = metadata.match(/data:(.*?);base64/);
  const mimeType = mimeMatch?.[1] || "image/jpeg";
  const binary = atob(content);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new File([bytes], fileName, { type: mimeType });
}
</script>
