<script setup>
defineProps({
  icon: { type: String, required: true },
  iconColor: { type: String, default: "grey-7" },
  title: { type: String, required: true }
});
</script>

<template>
  <q-card flat bordered class="info-box">
    <q-card-section class="q-pa-sm q-gutter-y-xs">
      <div class="row items-center no-wrap q-gutter-x-xs text-grey-7 m-label">
        <q-icon :name="icon" :color="iconColor" size="16px" />
        <span>{{ title }}</span>
        <q-space />
        <slot name="title-side" />
      </div>
      <slot />
    </q-card-section>
  </q-card>
</template>

<style scoped lang="scss">
@use './master-shared.scss';

.info-box {
  height: 100%;
}
</style>
