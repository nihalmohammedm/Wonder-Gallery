<template>
  <main class="app-shell space-y-6">
    <section class="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
      <div class="space-y-6">
        <section
          class="hero-banner"
          :style="bannerStyle(gallery)"
        >
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
              <div class="space-y-3">
                <p class="eyebrow">Personal Link</p>
                <h2 class="section-title">Scan your face to find your photos</h2>
                <p class="helper-copy">
                  Capture a clear selfie to search the event gallery. If your profile already exists, PicDrop reuses it.
                  If not, you will be asked to complete the profile before the gallery opens.
                </p>
                <p class="helper-copy">
                  By continuing, you consent to using your selfie and facial biometric data solely for identification and event photo delivery.
                </p>
              </div>

              <div class="flex flex-wrap gap-3">
                <Button :label="authBusy ? 'Preparing Camera' : 'Scan My Face'" icon="pi pi-camera" :loading="authBusy" @click="openScanModal" />
                <RouterLink :to="`/g/${slug}/all`">
                  <Button label="Open Common Gallery" severity="secondary" outlined icon="pi pi-images" />
                </RouterLink>
              </div>

              <div class="status-copy">{{ status }}</div>
            </div>
          </template>
        </Card>
      </div>

      <Card class="surface-panel">
        <template #content>
          <div class="space-y-5">
            <div class="space-y-2">
              <p class="eyebrow">How It Works</p>
              <h2 class="section-title">One personal route</h2>
            </div>

            <div class="space-y-3">
              <div class="surface-muted p-4">
                <p class="text-sm font-semibold text-slate-900">1. Live camera capture</p>
                <p class="helper-copy">The scan runs from your device camera with no manual upload step.</p>
              </div>
              <div class="surface-muted p-4">
                <p class="text-sm font-semibold text-slate-900">2. Person lookup first</p>
                <p class="helper-copy">Existing registered people are reused before creating a new profile draft.</p>
              </div>
              <div class="surface-muted p-4">
                <p class="text-sm font-semibold text-slate-900">3. Private results gallery</p>
                <p class="helper-copy">After profile completion, the matched images open as a downloadable gallery wall.</p>
              </div>
            </div>
          </div>
        </template>
      </Card>
    </section>

    <Dialog
      v-model:visible="scanModalOpen"
      modal
      dismissableMask
      header="Live Capture"
      :style="{ width: 'min(92vw, 34rem)' }"
      @hide="closeScanModal"
    >
      <div class="space-y-4">
        <div class="space-y-2">
          <p class="eyebrow">Camera</p>
          <h2 class="section-title !text-2xl">Smile, you are on camera</h2>
          <p class="helper-copy">Center your face, keep the frame steady, then capture.</p>
        </div>

        <Message v-if="scanModalMessage" :severity="scanModalMessageSeverity" :closable="false">
          {{ scanModalMessage }}
        </Message>

        <div class="surface-muted overflow-hidden p-2">
          <video v-show="cameraMode === 'live'" ref="videoRef" autoplay playsinline muted class="camera-preview"></video>
          <img v-if="previewUrl" :src="previewUrl" alt="Captured selfie preview" class="camera-preview" />
          <div v-if="cameraMode !== 'live' && !previewUrl" class="grid min-h-80 place-items-center rounded-[10px] bg-slate-100 text-sm text-slate-500">
            Camera preview will appear here.
          </div>
        </div>

        <div v-if="submitting" class="flex items-center gap-3 rounded-[10px] border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <ProgressSpinner strokeWidth="6" style="width: 1.5rem; height: 1.5rem" />
          <span>Matching your selfie against the gallery photos...</span>
        </div>
      </div>

      <template #footer>
        <div class="flex w-full justify-end gap-3">
          <Button label="Cancel" severity="secondary" outlined :disabled="submitting" @click="closeScanModal" />
          <Button label="Capture Selfie" icon="pi pi-camera" :disabled="cameraMode !== 'live' || submitting" @click="captureSelfie" />
        </div>
      </template>
    </Dialog>
  </main>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import Button from "primevue/button";
import Card from "primevue/card";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import ProgressSpinner from "primevue/progressspinner";
import { getPublicGallery, matchSelfie } from "../lib/api.js";

const PERSONAL_MATCH_STORAGE_PREFIX = "picdrop-personal-match";

const props = defineProps({
  slug: {
    type: String,
    required: true,
  },
});

const router = useRouter();
const gallery = ref(null);
const previewUrl = ref("");
const selfieDataUrl = ref("");
const status = ref("Loading gallery...");
const videoRef = ref(null);
const cameraMode = ref("idle");
const scanModalOpen = ref(false);
const authBusy = ref(false);
const submitting = ref(false);
const scanModalMessage = ref("");
const scanModalMessageSeverity = ref("error");
let mediaStream;

onMounted(loadGallery);
onBeforeUnmount(() => {
  stopCamera();
  revokePreviewUrl();
});

async function loadGallery() {
  try {
    const response = await getPublicGallery(props.slug);
    gallery.value = response.gallery;
    status.value = "Ready to scan. Capture a selfie to continue into your matched gallery.";
  } catch (error) {
    status.value = error.message;
  }
}

async function openScanModal() {
  if (!gallery.value) {
    return;
  }

  scanModalOpen.value = true;
  scanModalMessage.value = "";
  revokePreviewUrl();
  previewUrl.value = "";
  selfieDataUrl.value = "";
  cameraMode.value = "idle";
  await startCamera();
}

function closeScanModal() {
  if (submitting.value) {
    return;
  }

  scanModalOpen.value = false;
  scanModalMessage.value = "";
  stopCamera();
  revokePreviewUrl();
  previewUrl.value = "";
  selfieDataUrl.value = "";
  cameraMode.value = "idle";
}

async function startCamera() {
  try {
    authBusy.value = true;
    stopCamera();
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
      },
      audio: false,
    });
    videoRef.value.srcObject = mediaStream;
    cameraMode.value = "live";
    scanModalMessage.value = "";
    status.value = "Camera ready. Capture a selfie to continue.";
  } catch {
    cameraMode.value = "idle";
    scanModalMessageSeverity.value = "error";
    scanModalMessage.value = "Unable to access the camera. Please allow camera access and try again.";
    status.value = "Unable to access the camera. Please allow camera access and try again.";
  } finally {
    authBusy.value = false;
  }
}

async function captureSelfie() {
  if (!videoRef.value || !gallery.value) {
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.width = videoRef.value.videoWidth || 720;
  canvas.height = videoRef.value.videoHeight || 960;
  const context = canvas.getContext("2d");
  context.drawImage(videoRef.value, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));

  if (!blob) {
    scanModalMessageSeverity.value = "error";
    scanModalMessage.value = "Unable to capture a selfie.";
    status.value = "Unable to capture a selfie.";
    return;
  }

  stopCamera();
  cameraMode.value = "idle";
  selfieDataUrl.value = await blobToDataUrl(blob);
  scanModalOpen.value = false;
  revokePreviewUrl();
  previewUrl.value = "";

  const formData = new FormData();
  formData.set("selfie", new File([blob], "selfie.jpg", { type: "image/jpeg" }));
  await submitMatch(formData);
}

async function submitMatch(formData) {
  try {
    submitting.value = true;
    status.value = "Matching your selfie against the gallery photos...";
    const response = await matchSelfie(props.slug, formData);
    persistMatchPayload(response);

    if (!response.match) {
      status.value = buildNoMatchMessage(response);
    } else {
      status.value = `${response.match.photoCount} photo${response.match.photoCount === 1 ? "" : "s"} matched your selfie. Opening your gallery...`;
    }
    await router.push({
      name: "gallery",
      params: {
        slug: props.slug,
      },
      query: {
        source: "personal",
      },
    });
  } catch (error) {
    status.value = error.message || "Unable to process this selfie.";
  } finally {
    submitting.value = false;
  }
}

function persistMatchPayload(response) {
  const existing = readStoredMatch();
  const payload = {
    gallery: gallery.value,
    match: response.match,
    diagnostics: response.diagnostics || null,
    person: response.person || existing?.person || null,
    selfieDataUrl: selfieDataUrl.value || existing?.selfieDataUrl || "",
    status: response.match
      ? `${response.match.photoCount} photo${response.match.photoCount === 1 ? "" : "s"} matched your selfie.`
      : buildNoMatchMessage(response),
    savedAt: new Date().toISOString(),
  };

  sessionStorage.setItem(matchStorageKey(props.slug), JSON.stringify(payload));
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

  if (response.diagnostics?.bestScore != null) {
    parts.push(`Best score ${response.diagnostics.bestScore} did not pass ${response.diagnostics.threshold}.`);
  }

  if ((response.diagnostics?.indexedPhotoCount || 0) > 0) {
    parts.push("Use a clear front-facing selfie, and make sure the event photos have been synced recently.");
  }

  return parts.join(" ");
}

function stopCamera() {
  if (!mediaStream) {
    return;
  }

  mediaStream.getTracks().forEach((track) => track.stop());
  mediaStream = undefined;
}

function revokePreviewUrl() {
  if (!previewUrl.value) {
    return;
  }

  URL.revokeObjectURL(previewUrl.value);
}

function bannerStyle(galleryRecord) {
  if (!galleryRecord?.headerImageUrl) {
    return {};
  }

  return {
    backgroundImage: `linear-gradient(180deg, rgba(9, 29, 57, 0.12), rgba(9, 29, 57, 0.12)), url("${galleryRecord.headerImageUrl}")`,
    backgroundPosition: "center",
    backgroundSize: "cover",
  };
}

function matchStorageKey(slug) {
  return `${PERSONAL_MATCH_STORAGE_PREFIX}:${slug}`;
}

function readStoredMatch() {
  try {
    const stored = sessionStorage.getItem(matchStorageKey(props.slug));
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Unable to read the captured selfie."));
    reader.readAsDataURL(blob);
  });
}
</script>
