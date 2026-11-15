<template>
  <q-layout view="hHh lpR fFf" :class="shellClass">
    <q-header v-if="!$route.meta.hideHeader" elevated class="bg-primary text-white no-print">
      <q-toolbar class="app-toolbar">
        <q-btn
          v-if="mostrarBotaoInicio"
          id="btn-header-inicio"
          flat
          round
          dense
          icon="home"
          class="q-mr-xs"
          aria-label="Início"
          @click="irParaInicio"
        >
          <q-tooltip>Início</q-tooltip>
        </q-btn>
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
          v-if="usuarioAtual && !isConsumerPanel"
          dense
          color="white"
          text-color="primary"
          :icon="isClient ? undefined : 'person'"
          :clickable="isClient"
          class="role-chip"
          @click="abrirPerfil"
        >
          <q-avatar v-if="isClient" size="22px">
            <img :src="usuarioAtual.urlAvatar || IMAGES.avatarPadrao" alt="Avatar" />
          </q-avatar>
          <span class="ellipsis chip-name">{{ headerLabel }}</span>
        </q-chip>

        <q-btn flat round dense :icon="modoEscuro ? 'light_mode' : 'dark_mode'" @click="alternarModoEscuro">
          <q-tooltip>{{ modoEscuro ? 'Modo claro' : 'Modo escuro' }}</q-tooltip>
        </q-btn>

        <!-- Configurações: o painel do cliente injeta aqui a engrenagem -->
        <div id="header-slot-actions" class="row items-center no-wrap" />

        <!-- Central de mensagens (promoções, vencimentos e ofertas de doação) -->
        <CentralMensagens v-if="usuarioAtual" />

        <q-btn v-if="usuarioAtual" flat round dense icon="logout" @click="handleLogout">
          <q-tooltip>Sair</q-tooltip>
        </q-btn>
      </q-toolbar>
    </q-header>

    <q-page-container>
      <div ref="areaConteudo" class="app-shell" :style="mostrarMenuCliente ? { paddingBottom: 'calc(76px + env(safe-area-inset-bottom, 0px))' } : null">
        <router-view />
      </div>
    </q-page-container>

    <!-- Menu fixo do cliente: aparece em todas as telas dele -->
    <MenuCliente v-if="mostrarMenuCliente" />

    <!-- Avaliação do pedido: abre em qualquer tela assim que o pedido muda para "entregue" -->
    <AvaliacaoPedidoModal
      v-if="isClient"
      :show="!!pedidoParaAvaliar && !showTermsOverlay && !route.meta?.entry"
      :order="pedidoParaAvaliar"
      @close="dispensarAvaliacaoAtual"
      @submitted="loadOrders"
    />

    <!-- Termos de uso obrigatórios (cliente / loja) -->
    <TermosAceite v-if="showTermsOverlay" :role="usuarioAtual?.role" />
  </q-layout>
</template>

<script setup>
import { computed, ref, watch, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAppStore } from 'stores/estadoApp'
import TermosAceite from 'components/TermosAceite.vue'
import CentralMensagens from 'components/CentralMensagens.vue'
import MenuCliente from 'components/MenuCliente.vue'
import AvaliacaoPedidoModal from 'components/AvaliacaoPedidoModal.vue'
import { IMAGES } from 'src/assets/images'

defineOptions({ name: 'LayoutPrincipal' })

// Ao trocar de tela, a área de conteúdo volta ao topo (a janela não rola mais)
const areaConteudo = ref(null)

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const { usuarioAtual, modoEscuro } = storeToRefs(appStore)
const { alternarModoEscuro, logout, pedirInicio, dispensarAvaliacaoAtual, loadOrders } = appStore
const { pedidoParaAvaliar } = storeToRefs(appStore)

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
const roleLabel = computed(() => roleLabels[usuarioAtual.value?.role] || usuarioAtual.value?.role || 'Visitante')
// Cliente logada: mostra o nome dela no lugar do texto "Cliente"
const isClient = computed(() => usuarioAtual.value?.role === 'client')
const isStore = computed(() => usuarioAtual.value?.role === 'store')
// Cliente e estabelecimento mostram o próprio nome no cabeçalho
const headerLabel = computed(() => ((isClient.value || isStore.value) && usuarioAtual.value?.name) || roleLabel.value)

// Início de cada perfil. O cliente tem o botão no menu de baixo; os demais, no cabeçalho.
const ROTA_INICIO = {
  client: 'PainelConsumidor',
  store: 'PainelLoja',
  institution: 'PainelEntidade',
  disposal: 'PainelDescarte',
  driver: 'PainelEntregador',
  master: 'PainelMaster',
  admin: 'PainelMaster'
}
const rotaInicio = computed(() => ROTA_INICIO[usuarioAtual.value?.role] || null)
const mostrarBotaoInicio = computed(() => !!usuarioAtual.value && !!rotaInicio.value && !isClient.value)
function irParaInicio () {
  if (!rotaInicio.value) return
  if (route.name === rotaInicio.value) {
    // Já está no painel: volta à primeira aba
    pedirInicio()
    if (areaConteudo.value) areaConteudo.value.scrollTop = 0
  } else {
    router.push({ name: rotaInicio.value })
  }
}

// O menu de baixo aparece em todas as telas do cliente logado (rotas com meta.role = 'client')
const mostrarMenuCliente = computed(() => isClient.value && route.meta?.role === 'client')

// Cliente logado: confere os pedidos a cada 5 s para perceber a entrega em qualquer tela
let timerPedidos = null
watch(
  () => (usuarioAtual.value?.role === 'client' ? usuarioAtual.value.id : null),
  (id) => {
    if (timerPedidos) clearInterval(timerPedidos)
    timerPedidos = id ? setInterval(() => loadOrders(), 5000) : null
  },
  { immediate: true }
)
onUnmounted(() => {
  if (timerPedidos) clearInterval(timerPedidos)
})

watch(
  () => route.path,
  () => {
    if (areaConteudo.value) areaConteudo.value.scrollTop = 0
  }
)

const showTermsOverlay = computed(() => {
  const user = usuarioAtual.value
  if (!user) return false
  return (user.role === 'client' || user.role === 'store') && user.termosAceitos === false
})

// Cliente: o nome no topo abre as configurações do perfil (não há mais aba de perfil no menu de baixo)
function abrirPerfil () {
  if (isClient.value) router.push({ name: 'PainelConsumidor', query: { aba: 'profile' } })
}

function handleLogout () {
  logout()
}
</script>