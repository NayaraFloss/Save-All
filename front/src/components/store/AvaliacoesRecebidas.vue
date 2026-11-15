<script setup>
import { computed, ref } from "vue";

const props = defineProps({
  orders: { type: Array, default: () => [] },
  modoEscuro: Boolean
});

const somenteReclamacoes = ref(false);

// Pedidos já avaliados pelo cliente, do mais recente para o mais antigo.
const avaliacoes = computed(() =>
  props.orders
    .filter((o) => o.notaComida)
    .sort((a, b) => new Date(b.avaliadoEm || b.date || 0) - new Date(a.avaliadoEm || a.date || 0))
);
const lista = computed(() =>
  somenteReclamacoes.value ? avaliacoes.value.filter((o) => o.reclamacaoComida || o.notaComida === 1) : avaliacoes.value
);
const media = computed(() => {
  if (!avaliacoes.value.length) return 0;
  return avaliacoes.value.reduce((s, o) => s + Number(o.notaComida || 0), 0) / avaliacoes.value.length;
});
const totalReclamacoes = computed(() => avaliacoes.value.filter((o) => o.reclamacaoComida || o.notaComida === 1).length);

// Avaliações anônimas: só a data (sem hora), sem nome, sem número do pedido e sem itens comprados.
const formatarData = (valor) => {
  if (!valor) return "";
  const d = new Date(valor);
  return isNaN(d) ? "" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
};
const corNota = (n) => (n >= 4 ? "positive" : n === 3 ? "warning" : "negative");
</script>

<template>
  <q-card flat bordered class="q-mb-md" :dark="modoEscuro">
    <q-card-section class="q-gutter-y-sm">
      <div class="row items-center justify-between no-wrap">
        <div class="row items-center q-gutter-x-sm no-wrap">
          <q-icon name="rate_review" color="primary" size="20px" />
          <div class="text-subtitle2 text-weight-bold text-uppercase">Avaliações recebidas</div>
          <q-badge outline color="grey-7" class="text-weight-bold">
            <q-icon name="visibility_off" size="12px" class="q-mr-xs" />Anônimas
          </q-badge>
        </div>
        <q-badge v-if="avaliacoes.length" :color="corNota(Math.round(media))" class="text-weight-bold">
          {{ media.toFixed(1) }} ★ · {{ avaliacoes.length }} {{ avaliacoes.length === 1 ? "avaliação" : "avaliações" }}
        </q-badge>
      </div>

      <div v-if="totalReclamacoes" class="row items-center">
        <q-toggle
          v-model="somenteReclamacoes"
          dense
          color="negative"
          :label="`Mostrar só reclamações (${totalReclamacoes})`"
        />
      </div>

      <div v-if="!lista.length" class="column items-center text-center text-grey-6 q-py-lg q-gutter-y-xs">
        <q-icon name="star_outline" size="32px" class="opacity-40" />
        <div class="text-caption">
          {{ somenteReclamacoes ? "Nenhuma reclamação registrada." : "Nenhum cliente avaliou seus pedidos ainda." }}
        </div>
      </div>

      <q-list v-else separator>
        <q-item v-for="o in lista" :key="o.id" class="q-px-none items-start">
          <q-item-section avatar top>
            <q-avatar color="grey-5" text-color="white" size="40px" icon="person" />
          </q-item-section>
          <q-item-section>
            <div class="row items-center justify-between no-wrap">
              <div class="text-subtitle2 text-weight-bold ellipsis">Cliente anônimo</div>
              <q-rating :model-value="Number(o.notaComida)" readonly size="16px" color="amber-8" icon="star" />
            </div>
            <div class="text-caption text-grey-6">Avaliado em {{ formatarData(o.avaliadoEm || o.date) }}</div>
            <div v-if="o.comentarioComida" class="text-body2 q-mt-xs comentario">"{{ o.comentarioComida }}"</div>
            <div v-else class="text-caption text-grey-6 q-mt-xs">Sem comentário.</div>
            <div v-if="o.reclamacaoComida || o.notaComida === 1" class="q-mt-xs">
              <q-badge color="negative" class="text-weight-bold">
                <q-icon name="report" size="12px" class="q-mr-xs" />Reclamação formal
              </q-badge>
            </div>
          </q-item-section>
        </q-item>
      </q-list>
    </q-card-section>
  </q-card>
</template>

<style scoped lang="scss">
.opacity-40 {
  opacity: 0.4;
}
.comentario {
  font-style: italic;
  word-break: break-word;
}
</style>