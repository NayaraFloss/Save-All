<script setup>
// Reúne e resume as avaliações de pedidos e doações recebidas pela loja.
import { computed, ref } from "vue";
import { listarAvaliacoes, resumirAvaliacoes, ehReclamacao } from "../../utils/resumoAvaliacoes.js";

// Entradas recebidas do componente pai que configuram os dados e opções desta tela.
const props = defineProps({
  orders: { type: Array, default: () => [] },
  // Doações entregues já avaliadas pela entidade (campo avaliacaoEntidade)
  donations: { type: Array, default: () => [] },
  modoEscuro: Boolean
});

// Estado local reativo usado para acompanhar seleções, formulários e etapas da interface.
const somenteReclamacoes = ref(false);

// Avaliações dos clientes (pedidos) e das entidades (doações), da mais recente para a mais antiga.
// A conta é a mesma do card "Governança de Qualidade" (utils/resumoAvaliacoes.js).
const avaliacoes = computed(() => listarAvaliacoes(props.orders, props.donations));
const resumo = computed(() => resumirAvaliacoes(avaliacoes.value));
const lista = computed(() => (somenteReclamacoes.value ? avaliacoes.value.filter(ehReclamacao) : avaliacoes.value));
const media = computed(() => resumo.value.media);
const totalReclamacoes = computed(() => resumo.value.reclamacoes);

// Avaliações anônimas: só a data (sem hora), sem nome, sem número do pedido e sem itens comprados.
const formatarData = (valor) => {
  if (!valor) return "";
  const d = new Date(valor);
  return isNaN(d) ? "" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
};
const corNota = (n) => (n >= 4 ? "positive" : n === 3 ? "warning" : "negative");
</script>

<template>
<!-- Interface principal: reúne e resume as avaliações de pedidos e doações recebidas pela loja. -->
  <q-card flat bordered class="q-mb-md" :dark="modoEscuro">
    <q-card-section class="q-gutter-y-sm">
      <div class="row items-center justify-between q-gutter-y-xs cabecalho-avaliacoes">
        <div class="row items-center q-gutter-x-sm">
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
            <div class="row items-center justify-between q-gutter-x-sm linha-autor">
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
.cabecalho-avaliacoes {
  flex-wrap: wrap;
}
.linha-autor {
  flex-wrap: wrap;
}
.comentario {
  font-style: italic;
  word-break: break-word;
}
</style>