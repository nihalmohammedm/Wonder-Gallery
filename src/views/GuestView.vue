<template>
  <main class="shell personal-shell">
    <section class="personal-stage">
      <section class="personal-banner" :class="{ 'is-fallback': !gallery?.headerImageUrl }" :style="bannerStyle(gallery)">
        <div v-if="!gallery?.headerImageUrl" class="personal-banner-fallback">
          <h1>{{ gallery?.title || "Event Name" }}</h1>
        </div>
      </section>

      <section class="panel personal-card">
        <div class="personal-card-copy">
          <div>
            <p class="eyebrow">Face Scan</p>
            <h2>Scan your face to find your photos</h2>
          </div>
          <p class="helper-copy">
            By clicking "Scan My Face" you consent to the collection and use of your selfie and facial biometric data for the purpose of identifying and delivering your event photos. Your data may be processed by third-party AI service providers solely for this purpose.
          </p>
          <p class="helper-copy">I have read and accept the Terms of Service and Privacy Policy.</p>
          <div class="button-row">
            <button class="button button-primary" type="button" :disabled="authBusy || !gallery" @click="openScanModal">
              {{ authBusy ? "Preparing..." : "Scan My Face" }}
            </button>
            <RouterLink class="button button-secondary" :to="`/g/${slug}/all`">Open Common Gallery</RouterLink>
          </div>
        </div>
      </section>
    </section>

    <section class="gallery-strip">
      <div class="status-card">{{ status }}</div>
    </section>

    <Teleport to="body">
      <div v-if="scanModalOpen" class="scan-modal-backdrop" @click.self="closeScanModal">
        <article class="scan-modal">
          <div class="scan-modal-copy">
            <p class="eyebrow">Live Capture</p>
            <h2>Smile you are on camera</h2>
            <p class="helper-copy">Center your face and capture a clear selfie.</p>
          </div>

          <div class="scan-camera-frame">
            <video v-show="cameraMode === 'live'" ref="videoRef" autoplay playsinline muted class="camera-preview"></video>
            <img v-if="previewUrl" :src="previewUrl" alt="Captured selfie preview" class="camera-preview" />
            <div v-if="cameraMode !== 'live' && !previewUrl" class="camera-placeholder scan-placeholder">
              Camera preview will appear here.
            </div>
          </div>

          <div class="scan-modal-actions">
            <button class="button button-secondary" type="button" :disabled="submitting" @click="closeScanModal">Cancel</button>
            <button class="button button-primary" type="button" :disabled="cameraMode !== 'live' || submitting" @click="captureSelfie">
              {{ submitting ? "Matching..." : "Capture Selfie" }}
            </button>
          </div>
        </article>
      </div>
    </Teleport>
  </main>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
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
    status.value = "Camera ready. Capture a selfie to continue.";
  } catch {
    cameraMode.value = "idle";
    status.value = "Unable to access the camera. Upload a selfie instead.";
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
    status.value = "Unable to capture a selfie.";
    return;
  }

  stopCamera();
  cameraMode.value = "idle";
  updatePreview(blob);
  selfieDataUrl.value = await blobToDataUrl(blob);

  const formData = new FormData();
  formData.set("selfie", new File([blob], "selfie.jpg", { type: "image/jpeg" }));
  const existingProfile = readStoredMatch();

  if (existingProfile?.person?.id) {
    formData.set("personId", existingProfile.person.id);
  }

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
    submitting.value = false;
    closeScanModal();
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

function updatePreview(fileOrBlob) {
  revokePreviewUrl();
  previewUrl.value = URL.createObjectURL(fileOrBlob);
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
