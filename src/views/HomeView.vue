<template>
  <main class="shell landing-shell">
    <section class="hero-card">
      <p class="eyebrow">Vue + API Architecture</p>
      <h1>PicDrop</h1>
      <p class="hero-copy">
        Admins register a gallery, connect a Google Drive folder, and sync event photos into the app.
        Guests open a public link, take a selfie, and the server compares that selfie against face encodings extracted from the event photos.
        A separate common link can show all photos in the gallery.
      </p>
      <div class="hero-actions">
        <RouterLink class="button button-primary" to="/admin">Open Admin Panel</RouterLink>
        <RouterLink class="button button-secondary" :to="demoGuestPath">Open Demo Public Link</RouterLink>
        <RouterLink class="button button-secondary" :to="demoCommonPath">Open Demo Common Link</RouterLink>
      </div>
    </section>

    <section class="info-grid">
      <article class="info-card">
        <h2>Frontend</h2>
        <p>Vue handles the admin workflow, public gallery page, camera capture, and state refresh after API calls.</p>
      </article>
      <article class="info-card">
        <h2>Backend</h2>
        <p>Express stores gallery data, syncs Drive images, calls a face-recognition API for encodings, and performs vector matching on the server.</p>
      </article>
      <article class="info-card">
        <h2>Production Path</h2>
        <p>Swap the demo face matcher with a real recognition provider and replace file storage with Postgres plus Drive sync jobs.</p>
      </article>
    </section>
  </main>
</template>

<script setup>
const demoGuestPath = "/g/demo-gallery";
const demoCommonPath = "/g/demo-gallery/all";
</script>
