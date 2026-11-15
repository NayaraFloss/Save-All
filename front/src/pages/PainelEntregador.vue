<script setup>
import { ref, computed, onMounted, watch } from "vue";
import { storeToRefs } from "pinia";
import { useAppStore } from "../stores/estadoApp";
const appStore = useAppStore();
// Botão Início do cabeçalho: volta à primeira aba do painel
watch(() => appStore.inicioSinal, () => {
  activeTab.value = usuarioAtual.value?.tipoEntregador === "shared" ? "available" : "active";
});
const { usuarioAtual, orders } = storeToRefs(appStore);
const {
  updateOrderStatus,
  loadOrders,
  alternarModoEscuro,
  logout,
  updateProfile
} = appStore;
const activeTab = ref("active");
const editingCity = ref(false);
const newCity = ref("");
const startEditingCity = () => {
  newCity.value = usuarioAtual.value?.workingCity || "";
  editingCity.value = true;
};
const cancelEditingCity = () => {
  editingCity.value = false;
};
const saveCity = async () => {
  if (!newCity.value.trim()) return;
  try {
    await updateProfile({ workingCity: newCity.value.trim() });
    editingCity.value = false;
  } catch (err) {
    console.error("Erro ao salvar cidade:", err);
  }
};
onMounted(async () => {
  await loadOrders();
  if (usuarioAtual.value?.tipoEntregador === "shared") {
    activeTab.value = "available";
  } else {
    activeTab.value = "active";
  }
});
const handleRefresh = async () => {
  await loadOrders();
};
const driverOrders = computed(() => {
  if (!usuarioAtual.value) return [];
  const isInternal = usuarioAtual.value.tipoEntregador === "internal";
  const lojaId = usuarioAtual.value.contractedStoreId || "";
  return orders.value.filter((o) => {
    if (isInternal) {
      return o.lojaId === lojaId || o.nomeLoja === usuarioAtual.value?.contractedStoreName;
    } else {
      return true;
    }
  });
});
const availableOrders = computed(() => {
  return driverOrders.value.filter((o) => {
    return o.status === "delivery" && (!o.entregadorId || o.nomeEntregador === "Compartilhado da Cidade");
  });
});
const activeDeliveries = computed(() => {
  if (!usuarioAtual.value) return [];
  return driverOrders.value.filter((o) => {
    return o.status === "delivery" && o.entregadorId === usuarioAtual.value?.id;
  });
});
const historyDeliveries = computed(() => {
  if (!usuarioAtual.value) return [];
  return driverOrders.value.filter((o) => {
    return o.status === "delivered" && o.entregadorId === usuarioAtual.value?.id;
  });
});
const handleClaimOrder = async (orderId) => {
  if (!usuarioAtual.value) return;
  try {
    await updateOrderStatus(orderId, "delivery", {
      entregadorId: usuarioAtual.value.id,
      nomeEntregador: usuarioAtual.value.name,
      tipoEntregador: "shared"
    });
    activeTab.value = "active";
  } catch (err) {
    console.error("Erro ao aceitar corrida:", err);
  }
};
const handleCompleteDelivery = async (orderId) => {
  try {
    await updateOrderStatus(orderId, "delivered");
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      gain.gain.setValueAtTime(0.015, audioCtx.currentTime);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.2);
    } catch {
      // sem ação: áudio é opcional
    }
    activeTab.value = "history";
  } catch (err) {
    console.error("Erro ao finalizar entrega:", err);
  }
};
const openMapDirections = (address) => {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
  window.open(url, "_blank");
};
const totalEarned = computed(() => {
  return historyDeliveries.value.length * 8;
});
</script>

<template>
  <div class="painel-entregador q-pb-xl">
    <!-- Cabeçalho -->
    <q-toolbar class="painel-header q-px-md">
      <q-avatar color="orange-5" text-color="dark" icon="local_shipping" size="40px" class="q-mr-sm" />
      <div class="col">
        <div class="text-subtitle2 text-weight-bold text-uppercase font-display">Painel de Entregas</div>
        <div class="text-caption text-grey-6 font-mono text-weight-bold">SAVEALL LOGÍSTICA</div>
      </div>
      <q-btn
        flat
        round
        dense
        no-caps
        :icon="$q.dark.isActive ? 'light_mode' : 'dark_mode'"
        :color="$q.dark.isActive ? 'amber-5' : 'grey-7'"
        @click="alternarModoEscuro"
      >
        <q-tooltip>Alternar Tema</q-tooltip>
      </q-btn>
      <q-btn flat round dense no-caps icon="logout" color="negative" @click="logout">
        <q-tooltip>Sair da Conta</q-tooltip>
      </q-btn>
    </q-toolbar>

    <q-separator />

    <main class="painel-main q-pa-md column q-gutter-y-md">
      <!-- Aviso de entregador desvinculado -->
      <q-banner
        v-if="usuarioAtual?.suspenso || (usuarioAtual?.qtdReclamacoes && usuarioAtual.qtdReclamacoes > 5)"
        rounded
        class="bg-red-1 text-negative suspended-banner"
      >
        <template #avatar>
          <q-avatar color="negative" text-color="white" icon="warning" size="40px" />
        </template>
        <div class="text-caption text-weight-bold text-uppercase font-display">ENTREGADOR DESVINCULADO</div>
        <div class="text-caption q-mt-xs">
          Seu perfil acumulou <strong>{{ usuarioAtual?.qtdReclamacoes || 6 }} reclamações de 1 estrela</strong> (limite máximo: 5).
          Conforme o regulamento logístico da plataforma Save All, seu cadastro foi desvinculado das entregas. Para contestar, fale com o administrador da plataforma.
        </div>
      </q-banner>

      <!-- Cartão de perfil -->
      <q-card v-if="usuarioAtual" flat bordered class="profile-card">
        <q-card-section>
          <div class="row items-start no-wrap">
            <div class="relative-position q-mr-md">
              <q-avatar size="44px" color="orange-1" text-color="orange-8" class="text-weight-bold text-uppercase font-display">
                {{ usuarioAtual.name.charAt(0) }}
              </q-avatar>
              <span class="status-dot"></span>
            </div>

            <div class="col">
              <div class="row items-center q-gutter-x-sm">
                <div class="text-subtitle2 text-weight-bold font-display">Olá, {{ usuarioAtual.name }}</div>
                <q-badge v-if="usuarioAtual.tipoEntregador === 'internal'" color="blue-1" text-color="blue-8" outline label="Contratado" />
                <q-badge v-else color="indigo-1" text-color="indigo-8" outline label="Compartilhado" />
              </div>

              <div v-if="usuarioAtual.tipoEntregador === 'internal'" class="text-caption text-grey-6">
                Entregador exclusivo da loja
                <strong class="text-orange-8">{{ usuarioAtual.contractedStoreName || 'Dona Kiuda Café' }}</strong>.
              </div>
              <div v-else class="text-caption text-grey-6">
                Operador logístico autônomo na rede compartilhada de
                <strong class="text-indigo-5">{{ usuarioAtual.workingCity || 'Pinhalzinho/SC' }}</strong>.
              </div>

              <!-- Edição da cidade de trabalho -->
              <q-separator spaced />
              <div class="row items-center q-gutter-x-sm">
                <span class="text-caption text-grey-6 text-uppercase font-mono">Cidade de Trabalho:</span>
                <template v-if="!editingCity">
                  <span class="text-caption text-weight-bold text-positive">{{ usuarioAtual.workingCity || 'Pinhalzinho' }}</span>
                  <q-btn flat dense no-caps size="sm" color="primary" label="(Alterar)" @click="startEditingCity" />
                </template>
                <template v-else>
                  <q-input
                    v-model="newCity"
                    dense
                    outlined
                    placeholder="Ex: Pinhalzinho"
                    class="city-input"
                  />
                  <q-btn unelevated dense no-caps size="sm" color="positive" label="Salvar" class="q-px-sm" @click="saveCity" />
                  <q-btn flat dense no-caps size="sm" color="grey-7" label="Cancelar" class="q-px-sm" @click="cancelEditingCity" />
                </template>
              </div>
            </div>
          </div>
        </q-card-section>

        <q-separator />

        <q-card-section>
          <div class="row q-col-gutter-sm">
            <div class="col-4">
              <div class="stat-label text-grey-6">Hoje</div>
              <div class="text-caption text-weight-bold font-mono row items-center no-wrap">
                <q-icon name="attach_money" color="orange-8" size="16px" />
                R$ {{ totalEarned.toFixed(2) }}
              </div>
            </div>
            <div class="col-4">
              <div class="stat-label text-grey-6">Ativas</div>
              <div class="text-caption text-weight-bold font-mono row items-center no-wrap">
                <q-icon name="explore" color="blue-5" size="16px" class="q-mr-xs" />
                {{ activeDeliveries.length }} rotas
              </div>
            </div>
            <div class="col-4">
              <div class="stat-label text-grey-6">Concluídas</div>
              <div class="text-caption text-weight-bold font-mono row items-center no-wrap">
                <q-icon name="check_circle" color="positive" size="16px" class="q-mr-xs" />
                {{ historyDeliveries.length }} entregas
              </div>
            </div>
          </div>
        </q-card-section>
      </q-card>

      <!-- Reputação e qualidade -->
      <q-card flat bordered>
        <q-card-section class="q-gutter-y-sm">
          <div class="row items-center justify-between no-wrap">
            <div class="row items-center no-wrap">
              <q-icon name="shield" color="amber-8" size="20px" class="q-mr-sm" />
              <div class="text-caption text-weight-bold text-uppercase font-display">Reputação de Entrega & Qualidade</div>
            </div>
            <q-badge color="amber-2" text-color="amber-10" class="font-mono text-weight-bold q-ml-sm" label="Máx: 5 Reclamações 1★" />
          </div>

          <div class="row q-col-gutter-sm">
            <div class="col-12 col-sm-6">
              <div class="metric-box">
                <div class="stat-label text-grey-6">Avaliação Média</div>
                <div class="row items-center q-gutter-x-xs q-mt-xs">
                  <q-icon name="star" color="amber-7" size="18px" />
                  <span class="text-subtitle2 text-weight-bold font-mono text-amber-8">
                    {{ usuarioAtual?.rating?.toFixed(1) || '4.8' }} ★
                  </span>
                  <span class="text-caption text-grey-6 font-mono">({{ usuarioAtual?.qtdAvaliacoes || 15 }})</span>
                </div>
              </div>
            </div>
            <div class="col-12 col-sm-6">
              <div class="metric-box">
                <div class="stat-label text-grey-6">Reclamações 1-Estrela</div>
                <div class="row items-center q-gutter-x-xs q-mt-xs">
                  <span
                    class="text-subtitle2 text-weight-bold font-mono"
                    :class="(usuarioAtual?.qtdReclamacoes || 0) > 3 ? 'text-negative' : 'text-positive'"
                  >
                    {{ usuarioAtual?.qtdReclamacoes || 0 }} / 5
                  </span>
                  <span class="text-caption text-grey-6 font-mono">
                    {{ (usuarioAtual?.qtdReclamacoes || 0) > 5 ? 'EXCEDIDO' : 'Toleradas' }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Barra de progresso até a desvinculação -->
          <div>
            <div class="row justify-between text-caption text-grey-6 font-mono">
              <span>Margem de Qualidade Logística</span>
              <span>{{ Math.min(100, Math.round(((usuarioAtual?.qtdReclamacoes || 0) / 5) * 100)) }}% do Limite</span>
            </div>
            <q-linear-progress
              rounded
              size="8px"
              class="q-mt-xs"
              :value="Math.min(100, Math.round(((usuarioAtual?.qtdReclamacoes || 0) / 5) * 100)) / 100"
              :color="(usuarioAtual?.qtdReclamacoes || 0) > 5 ? 'negative' : ((usuarioAtual?.qtdReclamacoes || 0) > 3 ? 'warning' : 'positive')"
              track-color="grey-4"
            />
          </div>

        </q-card-section>
      </q-card>

      <!-- Abas -->
      <q-tabs
        v-model="activeTab"
        dense
        no-caps
        inline-label
        class="rounded-borders tabs-bar"
        active-color="primary"
        indicator-color="primary"
        align="justify"
      >
        <q-tab
          v-if="usuarioAtual?.tipoEntregador === 'shared'"
          name="available"
          icon="explore"
          :label="`Fila Cidade (${availableOrders.length})`"
        />
        <q-tab name="active" icon="navigation" :label="`Minhas Entregas (${activeDeliveries.length})`" />
        <q-tab name="history" icon="check_circle" :label="`Histórico (${historyDeliveries.length})`" />
      </q-tabs>

      <!-- Sincronização -->
      <div class="row items-center justify-between q-px-xs">
        <span class="row items-center text-caption text-grey-6 font-mono">
          <span class="live-dot q-mr-xs"></span>
          Conectado ao canal de fretes
        </span>
        <q-btn flat dense no-caps size="sm" color="grey-7" class="text-weight-bold" label="Sincronizar Rotas 🔄" @click="handleRefresh" />
      </div>

      <!-- LISTAS -->
      <div class="column q-gutter-y-md">
        <!-- Aba A: fila compartilhada -->
        <template v-if="activeTab === 'available' && usuarioAtual?.tipoEntregador === 'shared'">
          <q-card v-if="availableOrders.length === 0" flat bordered>
            <q-card-section class="text-center q-py-xl">
              <q-icon name="explore" color="indigo-4" size="40px" />
              <div class="text-body2 text-weight-bold q-mt-sm">Fila vazia no momento 📦</div>
              <div class="text-caption text-grey-6 q-mt-xs">
                Aguarde novas lojas da cidade prepararem pedidos e despacharem para a fila compartilhada.
              </div>
            </q-card-section>
          </q-card>

          <q-card v-for="order in availableOrders" :key="order.id" flat bordered>
            <q-card-section class="q-gutter-y-sm">
              <div class="row justify-between items-start no-wrap">
                <div>
                  <q-badge color="indigo-1" text-color="indigo-8" class="font-mono text-uppercase" label="Disponível para Coleta" />
                  <div class="text-caption text-weight-bold text-uppercase q-mt-sm">🏬 {{ order.nomeLoja }}</div>
                  <div class="text-caption text-grey-6 font-mono">Pedido #{{ order.id }}</div>
                </div>
                <span class="text-caption text-weight-bold font-mono text-indigo-5">R$ 8,00 taxa frete</span>
              </div>

              <q-separator />

              <!-- Rota -->
              <div class="column q-gutter-y-xs">
                <div class="row items-start no-wrap">
                  <q-avatar size="20px" color="grey-4" text-color="grey-8" class="text-weight-bold q-mr-sm">A</q-avatar>
                  <div class="col">
                    <div class="route-label text-grey-6">Local de Coleta (Estabelecimento)</div>
                    <div class="text-caption text-weight-medium ellipsis">{{ order.nomeLoja }}</div>
                  </div>
                </div>
                <div class="route-line"></div>
                <div class="row items-start no-wrap">
                  <q-avatar size="20px" color="indigo-5" text-color="white" class="text-weight-bold q-mr-sm">B</q-avatar>
                  <div class="col">
                    <div class="route-label text-indigo-5">Destino de Entrega (Cliente)</div>
                    <div class="text-caption text-weight-bold ellipsis">{{ order.address }}</div>
                  </div>
                </div>
              </div>

              <q-separator />

              <!-- Itens -->
              <div class="metric-box">
                <div class="stat-label text-grey-6">Itens do Pedido</div>
                <div class="text-caption text-grey-7 q-mt-xs">
                  <div v-for="(it, idx) in order.items" :key="idx" class="row justify-between">
                    <span class="text-weight-medium">{{ it.quantity }}x {{ it.name }}</span>
                    <span class="font-mono">R$ {{ (it.price * it.quantity).toFixed(2) }}</span>
                  </div>
                  <q-separator spaced />
                  <div class="row justify-between text-weight-bold text-orange-8">
                    <span>Total a Receber:</span>
                    <span>R$ {{ order.total.toFixed(2) }}</span>
                  </div>
                </div>
              </div>

              <q-btn
                unelevated
                no-caps
                color="indigo-5"
                text-color="white"
                icon="explore"
                class="full-width text-weight-bold"
                label="Aceitar Corrida & Traçar Rota"
                @click="handleClaimOrder(order.id)"
              />
            </q-card-section>
          </q-card>
        </template>

        <!-- Aba B: entregas ativas -->
        <template v-if="activeTab === 'active'">
          <q-card v-if="activeDeliveries.length === 0" flat bordered>
            <q-card-section class="text-center q-py-xl">
              <q-icon name="navigation" color="orange-6" size="40px" />
              <div class="text-body2 text-weight-bold q-mt-sm">Nenhuma entrega ativa no momento 🛵</div>
              <div class="text-caption text-grey-6 q-mt-xs">
                {{ usuarioAtual?.tipoEntregador === 'internal'
                  ? 'Aguarde o estabelecimento da loja marcar novos pedidos para "Sair para Entrega".'
                  : 'Vá na aba "Fila Cidade" e aceite uma das corridas compartilhadas disponíveis.' }}
              </div>
            </q-card-section>
          </q-card>

          <q-card v-for="order in activeDeliveries" :key="order.id" flat bordered>
            <q-card-section class="q-gutter-y-sm">
              <div class="row justify-between items-start no-wrap">
                <div>
                  <q-badge color="orange-1" text-color="orange-9" class="font-mono text-uppercase" label="Rota em Andamento" />
                  <div class="text-caption text-weight-bold q-mt-sm">🏢 {{ order.nomeLoja }}</div>
                  <div class="text-caption text-grey-6 font-mono">
                    Destinatário: <strong class="text-orange-8">{{ order.nomeCliente }}</strong>
                  </div>
                </div>
                <span class="text-caption text-weight-bold font-mono text-orange-8">Pedido #{{ order.id }}</span>
              </div>

              <!-- Mapa ilustrativo da rota -->
              <div class="route-map column items-center justify-center relative-position">
                <div class="route-map-dots absolute-full"></div>
                <svg class="route-svg" xmlns="http://www.w3.org/2000/svg">
                  <path
                    class="route-path"
                    d="M 40 24 Q 150 -10, 260 24"
                    fill="none"
                    :stroke="$q.dark.isActive ? '#f97316' : '#ea580c'"
                    stroke-width="2"
                    stroke-dasharray="5 4"
                  />
                  <circle cx="40" cy="24" r="5" :fill="$q.dark.isActive ? '#3b82f6' : '#2563eb'" />
                  <circle cx="260" cy="24" r="5" :fill="$q.dark.isActive ? '#10b981' : '#059669'" />
                </svg>
                <div class="row justify-between items-end full-width route-map-labels font-mono">
                  <div>
                    <span class="text-blue-5">PARTIDA (A)</span>
                    <div class="text-grey-6 ellipsis route-map-name">{{ order.nomeLoja }}</div>
                  </div>
                  <q-badge outline color="orange-8" label="🛵 ROTA ATIVA" />
                  <div class="text-right">
                    <span class="text-positive">DESTINO (B)</span>
                    <div class="text-grey-6 ellipsis route-map-name">{{ order.nomeCliente }}</div>
                  </div>
                </div>
              </div>

              <!-- Endereço -->
              <div class="metric-box row items-start no-wrap">
                <q-icon name="place" color="orange-8" size="22px" class="q-mr-sm" />
                <div class="col">
                  <div class="route-label text-grey-6 font-mono text-weight-bold">Endereço de Entrega</div>
                  <div class="text-caption text-weight-bold">{{ order.address }}</div>
                  <q-btn
                    flat
                    dense
                    no-caps
                    size="sm"
                    color="primary"
                    icon="open_in_new"
                    class="q-mt-xs q-px-none"
                    label="Visualizar Trajeto no Google Maps"
                    @click="openMapDirections(order.address)"
                  />
                </div>
              </div>

              <!-- Itens -->
              <div class="metric-box">
                <div class="stat-label text-grey-6">Itens do Pedido</div>
                <div class="text-caption text-grey-7 q-mt-xs">
                  <div v-for="(it, idx) in order.items" :key="idx" class="row justify-between">
                    <span class="text-weight-medium">{{ it.quantity }}x {{ it.name }}</span>
                    <span class="font-mono">R$ {{ (it.price * it.quantity).toFixed(2) }}</span>
                  </div>
                  <q-separator spaced />
                  <div class="row justify-between text-weight-bold text-orange-8">
                    <span>Valor Cobrado ({{ order.formaPagamento }}):</span>
                    <span>R$ {{ order.total.toFixed(2) }}</span>
                  </div>
                </div>
              </div>

              <q-btn
                unelevated
                no-caps
                color="positive"
                icon="check_circle"
                class="full-width text-weight-bold"
                label="Marcar como Entregue ✅"
                @click="handleCompleteDelivery(order.id)"
              />
            </q-card-section>
          </q-card>
        </template>

        <!-- Aba C: histórico -->
        <template v-if="activeTab === 'history'">
          <q-card v-if="historyDeliveries.length === 0" flat bordered>
            <q-card-section class="text-center q-py-xl">
              <q-icon name="check_circle" color="grey-6" size="40px" />
              <div class="text-body2 text-weight-bold q-mt-sm">Nenhuma entrega no histórico 🍃</div>
              <div class="text-caption text-grey-6 q-mt-xs">
                Suas entregas finalizadas e taxas de fretes arrecadadas hoje serão listadas aqui.
              </div>
            </q-card-section>
          </q-card>

          <q-card v-for="order in historyDeliveries" :key="order.id" flat bordered class="history-card">
            <q-card-section class="q-gutter-y-sm">
              <div class="row justify-between items-center">
                <span class="text-caption font-mono text-weight-bold text-grey-6">ENTREGUE #{{ order.id }}</span>
                <q-badge color="green-1" text-color="green-8" class="text-uppercase text-weight-bold" label="✓ Concluído" />
              </div>

              <div>
                <div class="text-caption text-weight-bold text-uppercase ellipsis">🏬 {{ order.nomeLoja }}</div>
                <div class="text-caption text-grey-6 ellipsis">Cliente: {{ order.nomeCliente }}</div>
                <div class="text-caption text-grey-6 ellipsis">Endereço: {{ order.address }}</div>
              </div>

              <div class="metric-box">
                <div class="stat-label text-grey-6">Itens Entregues</div>
                <div class="text-caption text-grey-7 q-mt-xs">
                  <div v-for="(it, idx) in order.items" :key="idx" class="row justify-between">
                    <span>{{ it.quantity }}x {{ it.name }}</span>
                    <span class="font-mono">R$ {{ (it.price * it.quantity).toFixed(2) }}</span>
                  </div>
                </div>
              </div>

              <q-separator />

              <div class="row justify-between text-caption text-grey-6 font-mono">
                <span>Valor cobrado: R$ {{ order.total.toFixed(2) }}</span>
                <span class="text-positive text-weight-bold">Ganho Frete: R$ 8,00</span>
              </div>
            </q-card-section>
          </q-card>
        </template>
      </div>
    </main>
  </div>
</template>

<style scoped lang="scss">
.painel-entregador {
  min-height: 100%;
}

.painel-header {
  position: sticky;
  top: 0;
  z-index: 30;
  min-height: 60px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(8px);
}

.painel-main {
  width: 100%;
}

.status-dot {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #10b981;
  border: 2px solid #fff;
}

.live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10b981;
  display: inline-block;
}

.city-input {
  width: 130px;
}

.stat-label {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.route-label {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
}

.route-line {
  width: 2px;
  height: 12px;
  margin-left: 9px;
  background: rgba(99, 102, 241, 0.35);
}

.metric-box {
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(100, 116, 139, 0.25);
  background: rgba(100, 116, 139, 0.08);
}

.tabs-bar {
  background: rgba(100, 116, 139, 0.12);
}

.history-card {
  opacity: 0.92;
}

.suspended-banner {
  border: 2px solid var(--q-negative);
}

.route-map {
  min-height: 110px;
  padding: 14px;
  overflow: hidden;
  border-radius: 16px;
  border: 1px solid rgba(100, 116, 139, 0.25);
  background: rgba(100, 116, 139, 0.08);
  user-select: none;
}

.route-map-dots {
  opacity: 0.1;
  background-image: radial-gradient(circle, currentColor 1px, transparent 1px);
  background-size: 16px 16px;
}

.route-svg {
  position: absolute;
  width: 100%;
  height: 48px;
  overflow: visible;
  z-index: 1;
}

.route-path {
  animation: dash 8s linear infinite;
}

.route-map-labels {
  margin-top: auto;
  z-index: 2;
  font-size: 8px;
  font-weight: 700;
}

.route-map-name {
  max-width: 80px;
  font-weight: 300;
}

.body--dark {
  .painel-header {
    background: rgba(15, 28, 36, 0.92);
  }

  .status-dot {
    border-color: #182c39;
  }

  .suspended-banner {
    background: rgba(239, 68, 68, 0.15) !important;
  }
}

@keyframes dash {
  to {
    stroke-dashoffset: -40;
  }
}
</style>
