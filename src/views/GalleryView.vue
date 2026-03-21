<template>
  <main class="app-shell gallery-theme space-y-6" :style="themeStyle(activeAccentColor)">
    <PageLoader v-if="showPageLoader" />

    <template v-if="hasInvalidPersonalJob">
      <Card class="surface-panel mx-auto w-full max-w-xl">
        <template #content>
          <div class="space-y-3 px-2 py-4 text-center sm:px-4 sm:py-5">
            <p class="eyebrow text-[11px] tracking-[0.18em]">Personal Gallery</p>
            <h1 class="text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">Unable to open this link</h1>
            <Message severity="error" :closable="false" class="text-sm">
              {{ invalidPersonalJobMessage }}
            </Message>
            <div class="flex justify-center">
              <RouterLink :to="`/g/${slug}`">
                <Button label="Back to Gallery" icon="pi pi-arrow-left" severity="secondary" outlined size="small" />
              </RouterLink>
            </div>
          </div>
        </template>
      </Card>
    </template>

    <template v-else-if="galleryUnavailableMessage">
      <Card class="surface-panel mx-auto w-full max-w-xl">
        <template #content>
          <div class="space-y-3 px-2 py-4 text-center sm:px-4 sm:py-5">
            <p class="eyebrow text-[11px] tracking-[0.18em]">Gallery</p>
            <h1 class="text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">Unable to open this gallery</h1>
            <Message severity="error" :closable="false" class="text-sm">
              {{ galleryUnavailableMessage }}
            </Message>
          </div>
        </template>
      </Card>
    </template>

    <template v-else>
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
                      <img
                        v-if="profilePhotoUrl"
                        :src="profilePhotoUrl"
                        :alt="profileForm.name || 'Profile photo'"
                        class="h-full w-full object-cover"
                        @error="handleProfilePhotoError"
                      />
                      <span v-else>{{ profileInitials }}</span>
                    </div>
                    <div class="space-y-1">
                      <p class="eyebrow">Personal Gallery</p>
                      <h2 class="section-title">{{ profileForm.name || "Add your profile" }}</h2>
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
                      <Button label="View All Photos" icon="pi pi-images" :style="filledButtonStyle(personalAccentColor)" />
                    </RouterLink>
                  </div>
                </div>

                <form v-if="profileFormVisible" class="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto]" @submit.prevent="saveProfile">
                  <InputText v-model.trim="profileForm.name" required placeholder="Full name" />
                  <InputText v-model.trim="profileForm.email" type="email" required placeholder="Email" />
                  <InputText v-model.trim="profileForm.phone" type="tel" placeholder="Phone" />
                  <InputText v-model.trim="profileForm.company" placeholder="Company / Team" />
                  <div class="flex gap-2 xl:justify-end">
                    <Button
                      v-if="profileCompleted"
                      label="Cancel"
                      type="button"
                      severity="secondary"
                      outlined
                      @click="closeProfileEditor"
                    />
                    <Button :label="savingProfile ? 'Saving...' : profileCompleted ? 'Save Changes' : 'Create Profile'" :loading="savingProfile" :style="filledButtonStyle(personalAccentColor)" type="submit" />
                  </div>
                </form>

                <div v-else-if="profileSummaryVisible" class="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  <div class="surface-muted personal-profile-card">
                    <p class="personal-profile-label">Name</p>
                    <p class="personal-profile-value">{{ personalResult?.person?.name || profileForm.name }}</p>
                  </div>
                  <div class="surface-muted personal-profile-card">
                    <p class="personal-profile-label">Email</p>
                    <p class="personal-profile-value">{{ personalResult?.person?.email || profileForm.email }}</p>
                  </div>
                  <div v-if="personalResult?.person?.phone || profileForm.phone" class="surface-muted personal-profile-card">
                    <p class="personal-profile-label">Phone</p>
                    <p class="personal-profile-value">{{ personalResult?.person?.phone || profileForm.phone }}</p>
                  </div>
                  <div v-if="personalResult?.person?.company || profileForm.company" class="surface-muted personal-profile-card">
                    <p class="personal-profile-label">Company</p>
                    <p class="personal-profile-value">{{ personalResult?.person?.company || profileForm.company }}</p>
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
                  <p class="eyebrow">Common Gallery</p>
                  <h1 class="page-title !text-4xl">{{ gallery?.title || "Gallery" }}</h1>
                </div>

                <div class="flex flex-wrap gap-3">
                  <RouterLink :to="`/g/${slug}`">
                    <Button label="Find your Photos" icon="pi pi-camera" :style="filledButtonStyle(commonAccentColor)" />
                  </RouterLink>
                </div>
              </div>

                <div v-if="canShowPhotos" class="grid gap-3 md:grid-cols-3">
                  <div class="surface-muted p-4">
                    <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Total Photos</p>
                    <p class="mt-2 text-2xl font-semibold text-slate-950">{{ totalPhotoCount }}</p>
                  </div>
                  <div class="surface-muted p-4">
                    <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Captured Years</p>
                    <p class="mt-2 text-2xl font-semibold text-slate-950">{{ gallerySummary.photoYears }}</p>
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
                <Tag :value="`${totalPhotoCount} image${totalPhotoCount === 1 ? '' : 's'}`" severity="contrast" rounded />
                <Tag
                  v-if="isPersonalResults && personalResult?.diagnostics?.bestScore != null"
                  :value="`Best score ${personalResult.diagnostics.bestScore}`"
                  severity="info"
                  rounded
                />
              </div>
            </div>

            <template v-if="canShowPhotos && displayPhotos.length">
              <div class="gallery-grid">
                <button
                  v-for="photo in displayPhotos"
                  :key="photo.id"
                  type="button"
                  class="relative"
                  @click="openPhoto(photo)"
                >
                  <span
                    v-if="SHOW_MATCH_SCORE_BADGE && isPersonalResults && photo.matchScore != null"
                    class="absolute right-2 top-2 z-10 rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-medium tracking-tight text-slate-700 shadow-sm"
                  >
                    {{ formatMatchScore(photo.matchScore) }}
                  </span>
                  <img :src="photo.storageImageUrl || photo.thumbnailUrl" :alt="photo.title" />
                </button>
              </div>

              <div v-if="showCommonPagination" class="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p class="text-sm text-slate-500">{{ commonPaginationSummary }}</p>
                <div class="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    label="Previous"
                    severity="secondary"
                    outlined
                    icon="pi pi-angle-left"
                    :disabled="loadingCommonPhotos || commonPagination.page <= 1"
                    @click="goToPublicPage(commonPagination.page - 1)"
                  />
                  <span class="text-sm font-medium text-slate-700">
                    Page {{ commonPagination.page }} of {{ commonPagination.totalPages }}
                  </span>
                  <Button
                    label="Next"
                    severity="secondary"
                    outlined
                    icon="pi pi-angle-right"
                    iconPos="right"
                    :disabled="loadingCommonPhotos || commonPagination.page >= commonPagination.totalPages"
                    @click="goToPublicPage(commonPagination.page + 1)"
                  />
                </div>
              </div>
            </template>

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
          </div>

          <Message v-if="commonPinMessage" :severity="commonPinMessageSeverity" :closable="false">
            {{ commonPinMessage }}
          </Message>

          <form class="grid gap-3" @submit.prevent="unlockCommonGallery">
            <InputText v-model.trim="commonPinInput" class="pin-input" type="text" inputmode="numeric" maxlength="4" placeholder="4-digit PIN" />
            <Button :label="loadingCommonPhotos ? 'Unlocking...' : 'Open Gallery'" :loading="loadingCommonPhotos" :style="filledButtonStyle(commonAccentColor)" type="submit" :disabled="commonPinInput.trim().length !== 4" />
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
    </template>
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Button from "primevue/button";
import Card from "primevue/card";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Tag from "primevue/tag";
import PageLoader from "../components/PageLoader.vue";
import { getPublicGallery, getPublicGalleryPhotos, getPublicPerson, savePublicPersonProfile } from "../lib/api.js";
import { waitForJobResult } from "../lib/jobs.js";

const PERSONAL_MATCH_STORAGE_PREFIX = "picdrop-personal-match";
const DEFAULT_PAGE_SIZE = 20;
const SHOW_MATCH_SCORE_BADGE = false;

const props = defineProps({
  slug: {
    type: String,
    required: true,
  },
});

const route = useRoute();
const router = useRouter();
const gallery = ref(null);
const photos = ref([]);
const commonPagination = ref(createPaginationState());
const gallerySummary = ref({
  photoYears: 0,
  latestDate: "",
});
const status = ref("Loading gallery...");
const emptyMessage = ref("No gallery images are available yet.");
const personalResult = ref(null);
const activePhoto = ref(null);
const savingProfile = ref(false);
const loadingCommonPhotos = ref(false);
const loadingGallery = ref(true);
const commonPinInput = ref("");
const commonPinVerified = ref(false);
const commonPinMessage = ref("");
const commonPinMessageSeverity = ref("error");
const editingProfile = ref(true);
const personalAccessGranted = ref(false);
const loadingPersonalJob = ref(false);
const failedProfilePhotoUrl = ref("");
const invalidPersonalJobMessage = ref("");
const galleryUnavailableMessage = ref("");
const DEFAULT_ACCENT_COLOR = "#0f5bd8";

const profileForm = reactive({
  name: "",
  email: "",
  phone: "",
  company: "",
});

const isPersonalResults = computed(() => route.query.source === "personal" && Boolean(personalResult.value));
const hasInvalidPersonalJob = computed(() => route.query.source === "personal" && Boolean(invalidPersonalJobMessage.value));
const profileCompleted = computed(() =>
  Boolean(personalResult.value?.profileCompleted || personalResult.value?.person?.email),
);
const personalAccentColor = computed(() => normalizeAccentColor(gallery.value?.personalAccentColor, DEFAULT_ACCENT_COLOR));
const commonAccentColor = computed(() => normalizeAccentColor(gallery.value?.commonAccentColor, DEFAULT_ACCENT_COLOR));
const activeAccentColor = computed(() => (isPersonalResults.value ? personalAccentColor.value : commonAccentColor.value));
const profileFormVisible = computed(() => isPersonalResults.value && (!personalAccessGranted.value || editingProfile.value));
const profileSummaryVisible = computed(() => isPersonalResults.value && personalAccessGranted.value && profileCompleted.value && !editingProfile.value);
const canShowPhotos = computed(() => (isPersonalResults.value ? personalAccessGranted.value && profileCompleted.value : commonPinVerified.value));
const showCommonPinModal = computed(() => !isPersonalResults.value && gallery.value && !commonPinVerified.value);
const displayPhotos = computed(() => (isPersonalResults.value ? personalResult.value?.match?.photos || [] : photos.value));
const isFullGalleryRoute = computed(() => normalizeRoutePath(route.path) === `/g/${props.slug}/all`);
const requestedPublicPage = computed(() => normalizePositiveInteger(route.query.page, 1));
const showPageLoader = computed(() => loadingGallery.value || loadingCommonPhotos.value || savingProfile.value);
const currentPhotoIndex = computed(() => displayPhotos.value.findIndex((photo) => photo.id === activePhoto.value?.id));
const hasPreviousPhoto = computed(() => currentPhotoIndex.value > 0);
const hasNextPhoto = computed(() => currentPhotoIndex.value >= 0 && currentPhotoIndex.value < displayPhotos.value.length - 1);
const currentPhotoPositionLabel = computed(() =>
  currentPhotoIndex.value >= 0 ? `Image ${currentPhotoIndex.value + 1} of ${displayPhotos.value.length}` : "",
);
const totalPhotoCount = computed(() => (isPersonalResults.value ? displayPhotos.value.length : commonPagination.value.totalItems));
const latestDate = computed(() => {
  if (isPersonalResults.value) {
    const datedPhotos = displayPhotos.value
      .map((photo) => photo.capturedAt || photo.createdAt || "")
      .filter(Boolean)
      .sort((left, right) => right.localeCompare(left));
    return datedPhotos[0] ? formatDate(datedPhotos[0]) : "No date";
  }

  return gallerySummary.value.latestDate ? formatDate(gallerySummary.value.latestDate) : "No date";
});
const showCommonPagination = computed(() =>
  !isPersonalResults.value && canShowPhotos.value && commonPagination.value.totalPages > 1,
);
const commonPaginationSummary = computed(() => {
  if (!commonPagination.value.totalItems) {
    return "No images available.";
  }

  const start = (commonPagination.value.page - 1) * commonPagination.value.pageSize + 1;
  const end = Math.min(start + displayPhotos.value.length - 1, commonPagination.value.totalItems);
  return `Showing ${start}-${end} of ${commonPagination.value.totalItems} images`;
});
const profilePhotoUrl = computed(() => {
  const referenceImageUrl = personalResult.value?.person?.referenceImageUrl || "";
  const selfieDataUrl = personalResult.value?.selfieDataUrl || "";
  const preferredUrl = personalResult.value?.pending && selfieDataUrl
    ? selfieDataUrl
    : referenceImageUrl || selfieDataUrl;

  if (!preferredUrl) {
    return "";
  }

  if (preferredUrl === failedProfilePhotoUrl.value) {
    return preferredUrl === selfieDataUrl ? "" : selfieDataUrl;
  }

  return preferredUrl;
});
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

watch(
  () => route.query.page,
  async (nextPage, previousPage) => {
    if (
      isPersonalResults.value ||
      !isFullGalleryRoute.value ||
      !commonPinVerified.value ||
      normalizePositiveInteger(nextPage, 1) === normalizePositiveInteger(previousPage, 1)
    ) {
      return;
    }

    closePhoto();
    await fetchCommonPhotos(commonPinInput.value, { silent: true });
  },
);

async function loadGallery() {
  try {
    restorePersonalMatch();

    const galleryResponse = await getPublicGallery(props.slug);
    gallery.value = galleryResponse.gallery;
    galleryUnavailableMessage.value = "";

    if (isPersonalResults.value) {
      const refreshedPerson = await refreshCurrentPerson(personalResult.value?.person || null);
      if (refreshedPerson) {
        personalResult.value = {
          ...personalResult.value,
          person: refreshedPerson,
        };
        persistPersonalResult();
      }

      await syncPendingMatchJob();
      if (hasInvalidPersonalJob.value) {
        return;
      }
      hydrateProfileForm();
      resetPersonalAccess();
      status.value = personalResult.value?.status || (profileCompleted.value
        ? "Your matched photos are ready."
        : "Enter your details and submit the form to open your matched photos.");
      emptyMessage.value = personalResult.value?.status || "No confident match was found for your selfie.";
      return;
    }

    commonPinVerified.value = false;
    commonPinMessage.value = "";
    photos.value = [];
    commonPagination.value = createPaginationState();
    gallerySummary.value = {
      photoYears: 0,
      latestDate: "",
    };
    status.value = "Enter the 4-digit PIN to unlock this gallery.";
    emptyMessage.value = "Enter the 4-digit PIN to unlock this gallery.";
  } catch (error) {
    status.value = error.message;
    emptyMessage.value = "This gallery is not available.";
    if (isUnavailableGalleryError(error)) {
      galleryUnavailableMessage.value = error.message;
    }
  } finally {
    loadingGallery.value = false;
  }
}

function restorePersonalMatch() {
  invalidPersonalJobMessage.value = "";

  if (route.query.source !== "personal") {
    personalResult.value = null;
    return;
  }

  try {
    const stored = sessionStorage.getItem(matchStorageKey(props.slug));
    personalResult.value = stored ? JSON.parse(stored) : null;
    if (!personalResult.value && route.query.job) {
      personalResult.value = {
        jobId: String(route.query.job),
        jobStatus: "queued",
        pending: true,
        match: null,
        diagnostics: null,
        person: null,
        selfieDataUrl: "",
        status: "Matching your selfie against the gallery photos...",
      };
    }
  } catch {
    personalResult.value = null;
  }
}

async function syncPendingMatchJob() {
  const jobId = String(route.query.job || personalResult.value?.jobId || "").trim();

  if (!jobId) {
    return;
  }

  loadingPersonalJob.value = true;

  try {
    const job = await waitForJobResult({
      jobId,
      scope: "public",
      onProgress(nextJob) {
        personalResult.value = {
          ...personalResult.value,
          jobId,
          jobStatus: nextJob.status,
          pending: true,
          status: "Matching your selfie against the gallery photos...",
        };
        persistPersonalResult();
      },
    });

    const matchResult = job.result || {};
    const refreshedPerson = await refreshCurrentPerson(matchResult.person || personalResult.value?.person || null);
    personalResult.value = {
      ...personalResult.value,
      ...matchResult,
      person: refreshedPerson || matchResult.person || personalResult.value?.person || null,
      jobId,
      jobStatus: job.status,
      pending: false,
      status: matchResult.match
        ? `${matchResult.match.photoCount} photo${matchResult.match.photoCount === 1 ? "" : "s"} matched your selfie.`
        : buildNoMatchMessage(matchResult),
    };
    persistPersonalResult();
  } catch (error) {
    if (isInvalidJobError(error)) {
      clearPersonalResult();
      invalidPersonalJobMessage.value = "The requested personal gallery link is invalid or no longer available. Please return to the gallery and scan again.";
      status.value = invalidPersonalJobMessage.value;
      emptyMessage.value = invalidPersonalJobMessage.value;
      return;
    }

    personalResult.value = {
      ...personalResult.value,
      jobId,
      jobStatus: "failed",
      pending: false,
      status: error.message || "Unable to process this selfie.",
    };
    persistPersonalResult();
  } finally {
    loadingPersonalJob.value = false;
  }
}

function hydrateProfileForm() {
  const person = personalResult.value?.person;
  profileForm.name = person?.name || "";
  profileForm.email = person?.email || "";
  profileForm.phone = person?.phone || "";
  profileForm.company = person?.company || "";
}

function handleProfilePhotoError(event) {
  failedProfilePhotoUrl.value = event.target?.currentSrc || profilePhotoUrl.value;
}

function formatMatchScore(score) {
  const numericScore = Number(score);
  return Number.isFinite(numericScore) ? numericScore.toFixed(3) : String(score);
}

function resetPersonalAccess() {
  editingProfile.value = !profileCompleted.value;
  personalAccessGranted.value = profileCompleted.value;
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

  if (!currentPersonalJobId()) {
    status.value = "Your personal access session expired. Please scan again.";
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
    formData.set("jobId", currentPersonalJobId());

    if (!personalResult.value?.person?.id && personalResult.value?.selfieDataUrl) {
      formData.set("selfie", dataUrlToFile(personalResult.value.selfieDataUrl, "profile-selfie.jpg"));
    }

    const response = await savePublicPersonProfile(props.slug, formData);
    const refreshedPerson = await refreshCurrentPerson(response.person || personalResult.value?.person || null);

    const savedPerson = {
      ...(personalResult.value?.person || {}),
      ...(refreshedPerson || response.person || {}),
      name: refreshedPerson?.name || response.person?.name || profileForm.name.trim(),
      email: refreshedPerson?.email || response.person?.email || profileForm.email.trim(),
      phone: refreshedPerson?.phone || response.person?.phone || profileForm.phone.trim(),
      company: refreshedPerson?.company || response.person?.company || profileForm.company.trim(),
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

async function refreshCurrentPerson(person) {
  const personId = `${person?.id || ""}`.trim();
  const jobId = currentPersonalJobId();

  if (!personId || !jobId) {
    return person || null;
  }

  try {
    const response = await getPublicPerson(props.slug, personId, { jobId });
    return response.person || person || null;
  } catch {
    return person || null;
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
    const response = await getPublicGalleryPhotos(props.slug, normalizedPin, {
      page: isFullGalleryRoute.value ? requestedPublicPage.value : 1,
      pageSize: DEFAULT_PAGE_SIZE,
    });
    photos.value = response.photos;
    commonPagination.value = response.pagination || createPaginationState();
    gallerySummary.value = response.summary || {
      photoYears: 0,
      latestDate: "",
    };
    commonPinInput.value = normalizedPin;
    commonPinVerified.value = true;
    status.value = `${commonPagination.value.totalItems} image${commonPagination.value.totalItems === 1 ? "" : "s"} available in this gallery.`;

    if (isFullGalleryRoute.value && commonPagination.value.page !== requestedPublicPage.value) {
      await syncPublicPage(commonPagination.value.page);
    }

    if (!commonPagination.value.totalItems) {
      emptyMessage.value = "This gallery does not have any mapped photos yet.";
    }
  } catch (error) {
    commonPinVerified.value = false;
    photos.value = [];
    commonPagination.value = createPaginationState();
    gallerySummary.value = {
      photoYears: 0,
      latestDate: "",
    };
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

async function goToPublicPage(page) {
  const normalizedPage = normalizePositiveInteger(page, 1);
  if (normalizedPage === requestedPublicPage.value) {
    return;
  }

  await syncPublicPage(normalizedPage);
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

  failedProfilePhotoUrl.value = "";
  sessionStorage.setItem(matchStorageKey(props.slug), JSON.stringify(personalResult.value));
}

function clearPersonalResult() {
  personalResult.value = null;
  failedProfilePhotoUrl.value = "";
  sessionStorage.removeItem(matchStorageKey(props.slug));
}

function currentPersonalJobId() {
  return `${route.query.job || personalResult.value?.jobId || ""}`.trim();
}

function driveDownloadUrl(photo) {
  return photo.driveFileId
    ? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(photo.driveFileId)}`
    : photo.driveLink;
}

function buildNoMatchMessage(response) {
  const parts = [];

  if (response.diagnostics?.photoCount === 0) {
    parts.push("No event photos are available in this gallery yet.");
  } else if (response.diagnostics?.indexedPhotoCount === 0) {
    parts.push("Photos exist, but none of them have been indexed for matching yet.");
  } else {
    parts.push("No confident photo match was found for this selfie.");
  }

  if ((response.diagnostics?.indexedPhotoCount || 0) > 0) {
    parts.push("Make sure you are using a clear front-facing selfie.");
  }

  return parts.join(" ");
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

async function syncPublicPage(page) {
  await router.replace({
    query: {
      ...route.query,
      page: String(normalizePositiveInteger(page, 1)),
    },
  });
}

function heroStyle(galleryRecord) {
  return {
    backgroundImage: "linear-gradient(135deg, rgba(255, 255, 255, 0.94), rgba(236, 247, 255, 0.88))",
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

function normalizeAccentColor(value, fallback) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : fallback;
}

function hexToRgbTuple(color) {
  const normalized = normalizeAccentColor(color, DEFAULT_ACCENT_COLOR);
  return [1, 3, 5].map((index) => Number.parseInt(normalized.slice(index, index + 2), 16)).join(", ");
}

function themeStyle(color) {
  return {
    "--gallery-accent": normalizeAccentColor(color, DEFAULT_ACCENT_COLOR),
    "--gallery-accent-rgb": hexToRgbTuple(color),
  };
}

function filledButtonStyle(color) {
  const normalized = normalizeAccentColor(color, DEFAULT_ACCENT_COLOR);
  return {
    backgroundColor: normalized,
    borderColor: normalized,
    color: "#ffffff",
  };
}

function outlineButtonStyle(color) {
  const normalized = normalizeAccentColor(color, DEFAULT_ACCENT_COLOR);
  return {
    borderColor: normalized,
    color: normalized,
    backgroundColor: "transparent",
  };
}

function createPaginationState() {
  return {
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    totalItems: 0,
    totalPages: 0,
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

function isInvalidJobError(error) {
  const message = `${error?.message || ""}`.trim().toLowerCase();
  return message === "job not found" || message === "invalid job id" || message === "invalid job id.";
}

function normalizePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeRoutePath(path) {
  const normalized = String(path || "").replace(/\/+$/, "");
  return normalized || "/";
}

function isUnavailableGalleryError(error) {
  return `${error?.message || ""}`.trim().toLowerCase() === "gallery not found or public access is disabled";
}

</script>
