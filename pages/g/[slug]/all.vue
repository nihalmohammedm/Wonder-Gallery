<template>
  <GalleryView :slug="slug" />
</template>

<script setup>
import GalleryView from "~/src/views/GalleryView.vue";

const route = useRoute();
const slug = computed(() => String(route.params.slug || ""));
</script>
