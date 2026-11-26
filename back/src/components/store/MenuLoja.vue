<script setup>
// Apresenta as abas de navegação da loja e encaminha a seleção ou o encerramento da sessão.
// Menu inferior do perfil Loja, no mesmo formato dos outros perfis
// (cartão fixo embaixo com abas de ícone + rótulo). Os botões são só da loja.
defineProps({
  modelValue: { type: String, default: "dashboard" },
  pedidosPendentes: { type: Number, default: 0 },
  consultasPendentes: { type: Number, default: 0 }
});
// Eventos emitidos para o componente pai executar as ações fora desta interface.
const emit = defineEmits(["update:modelValue", "logout"]);

const abas = [
  { nome: "dashboard", icone: "dashboard", rotulo: "Início" },
  { nome: "orders", icone: "assignment", rotulo: "Pedidos", selo: "pedidos" },
  { nome: "published", icone: "inventory_2", rotulo: "Catálogo" },
  { nome: "pricing", icone: "bolt", rotulo: "Preços" },
  { nome: "donations", icone: "volunteer_activism", rotulo: "Doações", selo: "consultas" },
  { nome: "quality", icone: "verified", rotulo: "Qualidade" },
  { nome: "reports", icone: "description", rotulo: "Relatório" }
];

// Ações da tela validam a interação e encaminham as alterações ou eventos necessários.
const aoTrocar = (nome) => {
  if (nome === "logout") emit("logout");
  else emit("update:modelValue", nome);
};
</script>

<template>
<!-- Interface principal: apresenta as abas de navegação da loja e encaminha a seleção ou o encerramento da sessão. -->
  <q-card flat square class="footer-tabs">
    <q-separator />
    <q-tabs
      :model-value="modelValue"
      no-caps
      mobile-arrows
      align="justify"
      active-color="secondary"
      indicator-color="transparent"
      class="menu-loja text-grey-7"
      @update:model-value="aoTrocar"
    >
      <q-tab v-for="aba in abas" :id="`tab-store-${aba.nome}`" :key="aba.nome" :name="aba.nome" :icon="aba.icone" :label="aba.rotulo">
        <q-badge
          v-if="aba.selo === 'pedidos' && pedidosPendentes > 0"
          color="secondary"
          floating
          title="Pedidos aguardando a loja"
        >{{ pedidosPendentes }}</q-badge>
        <q-badge
          v-if="aba.selo === 'consultas' && consultasPendentes > 0"
          color="secondary"
          floating
          title="Consultas aguardando resposta"
        >{{ consultasPendentes }}</q-badge>
      </q-tab>
      <q-tab id="tab-store-logout" name="logout" icon="logout" label="Sair" class="text-negative" />
    </q-tabs>
  </q-card>
</template>

<style scoped lang="scss">
.footer-tabs {
  // fixo na parte de baixo da tela, igual aos outros perfis
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
// Botões maiores: ícone e texto mais fáceis de ver e de tocar.
.menu-loja :deep(.q-tab) {
  min-height: 68px;
  min-width: 64px;
  padding: 0 8px;
}
.menu-loja :deep(.q-tab__icon) {
  font-size: 28px;
}
.menu-loja :deep(.q-tab__label) {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
</style>