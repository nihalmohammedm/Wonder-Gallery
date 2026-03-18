<template>
  <main class="shell gallery-shell">
    <template v-if="isPersonalResults">
      <section class="personal-stage">
        <section class="personal-banner" :class="{ 'is-fallback': !gallery?.headerImageUrl }" :style="bannerStyle(gallery)">
          <div v-if="!gallery?.headerImageUrl" class="personal-banner-fallback">
            <h1>{{ gallery?.title || "Event Name" }}</h1>
          </div>
        </section>

        <section class="panel person-profile-card">
          <div class="person-profile-top">
            <div class="person-profile-identity">
              <div class="person-profile-avatar">
                <img v-if="profilePhotoUrl" :src="profilePhotoUrl" :alt="profileForm.name || 'Profile photo'" />
                <span v-else>{{ profileInitials }}</span>
              </div>
              <div>
                <h2>{{ profileForm.name || "Add Name" }}</h2>
                <p class="helper-copy">This profile photo is the scanned reference image so admins can review who scanned into the gallery.</p>
              </div>
            </div>
            <div class="gallery-actions">
              <RouterLink class="button button-secondary" :to="`/g/${slug}`">Scan Again</RouterLink>
              <RouterLink class="button button-primary" :to="`/g/${slug}/all`">View All Photos</RouterLink>
            </div>
          </div>

          <form class="person-profile-form" @submit.prevent="saveProfile">
            <input v-model.trim="profileForm.name" type="text" required placeholder="Full name" />
            <input v-model.trim="profileForm.email" type="email" placeholder="Email" />
            <input v-model.trim="profileForm.phone" type="tel" placeholder="Phone" />
            <input v-model.trim="profileForm.company" type="text" placeholder="Company / Team" />
            <button class="button button-primary" type="submit" :disabled="savingProfile || !gallery">
              {{ savingProfile ? "Updating..." : personalResult?.person?.id ? "Update" : "Create Profile" }}
            </button>
          </form>
        </section>
      </section>
    </template>

    <template v-else>
      <section class="gallery-hero" :style="heroStyle(gallery)">
        <div class="gallery-hero-top">
          <div class="gallery-hero-copy">
            <p class="gallery-kicker">Common Link</p>
            <h1>{{ gallery?.title || "Gallery" }}</h1>
            <p class="gallery-caption">
              A clean gallery wall for the full event archive. Open the personal link if you want the selfie-based matching flow instead.
            </p>
          </div>
          <div class="gallery-actions">
            <RouterLink class="button button-secondary" to="/">Overview</RouterLink>
            <RouterLink class="button button-primary" :to="`/g/${slug}`">Personal Link</RouterLink>
          </div>
        </div>

        <div class="gallery-stat-grid">
          <article class="gallery-stat">
            <strong>{{ displayPhotos.length }}</strong>
            <span>Total Photos</span>
          </article>
          <article class="gallery-stat">
            <strong>{{ photoYears }}</strong>
            <span>Captured Year{{ photoYears === 1 ? "" : "s" }}</span>
          </article>
          <article class="gallery-stat">
            <strong>{{ latestDate }}</strong>
            <span>Latest Capture</span>
          </article>
        </div>
      </section>
    </template>

    <section class="gallery-strip">
      <div class="status-card">{{ status }}</div>
    </section>

    <section class="panel gallery-grid-panel">
      <div class="gallery-panel-title">
        <div>
          <p class="gallery-kicker">{{ isPersonalResults ? "Matched Gallery" : "Photo Wall" }}</p>
          <h2>{{ isPersonalResults ? "Your Photos" : "All Images" }}</h2>
        </div>
        <div class="summary-metrics">
          <span class="metric">{{ displayPhotos.length }} image{{ displayPhotos.length === 1 ? "" : "s" }}</span>
          <span v-if="isPersonalResults && personalResult?.diagnostics?.bestScore != null" class="metric">
            Best score {{ personalResult.diagnostics.bestScore }}
          </span>
        </div>
      </div>

      <div v-if="displayPhotos.length" class="gallery-results-grid">
        <button
          v-for="photo in displayPhotos"
          :key="photo.id"
          class="gallery-result-card"
          type="button"
          @click="openPhoto(photo)"
        >
          <img :src="photo.storageImageUrl || photo.thumbnailUrl" :alt="photo.title" />
        </button>
      </div>
      <div v-else class="empty-state gallery-results-empty">{{ emptyMessage }}</div>
    </section>

    <Teleport to="body">
      <div v-if="activePhoto" class="lightbox" @click.self="closePhoto">
        <article class="lightbox-panel">
          <button class="lightbox-close" type="button" @click="closePhoto" aria-label="Close image preview">Close</button>
          <div class="lightbox-stage">
            <img :src="activePhoto.storageImageUrl || activePhoto.thumbnailUrl" :alt="activePhoto.title" />
          </div>
          <div class="lightbox-details">
            <div>
              <p class="eyebrow">Photo Preview</p>
              <h2>{{ activePhoto.title }}</h2>
            </div>
            <p class="helper-copy">{{ formatDate(activePhoto.capturedAt) }}</p>
            <p v-if="activePhoto.matchScore != null" class="helper-copy">
              Match score: {{ activePhoto.matchScore }} ({{ activePhoto.matchConfidence }} confidence)
            </p>
            <div class="button-row">
              <button class="button button-secondary" type="button" @click="closePhoto">Cancel</button>
              <a
                class="button button-primary"
                :href="driveDownloadUrl(activePhoto)"
                target="_blank"
                rel="noreferrer"
                download
              >
                Download Full Image
              </a>
            </div>
          </div>
        </article>
      </div>
    </Teleport>
  </main>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute } from "vue-router";
import { getPublicGalleryPhotos, savePublicPersonProfile } from "../lib/api.js";

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

const profileForm = reactive({
  name: "",
  email: "",
  phone: "",
  company: "",
});

const isPersonalResults = computed(() => route.query.source === "personal" && Boolean(personalResult.value));
const displayPhotos = computed(() => (isPersonalResults.value ? personalResult.value?.match?.photos || [] : photos.value));
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

onMounted(loadGallery);

async function loadGallery() {
  try {
    restorePersonalMatch();

    const response = await getPublicGalleryPhotos(props.slug);
    gallery.value = response.gallery;
    photos.value = response.photos;

    if (isPersonalResults.value) {
      hydrateProfileForm();
      status.value = personalResult.value?.status || "Your matched photos are ready.";
      emptyMessage.value = personalResult.value?.status || "No confident match was found for your selfie.";
      return;
    }

    status.value = `${response.photos.length} image${response.photos.length === 1 ? "" : "s"} available in this gallery.`;

    if (!response.photos.length) {
      emptyMessage.value = "This gallery does not have any mapped photos yet.";
    }
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

async function saveProfile() {
  if (!gallery.value || !profileForm.name.trim()) {
    status.value = "Name is required.";
    return;
  }

  try {
    savingProfile.value = true;
    status.value = "Saving person profile...";
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
    personalResult.value = {
      ...personalResult.value,
      person: response.person,
      status: `Profile saved for ${response.person.name}.`,
    };
    sessionStorage.setItem(matchStorageKey(props.slug), JSON.stringify(personalResult.value));
    hydrateProfileForm();
    status.value = `Profile saved for ${response.person.name}. Admin can now see this scanned person in the gallery dashboard.`;
  } catch (error) {
    status.value = error.message || "Unable to save the person profile.";
  } finally {
    savingProfile.value = false;
  }
}

function openPhoto(photo) {
  activePhoto.value = photo;
}

function closePhoto() {
  activePhoto.value = null;
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
    backgroundImage: `linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(236, 247, 255, 0.82)), url("${galleryRecord.headerImageUrl}")`,
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
