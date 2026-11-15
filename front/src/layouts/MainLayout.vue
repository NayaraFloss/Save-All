<template>
  <q-layout view="hHh lpR fFf" :class="shellClass">
    <q-header v-if="!$route.meta.hideHeader" elevated class="bg-primary text-white no-print">
      <q-toolbar class="app-toolbar">
        <q-toolbar-title class="font-display text-weight-bold header-title">
          <span class="row items-center no-wrap">
            <span>Save All</span>
            <svg class="header-logo q-ml-xs" viewBox="0 0 64 64" fill="none" aria-label="Logo Save All" role="img">
              <path d="M12 28 H52 L46 54 H18 Z" fill="#A5D6A7" opacity="0.9" />
              <path d="M14 30 H50 L45 52 H19 Z" fill="#66BB6A" />
              <rect x="10" y="24" width="44" height="6" rx="3" fill="#E8F5E9" />
              <line x1="22" y1="30" x2="24" y2="52" stroke="#fff" stroke-width="1.5" opacity="0.4" />
              <line x1="32" y1="30" x2="32" y2="52" stroke="#fff" stroke-width="1.5" opacity="0.4" />
              <line x1="42" y1="30" x2="40" y2="52" stroke="#fff" stroke-width="1.5" opacity="0.4" />
              <polygon points="18,24 24,15 28,24" fill="#FFA726" />
              <circle cx="34" cy="20" r="6" fill="#EF5350" />
              <circle cx="44" cy="22" r="4" fill="#FFEE58" />
            </svg>
          </span>
        </q-toolbar-title>

        <!-- Centro: o painel do cliente injeta aqui a cidade -->
        <div id="header-slot-center" class="header-slot-center row justify-center" />

        <!-- Direita: o painel do cliente injeta aqui o nome do cliente (no lugar do chip) -->
        <div id="header-slot-user" class="row items-center no-wrap" />
        <q-chip
          v-if="currentUser && !isConsumerPanel"
          dense
          color="white"
          text-color="primary"
          :icon="isClient ? undefined : 'person'"
          class="role-chip"
        >
          <q-avatar v-if="isClient" size="22px">
            <img :src="currentUser.urlAvatar || IMAGES.avatarPadrao" alt="Avatar" />
          </q-avatar>
          <span class="ellipsis chip-name">{{ headerLabel }}</span>
        </q-chip>

        <q-btn flat round dense :icon="darkMode ? 'light_mode' : 'dark_mode'" @click="toggleDarkMode">
          <q-tooltip>{{ darkMode ? 'Modo claro' : 'Modo escuro' }}</q-tooltip>
        </q-btn>

        <!-- Configurações: o painel do cliente injeta aqui a engrenagem -->
        <div id="header-slot-actions" class="row items-center no-wrap" />

        <q-btn flat round dense :icon="notificationsEnabled ? 'notifications' : 'notifications_off'" @click="toggleNotifications">
          <q-tooltip>Notificações</q-tooltip>
        </q-btn>

        <q-btn v-if="currentUser" flat round dense icon="logout" @click="handleLogout">
          <q-tooltip>Sair</q-tooltip>
        </q-btn>
      </q-toolbar>
    </q-header>

    <q-page-container>
      <div class="app-shell">
        <router-view />
      </div>
    </q-page-container>

    <!-- Termos de uso obrigatórios (cliente / loja) -->
    <TermosAceite v-if="showTermsOverlay" :role="currentUser?.role" />
  </q-layout>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAppStore } from 'stores/estadoApp'
import TermosAceite from 'components/TermosAceite.vue'
import { IMAGES } from 'src/assets/images'

defineOptions({ name: 'MainLayout' })

const route = useRoute()
const appStore = useAppStore()
const { currentUser, darkMode, notificationsEnabled } = storeToRefs(appStore)
const { toggleDarkMode, toggleNotifications, logout } = appStore

// shell-wide: painéis administrativos / páginas públicas (até 1280px)
// shell-full: telas de entrada (boas-vindas, login, cadastro) em largura total
// shell-fluid: demais telas — celular, tablet e notebook (cresce com a tela)
const shellClass = computed(() => (route.meta?.wide ? 'shell-wide' : route.meta?.entry ? 'shell-full' : 'shell-fluid'))

const roleLabels = {
  client: 'Cliente',
  store: 'Estabelecimento',
  institution: 'Entidade Social',
  disposal: 'Descarte Sustentável',
  master: 'Admin Master',
  admin: 'Admin Master'
}
// Nestes painéis o próprio painel coloca nome e botões na barra verde (via Teleport)
const isConsumerPanel = computed(() => ['PainelConsumidor', 'PainelLoja'].includes(route.name))
const roleLabel = computed(() => roleLabels[currentUser.value?.role] || currentUser.value?.role || 'Visitante')
// Cliente logada: mostra o nome dela no lugar do texto "Cliente"
const isClient = computed(() => currentUser.value?.role === 'client')
const isStore = computed(() => currentUser.value?.role === 'store')
// Cliente e estabelecimento mostram o próprio nome no cabeçalho
const headerLabel = computed(() => ((isClient.value || isStore.value) && currentUser.value?.name) || roleLabel.value)

const showTermsOverlay = computed(() => {
  const user = currentUser.value
  if (!user) return false
  return (user.role === 'client' || user.role === 'store') && user.termosAceitos === false
})

function handleLogout () {
  logout()
}
</script>