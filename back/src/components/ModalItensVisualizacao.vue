<script setup>
import { useRouter } from "vue-router";
import { ref, computed } from "vue";
import { storeToRefs } from "pinia";
import { useAppStore } from "stores/estadoApp";
const router = useRouter();
defineProps({ show: Boolean, modoEscuro: Boolean });
const emit = defineEmits(["close", "startOrder"]);
const { foods, stores } = storeToRefs(useAppStore());
const searchQuery = ref("");
const categoryFilter = ref("all");
const getStoreName = (lojaId) => {
  const s = stores.value.find((st) => st.id === lojaId);
  return s ? s.name : "Padaria Parceira";
};
const filteredFoods = computed(() => {
  return foods.value.filter((item) => {
    if (categoryFilter.value !== "all" && item.category !== categoryFilter.value) {
      return false;
    }
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase().trim();
      const nomeLoja = getStoreName(item.lojaId).toLowerCase();
      const matchName = item.name.toLowerCase().includes(q);
      const matchDesc = item.description.toLowerCase().includes(q);
      const matchStore = nomeLoja.includes(q);
      return matchName || matchDesc || matchStore;
    }
    return true;
  });
});
const handleStartOrder = () => {
  emit("close");
  router.push({ name: 'PedidoCustomizado' });
};
</script>

<template>
  <q-dialog
    :model-value="show"
    @update:model-value="(v) => { if (!v) emit('close'); }"
  >
    <q-card class="modal-itens column no-wrap">
      <!-- HEADER -->
      <q-card-section class="row items-center justify-between no-wrap q-py-sm">
        <div class="row items-center no-wrap q-gutter-x-sm">
          <q-avatar color="teal-1" text-color="teal" icon="restaurant" size="40px" />
          <div>
            <div class="row items-center q-gutter-x-sm">
              <span class="text-subtitle2 text-weight-bold">Cardápio Geral de Produtos</span>
              <q-badge color="amber-3" text-color="amber-10" label="VITRINE" />
            </div>
            <div class="text-caption text-grey-7">
              Catálogo completo com todos os produtos de todas as padarias parceiras
            </div>
          </div>
        </div>
        <q-btn id="btn-close-items-modal" flat round dense icon="close" @click="emit('close')" />
      </q-card-section>

      <q-separator />

      <!-- CORPO -->
      <q-card-section class="col scroll q-gutter-y-md">
        <q-input
          id="input-search-all-items"
          v-model="searchQuery"
          dense
          outlined
          clearable
          placeholder="Buscar por produto, descrição ou padaria..."
        >
          <template #prepend>
            <q-icon name="search" />
          </template>
        </q-input>

        <div class="row items-center q-gutter-xs no-wrap categorias">
          <q-chip
            id="cat-filter-all"
            clickable
            :color="categoryFilter === 'all' ? 'positive' : undefined"
            :text-color="categoryFilter === 'all' ? 'white' : undefined"
            @click="categoryFilter = 'all'"
          >
            Todas Categorias
          </q-chip>
          <q-chip
            id="cat-filter-salgado"
            clickable
            :color="categoryFilter === 'salgado' ? 'positive' : undefined"
            :text-color="categoryFilter === 'salgado' ? 'white' : undefined"
            @click="categoryFilter = 'salgado'"
          >
            Salgados 🥐
          </q-chip>
          <q-chip
            id="cat-filter-doce"
            clickable
            :color="categoryFilter === 'doce' ? 'positive' : undefined"
            :text-color="categoryFilter === 'doce' ? 'white' : undefined"
            @click="categoryFilter = 'doce'"
          >
            Doces 🍩
          </q-chip>
          <q-chip
            id="cat-filter-misto"
            clickable
            :color="categoryFilter === 'misto' ? 'positive' : undefined"
            :text-color="categoryFilter === 'misto' ? 'white' : undefined"
            @click="categoryFilter = 'misto'"
          >
            Mistos 🥐🍩
          </q-chip>
        </div>

        <!-- LISTAGEM -->
        <div v-if="filteredFoods.length === 0" class="text-center text-grey-6 q-py-xl">
          <q-icon name="restaurant" size="32px" class="opacity-30" />
          <div class="text-caption">Nenhum produto encontrado com os filtros aplicados.</div>
        </div>

        <div v-else class="row q-col-gutter-sm">
          <div v-for="food in filteredFoods" :key="food.id" class="col-12 col-sm-6 col-md-4">
            <q-card flat bordered class="full-height column justify-between">
              <div>
                <q-img :src="food.image" :alt="food.name" height="128px">
                  <q-badge
                    color="black"
                    text-color="white"
                    class="absolute-top-left q-ma-sm"
                    style="background: rgba(0, 0, 0, 0.6)"
                  >
                    {{ food.category === 'doce' ? '🍩 Doce' : food.category === 'salgado' ? '🥐 Salgado' : '🥐🍩 Misto' }}
                  </q-badge>
                </q-img>
                <q-card-section class="q-pa-sm">
                  <div class="row items-center no-wrap text-caption text-grey-6">
                    <q-icon name="storefront" color="positive" size="14px" class="q-mr-xs" />
                    <span class="ellipsis">{{ getStoreName(food.lojaId) }}</span>
                  </div>
                  <div class="text-subtitle2 text-weight-bold ellipsis">{{ food.name }}</div>
                  <div class="text-caption text-grey-7 descricao">{{ food.description }}</div>
                </q-card-section>
              </div>
              <q-separator />
              <q-card-section class="row items-center justify-between q-py-xs q-px-sm">
                <q-badge color="green-1" text-color="positive">
                  {{ food.category === 'doce' ? 'Doce 🍩' : food.category === 'salgado' ? 'Salgado 🥐' : 'Misto 🥐🍩' }}
                </q-badge>
                <span class="text-caption text-grey-6">Item Ofertado</span>
              </q-card-section>
            </q-card>
          </div>
        </div>

        <!-- AVISO DE TRANSPARÊNCIA -->
        <q-banner rounded class="bg-green-1 text-green-9">
          <template #avatar>
            <q-icon name="auto_awesome" color="positive" />
          </template>
          <span class="text-caption">
            <strong>Transparência SaveAll:</strong> Esta vitrine reúne os produtos das nossas padarias parceiras. Para comprar, escolha o estabelecimento e depois a sacola que você quer.
          </span>
        </q-banner>
      </q-card-section>

      <q-separator />

      <!-- FOOTER -->
      <q-card-actions align="between" class="q-px-md">
        <span class="text-caption text-grey-6 gt-xs">
          Mostrando {{ filteredFoods.length }} de {{ foods.length }} produtos cadastrados
        </span>
        <div class="row q-gutter-sm">
          <q-btn
            id="btn-items-start-order"
            unelevated
            color="positive"
            icon="storefront"
            label="Escolher loja e pedir →"
            @click="handleStartOrder"
          />
          <q-btn id="btn-close-items-footer" flat label="Fechar" @click="emit('close')" />
        </div>
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style scoped lang="scss">
.modal-itens {
  width: 100%;
  max-width: 768px;
  max-height: 92vh;
}
.categorias {
  overflow-x: auto;
}
.descricao {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.opacity-30 {
  opacity: 0.3;
}
</style>