<script setup>
// Exibe o resumo inicial da loja com os dados necessários para orientar suas próximas ações.
import { ref, computed } from "vue";
import { resumoLoja } from "../../utils/resumoLoja";

// Entradas recebidas do componente pai que configuram os dados e opções desta tela.
const props = defineProps({
  orders: { type: Array, default: () => [] },
  disposals: { type: Array, default: () => [] },
  modoEscuro: Boolean
});

// Estado local reativo usado para acompanhar seleções, formulários e etapas da interface.
const periodo = ref(7);
// Valores derivados das entradas e do estado para manter a apresentação sincronizada.
const resumo = computed(() => resumoLoja({ orders: props.orders, disposals: props.disposals, dias: periodo.value }));

// Ações da tela validam a interação e encaminham as alterações ou eventos necessários.
const dinheiro = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const quilos = (v) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg`;
const unidades = (v) => `${v} un`;

// Cada bloco do resumo: o que mostrar e como formatar.
const cartoes = computed(() => [
  { chave: "vendidos", titulo: "Produtos vendidos", legenda: "Pedidos entregues", icone: "shopping_bag", cor: "#21ba45", formatar: unidades },
  { chave: "faturado", titulo: "Lucro faturado", legenda: "Vendas concluídas", icone: "payments", cor: "#f2a900", formatar: dinheiro },
  { chave: "doacao", titulo: "Doações", legenda: "Enviado a entidades", icone: "volunteer_activism", cor: "#00a3a3", formatar: quilos },
  { chave: "descarte", titulo: "Descarte", legenda: "Não aproveitado", icone: "delete_outline", cor: "#c10015", formatar: quilos }
].map((c) => ({ ...c, dados: resumo.value[c.chave] })));

const semMovimento = computed(() => cartoes.value.every((c) => c.dados.total === 0));

// Altura da barra em % (barra mínima visível mesmo quando o dia é zero).
const altura = (valor, serie) => {
  const maior = Math.max(...serie);
  if (!maior || valor <= 0) return 4;
  return Math.max(10, Math.round((valor / maior) * 100));
};
</script>

<template>
<!-- Interface principal: exibe o resumo inicial da loja com os dados necessários para orientar suas próximas ações. -->
  <q-card flat bordered :dark="modoEscuro" class="resumo-card">
    <q-card-section class="q-pb-sm">
      <div class="row items-center justify-between no-wrap">
        <div>
          <div class="text-subtitle2 text-weight-bold text-uppercase">Resumo da loja</div>
          <div class="text-caption text-grey-6">Últimos {{ periodo }} dias</div>
        </div>
        <q-btn-toggle
          v-model="periodo"
          dense
          no-caps
          unelevated
          toggle-color="positive"
          color="grey-3"
          text-color="grey-8"
          :options="[
            { label: '7 dias', value: 7 },
            { label: '30 dias', value: 30 }
          ]"
        />
      </div>
    </q-card-section>

    <q-card-section class="q-pt-none">
      <div class="resumo-grid">
        <q-card v-for="c in cartoes" :key="c.chave" flat bordered :dark="modoEscuro" class="mini-card">
          <q-card-section class="q-pa-sm">
            <div class="row items-center no-wrap q-gutter-x-xs">
              <q-icon :name="c.icone" size="18px" :style="{ color: c.cor }" />
              <span class="text-caption text-uppercase text-weight-bold text-grey-7 ellipsis">{{ c.titulo }}</span>
            </div>
            <div class="mini-valor text-weight-bolder q-mt-xs" :style="{ color: c.cor }">
              {{ c.formatar(c.dados.total) }}
            </div>
            <div class="mini-bars" role="img" :aria-label="`${c.titulo}: ${c.formatar(c.dados.total)} nos últimos ${periodo} dias`">
              <div
                v-for="(v, i) in c.dados.serie"
                :key="i"
                class="mini-bar"
                :style="{ height: altura(v, c.dados.serie) + '%', background: c.cor, opacity: v > 0 ? 1 : 0.25 }"
                :title="`${resumo.rotulos[i]}: ${c.formatar(v)}`"
              />
            </div>
            <div class="row justify-between text-grey-6 mini-eixo">
              <span>{{ resumo.rotulos[0] }}</span>
              <span>{{ c.legenda }}</span>
              <span>{{ resumo.rotulos[resumo.rotulos.length - 1] }}</span>
            </div>
          </q-card-section>
        </q-card>
      </div>

      <div v-if="semMovimento" class="text-caption text-grey-6 text-center q-mt-sm">
        Ainda não há vendas, doações ou descartes neste período.
      </div>
    </q-card-section>
  </q-card>
</template>

<style scoped lang="scss">
.resumo-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
@media (min-width: 960px) {
  .resumo-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}
.mini-valor {
  font-size: 1.25rem;
  line-height: 1.2;
}
.mini-bars {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 44px;
  margin-top: 8px;
}
.mini-bar {
  flex: 1 1 0;
  min-width: 2px;
  border-radius: 2px 2px 0 0;
}
.mini-eixo {
  font-size: 10px;
  margin-top: 4px;
}
</style>