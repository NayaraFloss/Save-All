<script setup>
// Resume os principais totais da loja e encaminha a pessoa para os detalhes correspondentes.
import { computed } from "vue";

// Quatro contadores do início da loja. Cada cartão leva para a tela correspondente.
const props = defineProps({
  orders: { type: Array, default: () => [] },
  foods: { type: Array, default: () => [] },
  lojaId: { type: String, default: "" },
  modoEscuro: Boolean
});
// Eventos emitidos para o componente pai executar as ações fora desta interface.
const emit = defineEmits(["abrir"]);

const EM_ANDAMENTO = ["accepted", "preparing", "delivery"];

// Valores derivados das entradas e do estado para manter a apresentação sincronizada.
const cartoes = computed(() => [
  {
    chave: "novos", rotulo: "Novos pedidos", icone: "notifications_active", cor: "#fb8c00", fundo: "rgba(251,140,0,0.14)",
    valor: props.orders.filter((o) => o.status === "pending").length, destino: "orders"
  },
  {
    chave: "andamento", rotulo: "Em andamento", icone: "local_shipping", cor: "#1976d2", fundo: "rgba(25,118,210,0.14)",
    valor: props.orders.filter((o) => EM_ANDAMENTO.includes(o.status)).length, destino: "orders"
  },
  {
    chave: "concluidos", rotulo: "Concluídos", icone: "check_circle", cor: "#21ba45", fundo: "rgba(33,186,69,0.14)",
    valor: props.orders.filter((o) => o.status === "delivered").length, destino: "orders"
  },
  {
    chave: "catalogo", rotulo: "Itens no catálogo", icone: "bakery_dining", cor: "#f2a900", fundo: "rgba(242,169,0,0.16)",
    valor: props.foods.filter((f) => f.lojaId === props.lojaId && f.status === "active").length, destino: "published"
  }
]);
</script>

<template>
<!-- Interface principal: resume os principais totais da loja e encaminha a pessoa para os detalhes correspondentes. -->
  <div class="contadores">
    <q-card
      v-for="c in cartoes"
      :id="`contador-${c.chave}`"
      :key="c.chave"
      flat
      bordered
      :dark="modoEscuro"
      class="contador cursor-pointer"
      @click="emit('abrir', c.destino)"
    >
      <q-card-section class="row items-center no-wrap q-gutter-x-md">
        <q-avatar size="46px" :style="{ background: c.fundo, color: c.cor }" :icon="c.icone" />
        <div>
          <div class="contador-valor text-weight-bold" :style="{ color: c.cor }">{{ c.valor }}</div>
          <div class="text-caption text-weight-bold text-uppercase text-grey-7 contador-rotulo">{{ c.rotulo }}</div>
        </div>
      </q-card-section>
    </q-card>
  </div>
</template>

<style scoped lang="scss">
.contadores {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}
.contador {
  border-radius: 14px;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.1);
  }
}
.contador-valor {
  font-size: 30px;
  line-height: 1;
}
.contador-rotulo {
  letter-spacing: 0.06em;
  margin-top: 4px;
}
@media (min-width: 900px) {
  .contadores {
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
  }
}
</style>
