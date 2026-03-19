<template>
  <GuestView :slug="slug" />
</template>

<script setup>
import GuestView from "~/src/views/GuestView.vue";

const route = useRoute();
const slug = computed(() => String(route.params.slug || ""));
</script>
