<script setup>
import { ref, computed } from "vue";
const props = defineProps({ darkMode: Boolean, storeOrders: { type: Array, default: () => [] }, orders: { type: Array, default: () => [] }, lojaId: String });
const emit = defineEmits(["status-updated", "refresh-orders", "update-status"]);
const orderPipelineTab = ref("pending");
const filteredOrders = computed(() => {
  return props.storeOrders.filter((o) => o.status === orderPipelineTab.value);
});
const getCount = (status) => {
  return props.storeOrders.filter((o) => o.status === status).length;
};
</script>

<template>
  <div class="column q-gutter-y-md">
    <!-- Header info -->
    <q-card flat bordered>
      <q-card-section class="row items-center justify-between no-wrap q-gutter-x-md">
        <div class="col">
          <div class="text-caption text-uppercase text-weight-bold text-secondary header-title">Gerenciador de Pedidos</div>
          <div class="text-caption text-grey-7">Avance os pedidos recebidos: Novos ➔ No Preparo ➔ A Caminho.</div>
        </div>
        <div class="row items-center q-gutter-x-sm no-wrap">
          <q-btn flat round dense color="grey-7" icon="refresh" @click="emit('refresh-orders')">
            <q-tooltip>Recarregar</q-tooltip>
          </q-btn>
        </div>
      </q-card-section>
    </q-card>

    <!-- STATUS BAR PILLS -->
    <q-card flat bordered>
      <q-tabs
        v-model="orderPipelineTab"
        dense
        no-caps
        active-color="primary"
        indicator-color="primary"
        class="text-grey-7"
        align="justify"
        narrow-indicator
      >
        <q-tab name="pending" :label="`Novos (${getCount('pending')})`" class="text-weight-bold" />
        <q-tab name="preparing" :label="`No Preparo (${getCount('preparing')})`" class="text-weight-bold" />
        <q-tab name="delivery" :label="`A Caminho (${getCount('delivery')})`" class="text-weight-bold" />
        <q-tab name="delivered" :label="`Entregues (${getCount('delivered')})`" class="text-weight-bold" />
      </q-tabs>
    </q-card>

    <!-- PIPELINE RENDERING -->
    <q-card v-if="filteredOrders.length === 0" flat bordered>
      <q-card-section class="column items-center text-center q-pa-xl">
        <div class="text-h4 q-mb-xs">
          <span v-if="orderPipelineTab === 'pending'">💤</span>
          <span v-else-if="orderPipelineTab === 'preparing'">👩‍🍳</span>
          <span v-else-if="orderPipelineTab === 'delivery'">🛵</span>
          <span v-else>✅</span>
        </div>
        <div class="text-caption text-grey-6">Nenhum pedido nesta fase no momento. Os pedidos dos clientes aparecem aqui assim que são feitos.</div>

      </q-card-section>
    </q-card>

    <q-card
      v-for="order in filteredOrders"
      :key="order.id"
      bordered
      :class="['order-card', `order-card--${orderPipelineTab}`]"
    >
      <q-card-section>
        <div class="row justify-between items-start no-wrap">
          <div class="col">
            <q-badge
              v-if="orderPipelineTab === 'pending'"
              outline
              color="secondary"
              class="text-weight-bold"
              :label="`🚨 NOVO PEDIDO #${order.id}`"
            />
            <q-badge
              v-else-if="orderPipelineTab === 'preparing'"
              outline
              color="indigo"
              class="text-weight-bold"
              :label="`👩‍🍳 EM PREPARO #${order.id}`"
            />
            <q-badge
              v-else-if="orderPipelineTab === 'delivery'"
              outline
              color="blue"
              class="text-weight-bold"
              :label="`🛵 A CAMINHO #${order.id}`"
            />
            <q-badge v-else outline color="grey-7" class="text-weight-bold" :label="`Pedido #${order.id}`" />

            <div class="text-subtitle2 text-weight-bold q-mt-sm">{{ order.nomeCliente }}</div>
            <div class="text-caption text-grey-7 ellipsis">{{ order.address }}</div>
            <div v-if="order.nomeEntregador" class="q-mt-sm">
              <q-badge outline :color="order.tipoEntregador === 'internal' ? 'blue' : 'indigo'" class="text-weight-bold">
                🛵 {{ order.nomeEntregador }} ({{ order.tipoEntregador === 'internal' ? 'Próprio' : 'Compartilhado' }})
              </q-badge>
            </div>
          </div>
          <div class="text-caption text-grey-7">
            {{ new Date(order.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
          </div>
        </div>
      </q-card-section>

      <!-- Order Items -->
      <q-card-section class="q-pt-none">
        <div class="order-items rounded-borders q-pa-md">
          <div v-for="(it, idx) in order.items" :key="idx" class="row justify-between q-mb-xs">
            <span class="text-weight-medium">{{ it.quantity }}x {{ it.name }}</span>
            <span class="text-grey-7 text-weight-medium">R$ {{ (it.price * it.quantity).toFixed(2) }}</span>
          </div>
          <q-separator class="q-my-sm" />
          <div class="row justify-between text-weight-bold text-secondary">
            <span>Total Pago:</span>
            <span>R$ {{ order.total.toFixed(2) }}</span>
          </div>
        </div>
      </q-card-section>

      <!-- Action Button for status transitions -->
      <q-card-actions v-if="order.status !== 'delivered'" class="q-px-md q-pb-md q-pt-none">
        <q-btn
          class="full-width text-weight-bold"
          unelevated
          no-caps
          :color="order.status === 'pending' ? 'secondary' : order.status === 'preparing' ? 'indigo' : 'primary'"
          @click="emit('update-status', order.id, order.status)"
        >
          <span v-if="order.status === 'pending'">👩‍🍳 Começar Preparo na Loja</span>
          <span v-else-if="order.status === 'preparing'">🛵 Pedido Pronto: Sair para Entrega</span>
          <span v-else>✅ Motoboy Entregou o Pedido!</span>
        </q-btn>
      </q-card-actions>
    </q-card>
  </div>
</template>

<style scoped lang="scss">
.header-title {
  letter-spacing: 0.1em;
}
.order-card {
  &--pending { border-color: var(--q-secondary); }
  &--preparing { border-color: var(--q-info); }
  &--delivery { border-color: var(--q-primary); }
}
.order-items {
  background: rgba(128, 128, 128, 0.1);
}
</style>
