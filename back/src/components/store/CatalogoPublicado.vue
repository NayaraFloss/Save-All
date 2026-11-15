<script setup>
import { computed } from "vue";
const props = defineProps({ modoEscuro: Boolean, foods: { type: Array, default: () => [] }, lojaId: String });
const emit = defineEmits(["edit-item", "add-item-click", "remove-item", "destinar-item"]);
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
const myFoods = computed(() => {
  return props.foods.filter((f) => f.lojaId === props.lojaId);
});
</script>

<template>
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

    <q-card v-for="food in myFoods" :key="food.id" flat bordered>
      <q-card-section class="row no-wrap items-start q-gutter-x-md">
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
              Sacolas: {{ food.quantity }}
            </q-badge>
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

      <!-- Barra de Ações (Editar, Doação/Descarte se vencido, e Retirar) -->
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
        <q-btn
          v-if="situacaoValidade(food.dataValidade).vencido"
          :id="`btn-catalogo-destinar-${food.id}`"
          class="col"
          outline
          dense
          no-caps
          color="negative"
          icon="volunteer_activism"
          label="Doação / Descarte"
          @click="emit('destinar-item', food)"
        />
        <q-btn
          class="col"
          outline
          dense
          no-caps
          color="negative"
          icon="delete"
          label="Remover"
          @click="emit('remove-item', food.id)"
        />
      </q-card-actions>
    </q-card>
  </div>
</template>

<style scoped lang="scss">
.food-name {
  max-width: 180px;
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