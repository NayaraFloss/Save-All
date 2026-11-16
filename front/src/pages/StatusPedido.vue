<script setup>
import FundoSustentavel from "components/FundoSustentavel.vue";
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { storeToRefs } from "pinia";
import { useRoute } from "vue-router";
import { useAppStore } from "../stores/estadoApp.js";
import { canEvaluateOrder, getRemainingRatingMinutes } from "../utils/utilitariosAvaliacaoPedido.js";
import { ocultarSurpresa } from "../utils/pedidoSurpresa.js";
const appStore = useAppStore();
const { orders: pedidosBrutos } = storeToRefs(appStore);
// Visão do cliente: Sacola Surpresa não revela a padaria nem os produtos
const orders = computed(() => pedidosBrutos.value.map(ocultarSurpresa));
const { setScreen, updateOrderStatus, loadOrders, triggerNotification } = appStore;
const selectedOrderId = ref(null);
const selectedCompletedOrderId = ref(null);
const searchQuery = ref("");
// O menu de baixo abre esta tela em três modos: ?aba=acompanhar (só em andamento),
// ?aba=historico (só entregues) ou sem aba (todos).
const route = useRoute();
const filtroDaRota = () => (route.query.aba === "acompanhar" ? "active" : route.query.aba === "historico" ? "delivered" : "all");
const orderFilter = ref(filtroDaRota());
watch(() => route.query.aba, () => {
  orderFilter.value = filtroDaRota();
});
const modoHistorico = computed(() => route.query.aba === "historico");
const modoAcompanhar = computed(() => route.query.aba === "acompanhar");
const handleOpenRating = (order) => {
  if (!canEvaluateOrder(order)) {
    triggerNotification("Ap\xF3s 1 hora da entrega, n\xE3o \xE9 mais permitido avaliar o pedido.", "info");
    return;
  }
  appStore.abrirAvaliacao(order);
};
let intervalId = null;
// Todos os pedidos que ainda não foram entregues ficam em andamento e podem ser acompanhados
const activeOrders = computed(() => orders.value.filter((o) => o.status !== "delivered" && o.status !== "cancelled"));
// Finalizados: entregues e cancelados
const completedOrders = computed(() => orders.value.filter((o) => o.status === "delivered" || o.status === "cancelled"));
const showAllCompletedOrders = ref(false);
let hasInitializedSelection = false;
const initOrderSelection = () => {
  if (activeOrders.value.length > 0) {
    selectedOrderId.value = activeOrders.value[0].id;
  } else {
    selectedOrderId.value = null;
  }
};
watch(orders, (newOrders) => {
  if (!hasInitializedSelection && newOrders.length > 0) {
    hasInitializedSelection = true;
    initOrderSelection();
  }
}, { deep: true, immediate: true });
onMounted(() => {
  loadOrders();
  initOrderSelection();
  intervalId = setInterval(() => {
    loadOrders();
  }, 3e3);
});
onUnmounted(() => {
  if (intervalId) {
    clearInterval(intervalId);
  }
});
const toggleOrderExpansion = (orderId) => {
  if (selectedOrderId.value === orderId) {
    selectedOrderId.value = null;
  } else {
    selectedOrderId.value = orderId;
  }
};
const toggleCompletedExpansion = (orderId) => {
  if (selectedCompletedOrderId.value === orderId) {
    selectedCompletedOrderId.value = null;
  } else {
    selectedCompletedOrderId.value = orderId;
  }
};
const getStepNumber = (status) => {
  switch (status) {
    case "pending":
      return 1;
    case "preparing":
      return 2;
    case "delivery":
      return 3;
    case "delivered":
      return 4;
    default:
      return 1;
  }
};
const getStatusBadgeLabel = (status) => {
  switch (status) {
    case "pending":
      return "Pedido Feito";
    case "accepted":
      return "Pedido aceito";
    case "cancelled":
      return "Cancelado";
    case "preparing":
      return "Sendo preparado";
    case "delivery":
      return "Saiu para Entrega";
    case "delivered":
      return "Entregue";
    default:
      return status;
  }
};
// Cancelamento: o cliente pode cancelar até o pedido sair para entrega
const podeCancelar = (pedido) => ["pending", "accepted", "preparing"].includes(pedido?.status);
const pedidoParaCancelar = ref(null);
const motivoCancelamento = ref("");
const cancelando = ref(false);
const abrirCancelamento = (pedido) => {
  pedidoParaCancelar.value = pedido;
  motivoCancelamento.value = "";
};
const confirmarCancelamento = async () => {
  const pedido = pedidoParaCancelar.value;
  if (!pedido || cancelando.value) return;
  cancelando.value = true;
  const motivo = motivoCancelamento.value.trim();
  const ok = await updateOrderStatus(pedido.id, "cancelled", motivo ? { motivoCancelamento: motivo } : undefined);
  cancelando.value = false;
  pedidoParaCancelar.value = null;
  if (ok) selectedOrderId.value = null;
};
const handleConfirmReceipt = async (ord) => {
  if (!ord || ord.status !== "delivery") return;
  await updateOrderStatus(ord.id, "delivered");
  await loadOrders();
  const deliveredOrd = orders.value.find((o) => o.id === ord.id) || { ...ord, status: "delivered" };
  appStore.abrirAvaliacao(deliveredOrd);
};
const contarFase = (status) => orders.value.filter((o) => o.status === status).length;
// "Pedido feito" também inclui os já aceitos pela loja
const contarPedidoFeito = () => orders.value.filter((o) => o.status === "pending" || o.status === "accepted").length;
const filteredActiveOrders = computed(() => {
  return activeOrders.value.filter((o) => {
    if (!["all", "active"].includes(orderFilter.value)) {
      const fase = o.status === "accepted" ? "pending" : o.status;
      if (fase !== orderFilter.value) return false;
    }
    if (!searchQuery.value.trim()) return true;
    const q = searchQuery.value.toLowerCase().trim();
    return o.id.toLowerCase().includes(q) || o.nomeLoja.toLowerCase().includes(q) || o.items.some((i) => i.name.toLowerCase().includes(q));
  });
});
const displayedActiveOrders = computed(() => {
  return filteredActiveOrders.value;
});
const filteredCompletedOrders = computed(() => {
  return completedOrders.value.filter((o) => {
    if (!searchQuery.value.trim()) return true;
    const q = searchQuery.value.toLowerCase().trim();
    return o.id.toLowerCase().includes(q) || o.nomeLoja.toLowerCase().includes(q) || o.items.some((i) => i.name.toLowerCase().includes(q));
  });
});
const displayedCompletedOrders = computed(() => {
  if (showAllCompletedOrders.value || filteredCompletedOrders.value.length <= 3) {
    return filteredCompletedOrders.value;
  }
  return filteredCompletedOrders.value.slice(0, 3);
});
const remainingCompletedOrdersCount = computed(() => {
  return Math.max(0, filteredCompletedOrders.value.length - 3);
});
// Rótulos curtos da barra de acompanhamento (mesmas etapas do painel da loja)
const etapasCurtas = ["Pedido feito", "Preparando", "Em entrega", "Entregue"];
const timelineSteps = [
  { step: 1, title: "Pedido Feito", subtitle: "O estabelecimento recebeu seu pedido.", icon: "check_circle", color: "positive" },
  { step: 2, title: "Sendo preparado", subtitle: "Separando seus excedentes para entrega.", icon: "restaurant", color: "indigo-5" },
  { step: 3, title: "Saiu para Entrega", subtitle: "A loja est\xE1 levando o pedido at\xE9 o seu endere\xE7o.", icon: "local_shipping", color: "warning" },
  { step: 4, title: "Entregue", subtitle: "Entrega efetuada com sucesso. Bom apetite!", icon: "shopping_bag", color: "positive" }
];
const formatItemName = (name) => {
  if (!name) return "";
  return name.replace(/\s*frescos?\s+do\s+dia/gi, "").trim();
};
</script>

<template>
  <q-page class="status-page column no-wrap">
    <FundoSustentavel />
    <!-- Cabeçalho -->
    <div class="row items-center justify-between q-pa-md status-header">
      <div class="row items-center">
        <q-btn
          id="btn-order-status-back"
          flat
          round
          dense
          color="grey-7"
          icon="arrow_back"
          @click="setScreen('dashboard')"
        >
          <q-tooltip>Voltar ao Painel</q-tooltip>
        </q-btn>
        <span class="q-ml-sm text-caption text-grey-6 text-uppercase text-weight-bold">Painel</span>
      </div>
      <div class="row items-center q-gutter-x-xs">
        <span class="pulse-dot bg-positive" />
        <span class="text-caption text-uppercase text-weight-bold text-positive">Pedidos & Acompanhamento</span>
      </div>
    </div>

    <div class="col q-pa-md q-gutter-y-md">
      <!-- Se nenhum pedido existe -->
      <div v-if="orders.length === 0" class="column items-center justify-center text-center q-pa-lg q-gutter-y-md empty-state">
        <q-avatar size="72px" color="grey-3" text-color="grey-7" icon="history" class="empty-avatar" />
        <div class="text-subtitle2 text-weight-bold text-uppercase">Sem Histórico de Pedidos</div>
        <div class="text-caption text-grey-6 empty-text">Você ainda não realizou nenhum pedido sustentável. Comece a economizar de forma consciente e evite o desperdício!</div>
        <q-btn
          id="btn-status-to-stores"
          unelevated
          rounded
          no-caps
          color="secondary"
          text-color="dark"
          class="text-weight-bold text-uppercase q-px-lg"
          label="Novo Pedido"
          @click="setScreen('stores')"
        />
      </div>

      <template v-else>
        <!-- Busca e filtros -->
        <div class="q-gutter-y-sm">
          <q-input
            id="input-search-orders"
            v-model="searchQuery"
            outlined
            dense
            bg-color="transparent"
            placeholder="Buscar pedidos por número, comida ou estabelecimento..."
          >
            <template #prepend>
              <q-icon name="search" size="18px" />
            </template>
          </q-input>

          <!-- Fases do pedido, como no painel da loja: Pedido feito > Preparando > A caminho > Entregue -->
          <q-tabs
            v-if="!modoHistorico"
            v-model="orderFilter"
            dense
            no-caps
            align="justify"
            narrow-indicator
            active-color="primary"
            indicator-color="primary"
            class="text-grey-7"
          >
            <q-tab v-if="modoAcompanhar" id="filter-orders-active" name="active" icon="list_alt" :label="`Todos (${activeOrders.length})`" class="text-weight-bold" />
            <q-tab v-else id="filter-orders-all" name="all" icon="list_alt" :label="`Todos (${orders.length})`" class="text-weight-bold" />
            <q-tab id="filter-orders-pending" name="pending" icon="receipt_long" :label="`Pedido feito (${contarPedidoFeito()})`" class="text-weight-bold" />
            <q-tab id="filter-orders-preparing" name="preparing" icon="soup_kitchen" :label="`Preparando (${contarFase('preparing')})`" class="text-weight-bold" />
            <q-tab id="filter-orders-delivery" name="delivery" icon="local_shipping" :label="`A caminho (${contarFase('delivery')})`" class="text-weight-bold" />
            <!-- Entregues: também no Acompanhar, para o cliente ver e avaliar o que já chegou -->
            <q-tab id="filter-orders-delivered" name="delivered" icon="check_circle" :label="`Entregues (${contarFase('delivered')})`" class="text-weight-bold" />
          </q-tabs>
        </div>

        <!-- Pedido em andamento -->
        <div v-if="orderFilter !== 'delivered'" class="grupo-pedidos grupo-pedidos--andamento q-gutter-y-sm">
          <div class="grupo-pedidos__titulo row items-center no-wrap">
            <q-icon name="local_shipping" color="positive" size="20px" class="q-mr-sm" />
            <span class="text-subtitle2 text-weight-bold text-uppercase">Em andamento</span>
            <q-badge color="positive" text-color="white" rounded class="q-ml-sm" :label="filteredActiveOrders.length" />
            <span v-if="filteredActiveOrders.length > 0" class="pulse-dot bg-positive q-ml-sm" />
          </div>

          <q-card v-if="filteredActiveOrders.length === 0" flat bordered>
            <q-card-section class="text-center text-caption text-grey-6">
              Nenhum pedido em andamento no momento.
            </q-card-section>
          </q-card>

          <div v-else class="desk-grid desk-grid--2">
            <q-card
              v-for="o in displayedActiveOrders"
              :id="`order-card-active-${o.id}`"
              :key="o.id"
              flat
              bordered
              :class="['order-card', { 'order-card--selected order-card--open': selectedOrderId === o.id }]"
            >
              <q-card-section class="cursor-pointer" @click="toggleOrderExpansion(o.id)">
                <div class="row items-start justify-between no-wrap q-col-gutter-sm">
                  <div class="col ellipsis-container">
                    <div class="row items-center q-gutter-x-sm">
                      <span class="pulse-dot bg-positive" />
                      <span class="text-caption text-weight-bold font-mono">Pedido #{{ o.id }}</span>
                      <q-badge
                        :color="o.status === 'delivery' ? 'warning' : 'positive'"
                        :text-color="o.status === 'delivery' ? 'dark' : 'white'"
                        class="text-uppercase text-weight-bold"
                        :label="getStatusBadgeLabel(o.status)"
                      />
                    </div>
                    <div class="text-caption text-weight-medium ellipsis q-mt-xs">
                      {{ o.nomeLoja }}
                    </div>
                    <div class="text-caption text-grey-6 ellipsis">
                      <strong class="text-positive">Itens:</strong>
                      {{ o.items.map(i => `${i.quantity}x ${formatItemName(i.name)}`).join(', ') }}
                    </div>

                    <!-- Acompanhamento: Pedido feito > Preparando > Em entrega > Entregue -->
                    <div class="pipeline row no-wrap items-start q-mt-sm">
                      <template v-for="(st, idx) in timelineSteps" :key="st.step">
                        <div class="pipeline__etapa column items-center text-center" :class="{ 'pipeline__etapa--atual': getStepNumber(o.status) === st.step }">
                          <q-avatar
                            size="26px"
                            font-size="15px"
                            :icon="st.icon"
                            :color="getStepNumber(o.status) >= st.step ? st.color : 'grey-4'"
                            :text-color="getStepNumber(o.status) >= st.step ? 'white' : 'grey-6'"
                          />
                          <span class="pipeline__rotulo" :class="getStepNumber(o.status) >= st.step ? 'text-weight-bold' : 'text-grey-6'">{{ etapasCurtas[idx] }}</span>
                        </div>
                        <div v-if="idx < timelineSteps.length - 1" class="pipeline__linha" :class="{ 'pipeline__linha--ativa': getStepNumber(o.status) > st.step }" />
                      </template>
                    </div>
                  </div>

                  <div class="column items-end q-gutter-y-xs">
                    <span class="text-subtitle2 text-weight-bold font-mono text-secondary">R$ {{ o.total.toFixed(2) }}</span>
                    <q-chip
                      dense
                      square
                      size="sm"
                      :color="selectedOrderId === o.id ? 'primary' : 'grey-3'"
                      :text-color="selectedOrderId === o.id ? 'white' : 'grey-8'"
                      :icon-right="selectedOrderId === o.id ? 'expand_less' : 'expand_more'"
                      class="q-ma-none text-weight-bold"
                    >
                      {{ selectedOrderId === o.id ? 'Fechar' : 'Acompanhar' }}
                    </q-chip>
                  </div>
                </div>
              </q-card-section>

              <template v-if="selectedOrderId === o.id">
                <q-separator />
                <q-card-section class="q-gutter-y-md">
                  <!-- Cabeçalho do status -->
                  <div class="row items-center justify-between">
                    <div>
                      <div class="row items-center q-gutter-x-sm">
                        <span class="pulse-dot bg-positive" />
                        <div class="text-caption text-weight-bold text-uppercase">Estado do Pedido #{{ o.id }}</div>
                      </div>
                      <div class="text-caption text-positive text-weight-bold text-uppercase status-sub">
                        {{ o.status === 'delivered' ? `Entregue por: ${o.nomeLoja}` : `Preparado por: ${o.nomeLoja}` }}
                      </div>
                    </div>
                    <span class="text-caption text-grey-6 font-mono">{{ new Date(o.date).toLocaleDateString('pt-BR') }}</span>
                  </div>
                  <q-separator />

                  <!-- Linha do tempo -->
                  <q-timeline color="grey-5" class="q-px-sm">
                    <q-timeline-entry
                      v-for="st in timelineSteps"
                      :key="st.step"
                      :icon="st.icon"
                      :color="getStepNumber(o.status) >= st.step ? st.color : 'grey-5'"
                      :class="{ 'step-inactive': getStepNumber(o.status) < st.step }"
                    >
                      <template #title>
                        <span class="text-caption text-weight-bold">{{ st.title }}</span>
                      </template>
                      <div class="text-caption text-grey-6">{{ st.subtitle }}</div>
                    </q-timeline-entry>
                  </q-timeline>
                  <!-- Confirmação de recebimento (só depois que o pedido saiu para entrega) -->
                  <template v-if="o.status === 'delivery'">
                    <q-separator />
                    <div class="column items-center text-center q-gutter-y-sm">
                      <div class="text-caption text-grey-6 text-uppercase">Seu pedido chegou?</div>
                      <q-btn
                        :id="`btn-confirm-receipt-${o.id}`"
                        unelevated
                        no-caps
                        color="secondary"
                        text-color="dark"
                        class="text-weight-bolder text-uppercase confirm-btn"
                        label="Confirmar recebimento ✅"
                        @click="handleConfirmReceipt(o)"
                      />
                    </div>
                  </template>

                  <!-- Cancelamento: disponível até o pedido sair para entrega -->
                  <template v-if="podeCancelar(o)">
                    <q-separator />
                    <div class="column items-center text-center q-gutter-y-xs">
                      <q-btn
                        :id="`btn-cancel-order-${o.id}`"
                        outline
                        no-caps
                        color="negative"
                        icon="cancel"
                        class="text-weight-bold"
                        label="Cancelar pedido"
                        @click="abrirCancelamento(o)"
                      />
                      <div class="text-caption text-grey-6">Você pode cancelar até o pedido sair para entrega.</div>
                    </div>
                  </template>

                  <!-- Campo Pedidos -->
                  <q-card flat bordered class="summary-card">
                    <q-card-section class="q-gutter-y-sm">
                      <div class="row items-center justify-between">
                        <div class="row items-center q-gutter-x-sm">
                          <q-icon name="shopping_bag" color="positive" size="18px" />
                          <div class="text-caption text-weight-bold text-uppercase">Campo Pedidos</div>
                        </div>
                        <q-badge color="positive" text-color="white" :label="`${o.items.length} ${o.items.length === 1 ? 'item' : 'itens'}`" />
                      </div>
                      <q-separator />

                      <div v-for="item in o.items" :key="item.itemId" class="row items-center justify-between text-caption">
                        <span class="text-grey-6">{{ item.quantity }}x <span class="item-name">{{ formatItemName(item.name) }}</span></span>
                        <span class="font-mono text-weight-medium">R$ {{ (item.price * item.quantity).toFixed(2) }}</span>
                      </div>
                      <q-separator />

                      <div class="q-gutter-y-xs text-caption text-grey-6">
                        <div class="row justify-between">
                          <span>Taxa de Entrega</span>
                          <span>R$ {{ o.taxaEntrega.toFixed(2) }}</span>
                        </div>
                        <div v-if="o.descontoPontos > 0" class="row justify-between text-positive text-weight-medium">
                          <span>Desconto de Pontos</span>
                          <span>- R$ {{ o.descontoPontos.toFixed(2) }}</span>
                        </div>
                        <q-separator />
                        <div class="row justify-between items-center text-weight-bold text-body2">
                          <span class="text-grey-6">Total Pago</span>
                          <span class="text-secondary font-mono text-subtitle1">R$ {{ o.total.toFixed(2) }}</span>
                        </div>
                      </div>
                    </q-card-section>
                  </q-card>
                </q-card-section>
              </template>
            </q-card>
          </div>
        </div>

        <!-- Prontos e finalizados -->
        <div v-if="orderFilter === 'all' || orderFilter === 'delivered'" :class="['grupo-pedidos grupo-pedidos--finalizados q-gutter-y-sm', { 'grupo-pedidos--separado': orderFilter === 'all' }]">
          <div class="grupo-pedidos__titulo row items-center justify-between no-wrap">
            <div class="row items-center no-wrap">
              <q-icon name="task_alt" color="grey-6" size="20px" class="q-mr-sm" />
              <span class="text-subtitle2 text-weight-bold text-uppercase">Pedidos finalizados</span>
              <q-badge color="grey-6" text-color="white" rounded class="q-ml-sm" :label="filteredCompletedOrders.length" />
            </div>
            <span v-if="filteredCompletedOrders.length > 0" class="text-caption text-grey-6">Histórico concluído</span>
          </div>

          <q-card v-if="filteredCompletedOrders.length === 0" flat bordered>
            <q-card-section class="text-center text-caption text-grey-6">
              Nenhum pedido finalizado correspondente.
            </q-card-section>
          </q-card>

          <div v-else class="desk-grid desk-grid--2">
            <q-card
              v-for="o in displayedCompletedOrders"
              :id="`order-card-completed-${o.id}`"
              :key="o.id"
              flat
              bordered
              :class="['order-card', { 'order-card--open': selectedCompletedOrderId === o.id }]"
            >
              <q-card-section class="cursor-pointer" @click="toggleCompletedExpansion(o.id)">
                <div class="row items-start justify-between no-wrap q-col-gutter-sm">
                  <div class="col ellipsis-container">
                    <div class="row items-center q-gutter-x-sm">
                      <span class="text-caption text-weight-bold font-mono text-grey-8">Pedido #{{ o.id }}</span>
                      <q-badge
                        :color="o.status === 'cancelled' ? 'negative' : 'grey-4'"
                        :text-color="o.status === 'cancelled' ? 'white' : 'grey-8'"
                        class="text-uppercase"
                        :label="o.status === 'cancelled' ? 'Cancelado' : 'Entregue'"
                      />
                    </div>
                    <div class="text-caption text-weight-bold ellipsis q-mt-xs">{{ o.nomeLoja }}</div>
                    <div class="text-caption text-grey-6 ellipsis">
                      <strong class="text-grey-7">Campo Pedidos:</strong>
                      {{ o.items.map(i => `${i.quantity}x ${formatItemName(i.name)}`).join(', ') }}
                    </div>
                    <div class="text-caption text-grey-6 font-mono">
                      {{ new Date(o.date).toLocaleDateString('pt-BR') }} · {{ o.items.length }} {{ o.items.length === 1 ? 'item' : 'itens' }}
                    </div>

                    <div v-if="o.status === 'cancelled'" class="row items-center no-wrap q-gutter-x-xs q-mt-sm text-negative text-caption text-weight-bold">
                      <q-icon name="cancel" size="16px" />
                      <span>Pedido cancelado por você{{ o.motivoCancelamento ? `: ${o.motivoCancelamento}` : '.' }}</span>
                    </div>
                    <!-- Etapas do pedido (todas concluídas) -->
                    <div v-else class="pipeline row no-wrap items-start q-mt-sm">
                      <template v-for="(st, idx) in timelineSteps" :key="st.step">
                        <div class="pipeline__etapa column items-center text-center">
                          <q-avatar size="26px" font-size="15px" :icon="st.icon" color="positive" text-color="white" />
                          <span class="pipeline__rotulo text-weight-bold">{{ etapasCurtas[idx] }}</span>
                        </div>
                        <div v-if="idx < timelineSteps.length - 1" class="pipeline__linha pipeline__linha--ativa" />
                      </template>
                    </div>
                  </div>

                  <div class="column items-end q-gutter-y-xs">
                    <span class="text-caption text-weight-bold font-mono text-grey-7">R$ {{ o.total.toFixed(2) }}</span>
                    <q-chip
                      dense
                      square
                      size="sm"
                      color="grey-3"
                      text-color="grey-8"
                      :icon-right="selectedCompletedOrderId === o.id ? 'expand_less' : 'expand_more'"
                      class="q-ma-none text-weight-bold"
                    >
                      {{ selectedCompletedOrderId === o.id ? 'Fechar' : 'Detalhes' }}
                    </q-chip>
                  </div>
                </div>
              </q-card-section>

              <template v-if="selectedCompletedOrderId === o.id">
                <q-separator />
                <q-card-section class="q-gutter-y-md details-section">
                  <!-- Avaliação (pedido cancelado não é avaliado) -->
                  <q-card v-if="o.status === 'delivered'" flat bordered>
                    <q-card-section class="q-pa-sm">
                      <div v-if="o.notaComida" class="q-gutter-y-sm">
                        <div class="row items-center justify-between">
                          <span class="row items-center q-gutter-x-xs text-caption text-weight-bold text-uppercase text-positive">
                            <q-icon name="star" size="16px" />
                            <span>Pedido Avaliado</span>
                          </span>
                          <q-btn
                            v-if="canEvaluateOrder(o)"
                            flat
                            dense
                            no-caps
                            size="sm"
                            color="warning"
                            class="text-weight-bold"
                            label="Editar Avaliação"
                            @click="handleOpenRating(o)"
                          />
                          <span v-else class="row items-center q-gutter-x-xs text-caption text-grey-6">
                            <q-icon name="schedule" size="14px" />
                            <span>Prazo encerrado (>1h)</span>
                          </span>
                        </div>
                        <div class="row q-col-gutter-sm">
                          <div class="col-12">
                            <div class="rating-box q-pa-sm rounded-borders">
                              <div class="text-caption text-grey-6 text-uppercase">Comida:</div>
                              <div class="row items-center q-gutter-x-sm">
                                <q-rating :model-value="o.notaComida" size="1.1em" color="amber-7" icon="star" readonly />
                                <span class="text-weight-bold text-amber-8 font-mono text-caption">{{ o.notaComida }} ★</span>
                              </div>
                              <div v-if="o.comentarioComida" class="text-caption text-grey-6 text-italic ellipsis">"{{ o.comentarioComida }}"</div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div v-else>
                        <div v-if="canEvaluateOrder(o)" class="row items-center justify-between no-wrap q-gutter-x-sm">
                          <div class="column">
                            <div class="text-caption text-grey-6 text-weight-medium">Avalie sua experiência com este pedido:</div>
                            <span class="text-caption text-positive font-mono">Restam ~{{ getRemainingRatingMinutes(o) }} min para avaliar</span>
                          </div>
                          <q-btn
                            :id="`btn-rate-order-${o.id}`"
                            unelevated
                            dense
                            no-caps
                            color="amber-9"
                            text-color="dark"
                            icon="star"
                            label="Avaliar"
                            class="text-caption text-weight-bold q-px-sm text-uppercase"
                            @click="handleOpenRating(o)"
                          />
                        </div>

                        <div v-else class="row items-center justify-between no-wrap q-gutter-x-sm">
                          <div class="row items-center no-wrap q-gutter-x-sm text-grey-6">
                            <q-icon name="schedule" size="18px" />
                            <div>
                              <div class="text-caption text-weight-bold">Prazo de avaliação expirado</div>
                              <div class="text-caption text-grey-6">Avaliações só podem ser feitas em até 1h após a entrega.</div>
                            </div>
                          </div>
                          <q-badge color="grey-9" text-color="grey-5" class="q-pa-xs font-mono">Indisponível</q-badge>
                        </div>
                      </div>
                    </q-card-section>
                  </q-card>

                  <!-- Itens detalhados -->
                  <q-card flat bordered>
                    <q-card-section class="q-pa-sm q-gutter-y-sm">
                      <div class="row items-center justify-between">
                        <span class="text-caption text-weight-bold text-uppercase">Itens do Pedido</span>
                        <span class="text-caption text-grey-6 font-mono">{{ o.items.length }} {{ o.items.length === 1 ? 'item' : 'itens' }}</span>
                      </div>
                      <q-separator />
                      <div v-for="item in o.items" :key="item.itemId" class="row items-center justify-between text-caption">
                        <span class="text-grey-6">{{ item.quantity }}x <span class="item-name">{{ formatItemName(item.name) }}</span></span>
                        <span class="font-mono text-grey-7">R$ {{ (item.price * item.quantity).toFixed(2) }}</span>
                      </div>
                      <q-separator />
                      <div class="q-gutter-y-xs text-caption text-grey-6">
                        <div class="row justify-between">
                          <span>Taxa de Entrega</span>
                          <span>R$ {{ o.taxaEntrega.toFixed(2) }}</span>
                        </div>
                        <div v-if="o.descontoPontos > 0" class="row justify-between text-positive text-weight-medium">
                          <span>Desconto de Pontos</span>
                          <span>- R$ {{ o.descontoPontos.toFixed(2) }}</span>
                        </div>
                        <q-separator />
                        <div class="row justify-between items-center text-weight-bold text-body2">
                          <span>Total Pago</span>
                          <span class="font-mono text-secondary">R$ {{ o.total.toFixed(2) }}</span>
                        </div>
                      </div>
                    </q-card-section>
                  </q-card>
                </q-card-section>
              </template>
            </q-card>

            <!-- Ver mais -->
            <div v-if="filteredCompletedOrders.length > 3" class="q-pt-xs">
              <q-btn
                id="btn-toggle-show-more-completed"
                outline
                no-caps
                color="grey-7"
                class="full-width text-weight-bold"
                @click="showAllCompletedOrders = !showAllCompletedOrders"
              >
                <template v-if="!showAllCompletedOrders">
                  <span>Ver histórico completo</span>
                  <q-badge color="grey-5" text-color="white" rounded class="q-ml-sm" :label="`+${remainingCompletedOrdersCount}`" />
                  <q-icon name="expand_more" right />
                </template>
                <template v-else>
                  <span>Mostrar menos</span>
                  <q-icon name="expand_less" right />
                </template>
              </q-btn>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- Rodapé -->
    <div class="row justify-center q-pa-md status-footer no-print">
      <q-btn
        id="btn-status-go-dashboard"
        outline
        rounded
        no-caps
        color="grey-7"
        class="full-width text-weight-bold text-uppercase footer-btn"
        label="Voltar ao Início"
        @click="setScreen('dashboard')"
      />
    </div>

    <!-- Modal de avaliação -->
    <!-- Confirmação de cancelamento -->
    <q-dialog :model-value="!!pedidoParaCancelar" persistent @update:model-value="(v) => { if (!v) pedidoParaCancelar = null }">
      <q-card id="dialog-cancelar-pedido" style="width: 420px; max-width: 92vw">
        <q-card-section class="row items-center no-wrap q-gutter-x-sm">
          <q-avatar icon="cancel" color="negative" text-color="white" size="40px" />
          <div>
            <div class="text-subtitle1 text-weight-bold">Cancelar pedido #{{ pedidoParaCancelar?.id }}?</div>
            <div class="text-caption text-grey-7">A loja será avisada e o pedido não será entregue.</div>
          </div>
        </q-card-section>
        <q-card-section class="q-pt-none">
          <q-input
            id="input-motivo-cancelamento"
            v-model="motivoCancelamento"
            outlined
            dense
            autogrow
            maxlength="300"
            label="Motivo (opcional)"
            placeholder="Ex.: pedi por engano, mudei de endereço..."
          />
          <div class="text-caption text-grey-6 q-mt-sm">
            Depois que o pedido sair para entrega, não será mais possível cancelar.
          </div>
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn id="btn-cancelar-voltar" flat no-caps color="grey-7" label="Manter pedido" :disable="cancelando" @click="pedidoParaCancelar = null" />
          <q-btn id="btn-cancelar-confirmar" unelevated no-caps color="negative" class="text-weight-bold" label="Sim, cancelar" :loading="cancelando" @click="confirmarCancelamento" />
        </q-card-actions>
      </q-card>
    </q-dialog>

  </q-page>
</template>

<style scoped lang="scss">
.status-page {
  min-height: 100%;
  width: 100%;
  min-width: 0;
  overflow-x: hidden;
  background: #f5f7f8;
}

.status-header,
.status-footer {
  background: #fff;
}

// Notebook: cartão aberto ocupa a linha inteira; botão de rodapé não estica
@media (min-width: 1024px) {
  .order-card--open { grid-column: 1 / -1; }
  .status-page .col { padding: 24px 32px; }
  .status-header { padding: 16px 32px; }
  .footer-btn { max-width: 320px; }
  .order-card--open :deep(.q-timeline) { max-width: 560px; }
}

.status-header {
  border-bottom: 1px solid rgba(128, 128, 128, 0.25);
}

.status-footer {
  border-top: 1px solid rgba(128, 128, 128, 0.25);
}

.footer-btn {
  max-width: 384px;
}

.pulse-dot,
.static-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.pulse-dot {
  animation: status-pulse 1.6s ease-in-out infinite;
}

@keyframes status-pulse {
  50% {
    opacity: 0.4;
  }
}

.empty-state {
  min-height: 50vh;
}

.empty-text {
  max-width: 320px;
}

.empty-avatar {
  border: 1px solid rgba(128, 128, 128, 0.25);
}

.ellipsis-container {
  min-width: 0;
  word-break: break-word;
}

.status-header {
  flex-wrap: wrap;
  gap: 4px;
}

.status-sub {
  letter-spacing: 0.02em;
}

.order-card {
  min-width: 0;
  overflow: hidden;
  transition: border-color 0.3s;

  &--selected {
    border-color: var(--q-positive);
  }
}

.step-inactive {
  opacity: 0.4;
}

.confirm-btn {
  max-width: 384px;
}

.rating-box {
  background: rgba(0, 0, 0, 0.05);
}

.summary-card,
.details-section {
  background: transparent;
}

.scroll-x {
  overflow-x: auto;
}

.body--dark {
  .status-page {
    background: #040c13;
  }

  .status-header,
  .status-footer {
    background: #08121e;
    border-color: #1e293b;
  }

  .rating-box {
    background: rgba(0, 0, 0, 0.2);
  }

  .item-name {
    color: #e2e8f0;
  }
}

.item-name {
  color: #1e293b;
}

.pipeline {
  max-width: 420px;
}
.pipeline__etapa {
  width: 64px;
  flex: none;
}
.pipeline__rotulo {
  font-size: 10.5px;
  line-height: 1.15;
  margin-top: 3px;
}
.pipeline__linha {
  flex: 1 1 12px;
  min-width: 12px;
  align-self: flex-start;
  height: 3px;
  margin-top: 11px;
  border-radius: 2px;
  background: rgba(128, 128, 128, 0.3);
  &--ativa {
    background: var(--q-positive);
  }
}
.pipeline__etapa--atual .pipeline__rotulo {
  color: var(--q-secondary);
}

.grupo-pedidos__titulo {
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.3);
}
.grupo-pedidos--andamento .grupo-pedidos__titulo {
  border-bottom-color: rgba(33, 186, 69, 0.55);
}
.grupo-pedidos--separado {
  margin-top: 32px;
  padding-top: 24px;
  border-top: 2px solid rgba(148, 163, 184, 0.35);
}
</style>