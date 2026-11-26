<script setup>
// Apresenta o catálogo da loja e encaminha ações de edição, retirada ou destinação de itens.
import { computed, ref } from "vue";
import { resumoEstoque } from "../../utils/lotesVencidos";
// Entradas recebidas do componente pai que configuram os dados e opções desta tela.
const props = defineProps({ modoEscuro: Boolean, foods: { type: Array, default: () => [] }, lojaId: String });
// Eventos emitidos para o componente pai executar as ações fora desta interface.
const emit = defineEmits(["edit-item", "add-item-click", "inactivate-item", "publish-item", "destinar-item"]);
// Item inativo continua cadastrado, mas não aparece para os clientes.
const estaInativo = (food) => food.status === "inactive";
// Datas no formato dia/mês/ano (aceita "2026-06-05" ou data ISO completa).
const dataBr = (valor) => {
  const dia = String(valor || "").slice(0, 10);
  const [ano, mes, d] = dia.split("-");
  return ano && mes && d ? `${d}/${mes}/${ano}` : "—";
};
// Situação da validade para a loja ver antes de abrir o item.
const situacaoValidade = (valor) => {
  const dia = String(valor || "").slice(0, 10);
  if (!dia) return { texto: "Sem validade", cor: "grey-6" };
  const hoje = new Date().toLocaleDateString("sv-SE");
  const dias = Math.round((new Date(`${dia}T00:00:00`) - new Date(`${hoje}T00:00:00`)) / 86400000);
  if (dias < 0) return { texto: "Vencido", cor: "negative", vencido: true };
  if (dias === 0) return { texto: "Vence hoje", cor: "deep-orange" };
  if (dias <= 2) return { texto: `Vence em ${dias} dia(s)`, cor: "warning" };
  return { texto: `Vence em ${dias} dias`, cor: "positive" };
};
// Valores derivados das entradas e do estado para manter a apresentação sincronizada.
const myFoods = computed(() => {
  return props.foods.filter((f) => f.lojaId === props.lojaId);
});
const totalInativos = computed(() => myFoods.value.filter(estaInativo).length);
// Busca e filtros (mesmos do painel Master): texto, categoria e situação do item.
const busca = ref("");
const filtroCategoria = ref(null);
const filtroSituacao = ref("todos");
const CATEGORIAS = [
  { label: "Salgado", value: "salgado" },
  { label: "Doce", value: "doce" },
  { label: "Misto", value: "misto" },
];
const SITUACOES = [
  { label: "Todos", value: "todos" },
  { label: "Na vitrine", value: "active" },
  { label: "Pausados / esgotados", value: "parados" },
  { label: "Vencidos", value: "vencidos" },
  { label: "Vencem hoje", value: "hoje" },
];
const dia = (v) => String(v || "").slice(0, 10);
const hojeIso = () => new Date().toLocaleDateString("sv-SE");
const estaVencido = (food) => !!dia(food.dataValidade) && dia(food.dataValidade) < hojeIso();
const naVitrine = (food) => (food.status || "active") === "active";
const foodsFiltrados = computed(() => {
  const termo = busca.value.trim().toLowerCase();
  return myFoods.value.filter((f) => {
    if (filtroCategoria.value && f.category !== filtroCategoria.value) return false;
    if (filtroSituacao.value === "active" && !naVitrine(f)) return false;
    if (filtroSituacao.value === "parados" && naVitrine(f)) return false;
    if (filtroSituacao.value === "vencidos" && !estaVencido(f)) return false;
    if (filtroSituacao.value === "hoje" && dia(f.dataValidade) !== hojeIso()) return false;
    if (!termo) return true;
    return [f.name, f.description, f.category].some((t) => String(t || "").toLowerCase().includes(termo));
  });
});
const limparFiltros = () => {
  busca.value = "";
  filtroCategoria.value = null;
  filtroSituacao.value = "todos";
};
</script>

<template>
<!-- Interface principal: apresenta o catálogo da loja e encaminha ações de edição, retirada ou destinação de itens. -->
  <div class="column q-gutter-y-md inventory-root">
    <!-- Header de Controle e Estatísticas -->
    <q-card flat bordered>
      <q-card-section class="row items-center justify-between q-col-gutter-sm no-wrap-sm">
        <div class="col-12 col-sm">
          <div class="row items-center q-gutter-x-sm">
            <div class="text-subtitle2 text-weight-bold text-uppercase">
              Itens Ofertados pelo Estabelecimento
            </div>
            <q-badge color="positive" rounded class="text-weight-bold">
              {{ myFoods.length }} {{ myFoods.length === 1 ? 'item' : 'itens' }}
            </q-badge>
            <q-badge v-if="totalInativos" color="grey-7" rounded class="text-weight-bold">
              {{ totalInativos }} {{ totalInativos === 1 ? 'inativo' : 'inativos' }}
            </q-badge>
          </div>
          <div class="text-caption text-grey-7">
            Alimentos cadastrados que sua padaria/estabelecimento pode oferecer aos clientes.
          </div>
        </div>
        <div class="col-12 col-sm-auto">
          <q-btn
            id="btn-store-new-item"
            color="primary"
            icon="add_circle"
            label="Cadastrar Novo Item"
            unelevated
            no-caps
            class="text-weight-bold"
            @click="emit('add-item-click')"
          />
        </div>
      </q-card-section>
    </q-card>

    <!-- Busca e filtros (iguais aos do painel Master) -->
    <template v-if="myFoods.length > 0">
      <div class="itens-filtros">
        <q-input
          v-model="busca"
          outlined
          dense
          clearable
          :dark="modoEscuro"
          placeholder="Buscar por item ou descrição..."
          class="itens-busca"
        >
          <template #prepend><q-icon name="search" /></template>
        </q-input>
        <q-select
          v-model="filtroCategoria"
          :options="CATEGORIAS"
          emit-value
          map-options
          clearable
          outlined
          dense
          :dark="modoEscuro"
          label="Categoria"
        />
      </div>
      <div class="row q-gutter-xs">
        <q-btn
          v-for="s in SITUACOES"
          :key="s.value"
          no-caps
          unelevated
          :outline="filtroSituacao !== s.value"
          :color="filtroSituacao === s.value ? 'orange-8' : 'grey-7'"
          :label="s.label"
          class="text-weight-bold"
          @click="filtroSituacao = s.value"
        />
      </div>
    </template>

    <!-- Lista de todos os itens que a loja pode oferecer (sem separação ativo/inativo, sem valor, sem vencimento) -->
    <q-card v-if="myFoods.length === 0" flat bordered>
      <q-card-section class="column items-center text-center q-pa-xl">
        <q-icon name="error_outline" size="32px" color="grey-6" class="q-mb-sm" />
        <div class="text-caption text-grey-6">Nenhum item cadastrado no catálogo do seu estabelecimento.</div>
        <q-btn
          color="primary"
          label="Cadastrar Meu Primeiro Item"
          unelevated
          no-caps
          class="q-mt-md text-weight-bold"
          @click="emit('add-item-click')"
        />
      </q-card-section>
    </q-card>

    <q-card v-if="myFoods.length > 0 && foodsFiltrados.length === 0" flat bordered>
      <q-card-section class="column items-center text-center q-pa-lg">
        <q-icon name="inventory_2" size="32px" color="grey-6" class="q-mb-sm" />
        <div class="text-caption text-grey-6">Nenhum item encontrado com esses filtros.</div>
        <q-btn flat dense no-caps color="primary" label="Limpar filtros" class="q-mt-sm" @click="limparFiltros" />
      </q-card-section>
    </q-card>

    <q-card v-for="food in foodsFiltrados" :key="food.id" flat bordered>
      <q-card-section class="row no-wrap items-start q-gutter-x-md" :class="{ 'item-inativo': estaInativo(food) }">
        <q-avatar square size="64px" class="food-thumb">
          <img :src="food.image" :alt="food.name" referrerpolicy="no-referrer" />
        </q-avatar>

        <div class="col column">
          <div class="row items-center q-gutter-xs">
            <span class="text-subtitle2 text-weight-bold ellipsis food-name">{{ food.name }}</span>

            <!-- Tag de Categoria Exclusiva -->
            <q-badge
              outline
              :color="food.category === 'doce' ? 'warning' : food.category === 'salgado' ? 'positive' : 'accent'"
              class="text-weight-bold text-uppercase"
            >
              {{ food.category === 'doce' ? 'Doce 🍩' : food.category === 'salgado' ? 'Salgado 🥐' : 'Misto 🥐🍩' }}
            </q-badge>

            <q-badge v-if="food.quantity !== undefined" outline color="grey-7" class="text-weight-bold">
              Sacolas: {{ resumoEstoque(food).vendaveis }}
            </q-badge>
            <q-badge v-if="resumoEstoque(food).vencidas > 0" color="negative" class="text-weight-bold">
              <q-icon name="warning" size="12px" class="q-mr-xs" />Vencidas: {{ resumoEstoque(food).vencidas }}
            </q-badge>
            <q-badge v-if="estaInativo(food)" color="grey-8" class="text-weight-bold text-uppercase">
              <q-icon name="visibility_off" size="12px" class="q-mr-xs" />Inativo
            </q-badge>
          </div>
          <div v-if="estaInativo(food)" class="text-caption text-grey-8 text-weight-medium q-mt-xs">
            Inativo: não aparece para os clientes. Toque em Reativar para voltar à vitrine.
          </div>

          <div class="text-caption text-grey-7 food-desc q-mt-xs">
            {{ food.description }}
          </div>
          <!-- Datas de fabricação e validade, visíveis sem abrir o item -->
          <div class="row items-center q-gutter-x-sm q-mt-xs text-caption text-grey-8">
            <q-icon name="event" size="16px" />
            <span>Fabricação: <b>{{ dataBr(food.dataFabricacao) }}</b></span>
            <span>·</span>
            <span>Validade: <b>{{ dataBr(food.dataValidade) }}</b></span>
            <q-badge :color="situacaoValidade(food.dataValidade).cor" class="text-weight-bold">
              {{ situacaoValidade(food.dataValidade).texto }}
            </q-badge>
          </div>
          <div
            v-if="situacaoValidade(food.dataValidade).vencido"
            class="text-caption text-negative text-weight-medium q-mt-xs"
          >
            Saiu da vitrine → encaminhar para doação ou descarte
          </div>
          <div class="text-caption text-grey-6 q-mt-xs">
            <template v-if="Number(food.precoComDesconto) > 0">
              R$ {{ Number(food.precoComDesconto).toFixed(2).replace('.', ',') }}
              <span v-if="Number(food.precoOriginal) > Number(food.precoComDesconto)" class="q-ml-xs" style="text-decoration: line-through">R$ {{ Number(food.precoOriginal).toFixed(2).replace('.', ',') }}</span>
            </template>
            <span v-else class="text-negative">Sem preço definido: edite para o cliente poder comprar</span>
          </div>
        </div>
      </q-card-section>

      <q-separator />

      <!-- Barra de Ações (Editar, Doar/Descartar e Inativar) -->
      <q-card-actions class="q-pa-sm q-gutter-x-sm no-wrap">
        <q-btn
          class="col"
          outline
          dense
          no-caps
          color="warning"
          icon="edit"
          label="Editar Item"
          @click="emit('edit-item', food)"
        />
        <!-- Sempre disponível: o item pode ser doado ou descartado antes de vencer -->
        <q-btn
          :id="`btn-catalogo-destinar-${food.id}`"
          class="col"
          :outline="!(situacaoValidade(food.dataValidade).vencido || resumoEstoque(food).vencidas > 0)"
          :unelevated="situacaoValidade(food.dataValidade).vencido || resumoEstoque(food).vencidas > 0"
          dense
          no-caps
          color="negative"
          icon="volunteer_activism"
          :label="resumoEstoque(food).vencidas > 0 ? `Doar / Descartar vencidas (${resumoEstoque(food).vencidas})` : 'Doar / Descartar'"
          @click="emit('destinar-item', food)"
        />
        <q-btn
          class="col"
          outline
          dense
          no-caps
          :color="estaInativo(food) ? 'positive' : 'grey-8'"
          :icon="estaInativo(food) ? 'visibility' : 'visibility_off'"
          :label="estaInativo(food) ? 'Reativar' : 'Inativar'"
          @click="estaInativo(food) ? emit('publish-item', food.id) : emit('inactivate-item', food.id)"
        />
      </q-card-actions>
    </q-card>
  </div>
</template>

<style scoped lang="scss">
.food-name {
  max-width: 180px;
}
.item-inativo {
  opacity: 0.55;
}
.itens-filtros {
  display: grid;
  gap: 8px;
  grid-template-columns: minmax(0, 1fr);
}
@media (min-width: 700px) {
  .itens-filtros {
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  }
}
.food-thumb {
  border-radius: 12px;
  img {
    object-fit: cover;
  }
}
.food-desc {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.35;
}
</style>