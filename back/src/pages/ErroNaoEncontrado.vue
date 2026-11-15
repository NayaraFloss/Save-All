<template>
  <div class="fullscreen text-center q-pa-md flex flex-center column">
    <div class="text-h1 text-primary font-display">404</div>
    <div class="text-h5 q-mb-md">Página não encontrada</div>
    <q-btn color="primary" icon="home" label="Voltar ao início" no-caps :to="{ name: 'BemVindo' }" />
  </div>
</template>

<script setup>
defineOptions({ name: 'ErroNaoEncontrado' })
</script>
