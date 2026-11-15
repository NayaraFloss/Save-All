<script setup>
// Menu fixo de baixo do cliente (Início, Pedir, Pedidos, Acompanhar). O perfil abre pelo nome no topo. Aparece em todas as telas do cliente.
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { useAppStore } from "../stores/estadoApp";

const route = useRoute();
const router = useRouter();
const { orders } = storeToRefs(useAppStore());
const appStore = useAppStore();

const pedidosEmAndamento = computed(() => orders.value.filter((o) => o.status !== "delivered").length);

const abaAtiva = computed(() => {
  switch (route.name) {
    case "ListaLojas":
    case "ListaAlimentos":
    case "SelecaoEndereco":
    case "FinalizarPedido":
      return "order";
    case "StatusPedido":
      return route.query.aba === "acompanhar" ? "track" : "history";
    case "PainelConsumidor":
      // O perfil abre pelo nome no topo; no painel inicial destaca o acompanhamento se houver pedido em andamento
      if (route.query.aba === "profile") return "";
      return "home";
    default:
      return "";
  }
});

const irInicio = () => {
  if (route.name === "PainelConsumidor" && !route.query.aba) {
    appStore.pedirInicio();
    return;
  }
  router.push({ name: "PainelConsumidor" });
};

const ir = (nome, query = {}) => {
  if (route.name === nome && JSON.stringify(route.query) === JSON.stringify(query)) return;
  router.push({ name: nome, query });
};
</script>

<template>
  <q-card flat square class="menu-cliente no-print">
    <q-separator />
    <q-tabs
      :model-value="abaAtiva"
      no-caps
      mobile-arrows
      align="justify"
      active-color="secondary"
      indicator-color="transparent"
      class="menu-cliente__abas text-grey-7"
    >
      <q-tab id="tab-home" name="home" icon="home" label="Início" @click="irInicio" />
      <q-tab id="tab-order" name="order" icon="add_circle" label="Pedir" @click="ir('ListaLojas')" />
      <q-tab id="tab-history" name="history" icon="assignment" label="Pedidos" @click="ir('StatusPedido', { aba: 'historico' })" />
      <q-tab id="tab-track" name="track" icon="local_shipping" label="Acompanhar" @click="ir('StatusPedido', { aba: 'acompanhar' })">
        <q-badge v-if="pedidosEmAndamento > 0" color="secondary" floating title="Pedido em andamento">{{ pedidosEmAndamento }}</q-badge>
      </q-tab>
    </q-tabs>
  </q-card>
</template>

<style scoped lang="scss">
.menu-cliente {
  // fixo na parte de baixo da tela: não acompanha a rolagem
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  width: 100%;
  max-width: var(--shell-max, 100%);
  margin: 0 auto;
  z-index: 1000;
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
// Botões do mesmo tamanho dos outros perfis, distribuídos por toda a largura
.menu-cliente__abas :deep(.q-tab) {
  min-height: 68px;
  min-width: 64px;
  padding: 0 8px;
}
.menu-cliente__abas :deep(.q-tab__icon) {
  font-size: 28px;
}
.menu-cliente__abas :deep(.q-tab__label) {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
// Sem a caixa cinza que aparecia atrás da aba ao passar o mouse ou clicar
.menu-cliente__abas :deep(.q-focus-helper) {
  display: none;
}
</style>