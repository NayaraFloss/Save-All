<script setup>
import { computed, ref } from "vue";

const props = defineProps({
  orders: { type: Array, default: () => [] },
  // Doações entregues já avaliadas pela entidade (campo avaliacaoEntidade)
  donations: { type: Array, default: () => [] },
  modoEscuro: Boolean
});

const somenteReclamacoes = ref(false);

// Avaliações dos clientes (pedidos) e das entidades (doações), da mais recente para a mais antiga.
const dePedidos = computed(() =>
  props.orders
    .filter((o) => o.notaComida)
    .map((o) => ({
      id: `pedido-${o.id}`,
      origem: "cliente",
      notaComida: Number(o.notaComida),
      comentarioComida: o.comentarioComida,
      reclamacaoComida: !!o.reclamacaoComida,
      data: o.avaliadoEm || o.date,
    })),
);
const deDoacoes = computed(() =>
  props.donations
    .filter((d) => d?.avaliacaoEntidade?.notaComida)
    .map((d) => ({
      id: `doacao-${d.id || d.token}`,
      origem: "entidade",
      notaComida: Number(d.avaliacaoEntidade.notaComida),
      comentarioComida: d.avaliacaoEntidade.comentarioComida,
      reclamacaoComida: !!d.avaliacaoEntidade.reclamacaoComida,
      data: d.avaliacaoEntidade.avaliadoEm || d.completedAt || d.createdAt,
    })),
);
const avaliacoes = computed(() =>
  [...dePedidos.value, ...deDoacoes.value].sort((a, b) => new Date(b.data || 0) - new Date(a.data || 0)),
);
const ehReclamacao = (o) => o.reclamacaoComida || o.notaComida === 1;
const lista = computed(() => (somenteReclamacoes.value ? avaliacoes.value.filter(ehReclamacao) : avaliacoes.value));
const media = computed(() => {
  if (!avaliacoes.value.length) return 0;
  return avaliacoes.value.reduce((s, o) => s + o.notaComida, 0) / avaliacoes.value.length;
});
const totalReclamacoes = computed(() => avaliacoes.value.filter(ehReclamacao).length);

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
          {{ somenteReclamacoes ? "Nenhuma reclamação registrada." : "Nenhum cliente ou entidade avaliou ainda." }}
        </div>
      </div>

      <q-list v-else separator>
        <q-item v-for="o in lista" :key="o.id" class="q-px-none items-start">
          <q-item-section avatar top>
            <q-avatar :color="o.origem === 'entidade' ? 'teal-5' : 'grey-5'" text-color="white" size="40px" :icon="o.origem === 'entidade' ? 'volunteer_activism' : 'person'" />
          </q-item-section>
          <q-item-section>
            <div class="row items-center justify-between no-wrap">
              <div class="text-subtitle2 text-weight-bold ellipsis">
                {{ o.origem === "entidade" ? "Entidade parceira" : "Cliente anônimo" }}
              </div>
              <q-rating :model-value="o.notaComida" readonly size="16px" color="amber-8" icon="star" />
            </div>
            <div class="text-caption text-grey-6">Avaliado em {{ formatarData(o.data) }}</div>
            <div v-if="o.comentarioComida" class="text-body2 q-mt-xs comentario">"{{ o.comentarioComida }}"</div>
            <div v-else class="text-caption text-grey-6 q-mt-xs">Sem comentário.</div>
            <div v-if="ehReclamacao(o)" class="q-mt-xs">
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