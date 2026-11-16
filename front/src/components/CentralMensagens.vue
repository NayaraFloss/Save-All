<script setup>
import { computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAppStore } from 'stores/estadoApp'
import { useMensageriaStore } from 'stores/mensageria'
import { dicaDaCentral, diagnosticarPromocoes } from '../utils/mensageria'

const router = useRouter()
const appStore = useAppStore()
const { usuarioAtual, modoEscuro, notificationsEnabled, foods, stores, orders, selectedCity } = storeToRefs(appStore)
const { toggleNotifications } = appStore
const mensageria = useMensageriaStore()
const { mensagens, naoLidas } = storeToRefs(mensageria)

// Cor do ícone conforme o tipo da mensagem.
const CORES = {
  vencido: 'negative',
  vencimento: 'orange-8',
  promocao: 'positive',
  'doacao-nova': 'teal',
  'doacao-lembrete': 'orange-8',
  'doacao-resposta': 'positive',
  'pedido-novo': 'deep-orange',
  'pedido-status': 'primary',
  'pedido-cancelado': 'negative',
}
const corDe = (mensagem) => CORES[mensagem.tipo] || 'primary'

const tempoRelativo = (iso) => {
  const minutos = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (Number.isNaN(minutos)) return ''
  if (minutos < 1) return 'agora'
  if (minutos < 60) return `há ${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `há ${horas} h`
  const dias = Math.floor(horas / 24)
  if (dias < 7) return `há ${dias} ${dias === 1 ? 'dia' : 'dias'}`
  return new Date(iso).toLocaleDateString('pt-BR')
}

const abrir = (mensagem) => {
  mensageria.marcarLida(mensagem.id)
  if (mensagem.acao?.rota) {
    router.push({ name: mensagem.acao.rota, query: mensagem.acao.consulta })
  }
}

const atualizar = () => mensageria.atualizar()
// Busca os dados no servidor e recalcula; só com a aba visível, para não gastar rede à toa.
const sincronizar = () => {
  if (!document.hidden) mensageria.sincronizar()
}
let temporizador = null
// Pedidos mudam mais rápido: confere a cada 5 segundos (só com a aba visível)
const sincronizarPedidos = () => {
  if (!document.hidden) mensageria.sincronizarPedidos()
}
let temporizadorPedidos = null

const dica = computed(() => dicaDaCentral({ usuario: usuarioAtual.value, cidade: selectedCity.value }))

onMounted(() => {
  mensageria.sincronizar()
  // A cada minuto, ao voltar para a aba e quando outra aba grava dados.
  temporizador = setInterval(sincronizar, 60000)
  temporizadorPedidos = setInterval(sincronizarPedidos, 5000)
  document.addEventListener('visibilitychange', sincronizar)
  window.addEventListener('focus', sincronizar)
  window.addEventListener('storage', atualizar)
  window.addEventListener('saveall_donation_offer_created', atualizar)
  // Ajuda de teste (só em desenvolvimento): digite diagnosticoMensagens() no Console do navegador.
  if (import.meta.env.DEV) {
    window.diagnosticoMensagens = () => {
      console.table(
        diagnosticarPromocoes({ foods: foods.value, stores: stores.value, cidade: selectedCity.value }),
      )
      return `${mensagens.value.length} mensagem(ns) na central, ${naoLidas.value} não lida(s). Perfil: ${usuarioAtual.value?.role}.`
    }
  }
})
onBeforeUnmount(() => {
  clearInterval(temporizador)
  clearInterval(temporizadorPedidos)
  document.removeEventListener('visibilitychange', sincronizar)
  window.removeEventListener('focus', sincronizar)
  window.removeEventListener('storage', atualizar)
  window.removeEventListener('saveall_donation_offer_created', atualizar)
})

// Dados que alimentam as regras mudaram (login, catálogo, lojas, cidade).
watch([usuarioAtual, foods, stores, orders, selectedCity], atualizar)
</script>

<template>
  <q-btn
    flat
    round
    dense
    :icon="notificationsEnabled ? 'notifications' : 'notifications_off'"
    aria-label="Mensagens"
    class="central-mensagens-btn"
  >
    <q-badge v-if="naoLidas > 0" color="negative" floating rounded>{{ naoLidas > 9 ? '9+' : naoLidas }}</q-badge>
    <q-tooltip>Mensagens</q-tooltip>

    <q-menu anchor="bottom right" self="top right" :offset="[0, 8]" max-width="420px">
      <q-card flat :dark="modoEscuro" class="central-card">
        <q-card-section class="row items-center no-wrap q-py-sm">
          <div class="col">
            <div class="text-subtitle2 text-weight-bold">Mensagens</div>
            <div class="text-caption text-grey-7">
              {{ naoLidas > 0 ? `${naoLidas} não ${naoLidas === 1 ? 'lida' : 'lidas'}` : 'Nenhuma mensagem nova' }}
            </div>
          </div>
          <q-btn
            flat
            dense
            no-caps
            size="sm"
            color="primary"
            label="Marcar todas como lidas"
            :disable="naoLidas === 0"
            @click="mensageria.marcarTodasLidas()"
          />
        </q-card-section>
        <q-separator />

        <q-scroll-area v-if="mensagens.length" class="central-lista">
          <q-list separator>
            <q-item
              v-for="mensagem in mensagens"
              :key="mensagem.id"
              clickable
              v-ripple
              v-close-popup
              class="central-item"
              :class="{ 'central-item--nova': !mensagem.lida }"
              @click="abrir(mensagem)"
            >
              <q-item-section avatar top>
                <q-avatar size="36px" :color="corDe(mensagem)" text-color="white" :icon="mensagem.icone" />
              </q-item-section>
              <q-item-section>
                <q-item-label :class="{ 'text-weight-bold': !mensagem.lida }">{{ mensagem.titulo }}</q-item-label>
                <q-item-label caption class="central-texto">{{ mensagem.texto }}</q-item-label>
                <q-item-label caption class="row items-center justify-between q-mt-xs">
                  <span>{{ tempoRelativo(mensagem.criadaEm) }}</span>
                  <span v-if="mensagem.acao?.rotulo" class="text-primary text-weight-medium">
                    {{ mensagem.acao.rotulo }} →
                  </span>
                </q-item-label>
              </q-item-section>
              <q-item-section side top>
                <q-btn
                  flat
                  round
                  dense
                  size="sm"
                  icon="close"
                  color="grey-6"
                  aria-label="Dispensar mensagem"
                  @click.stop="mensageria.dispensar(mensagem.id)"
                >
                  <q-tooltip>Dispensar</q-tooltip>
                </q-btn>
              </q-item-section>
            </q-item>
          </q-list>
        </q-scroll-area>

        <div v-else class="text-center text-grey-7 q-pa-lg">
          <q-icon name="mark_email_read" size="32px" class="q-mb-sm" />
          <div class="text-body2">Não há mensagens no momento.</div>
          <div class="text-caption q-mt-xs">{{ dica }}</div>
        </div>

        <q-separator />
        <q-item tag="label" class="q-py-xs">
          <q-item-section>
            <q-item-label class="text-caption">Avisos em tela</q-item-label>
            <q-item-label caption>Exibe um aviso quando chegar uma nova mensagem.</q-item-label>
          </q-item-section>
          <q-item-section side>
            <q-toggle dense :model-value="notificationsEnabled" @update:model-value="toggleNotifications" />
          </q-item-section>
        </q-item>
      </q-card>
    </q-menu>
  </q-btn>
</template>

<style scoped lang="scss">
.central-card {
  width: min(420px, 92vw);
}
.central-lista {
  height: min(420px, 60vh);
}
.central-item--nova {
  background: rgba(33, 186, 69, 0.07);
}
.central-texto {
  white-space: normal;
  line-height: 1.35;
}
</style>