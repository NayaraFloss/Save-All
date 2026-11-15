<script setup>
import { ref, computed } from "vue";
import { useQuasar } from "quasar";
import { storeToRefs } from "pinia";
import { useAppStore } from "../stores/estadoApp";
import { storeBelongsToCity } from "src/utils/cidades";
const props = defineProps({ show: Boolean, modoEscuro: Boolean });
const emit = defineEmits(["close", "startOrder"]);
const $q = useQuasar();
const appStore = useAppStore();
const { stores, foods, selectedCity } = storeToRefs(appStore);
const { setScreen } = appStore;
const isDark = computed(() => $q.dark.isActive || props.modoEscuro);
const isStoreActiveToday = (lojaId) => {
  const st = stores.value.find((s) => s.id === lojaId);
  return !!st && st.activeToday !== false;
};
const categoryLabel = (c) => (c === 'doce' ? 'Doce 🍩' : c === 'salgado' ? 'Salgado 🥐' : 'Misto 🥐🍩');
const categoryEmoji = (c) => (c === 'doce' ? '🍩' : c === 'salgado' ? '🥐' : '🥐🍩');
// Padarias ativas (com itens disponíveis) aparecem por padrão; as inativas só se o cliente quiser ver.
const storeFilter = ref("ativas");
const searchQuery = ref("");
const selectedStore = ref(null);
const selectedStoreCategoryFilter = ref("all");
// Mesma regra do restante do app: item ativo e com estoque (inativo ou esgotado não conta).
const itemDisponivel = (f) => f.status === "active" && (f.quantity === void 0 || f.quantity > 0);
const getStoreProducts = (lojaId) => {
  return foods.value.filter((f) => f.lojaId === lojaId && itemDisponivel(f));
};
// Só as lojas da cidade em que o cliente está (a mesma regra do "parceiros no rodízio").
const lojasDaCidade = computed(() =>
  selectedCity.value ? stores.value.filter((s) => storeBelongsToCity(s, selectedCity.value)) : stores.value
);
// Ativa = aberta hoje e com pelo menos um item disponível. Sem item (ou fechada hoje) = inativa.
const lojaAtiva = (s) => isStoreActiveToday(s.id) && getStoreProducts(s.id).length > 0;
const lojasAtivas = computed(() => lojasDaCidade.value.filter(lojaAtiva));
const lojasInativas = computed(() => lojasDaCidade.value.filter((s) => !lojaAtiva(s)));
const filteredStores = computed(() => {
  let list = storeFilter.value === "inativas" ? lojasInativas.value : lojasAtivas.value;
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim();
    list = list.filter(
      (s) => s.name.toLowerCase().includes(q) || s.address && s.address.toLowerCase().includes(q)
    );
  }
  return list;
});
const selectedStoreProducts = computed(() => {
  if (!selectedStore.value) return [];
  let list = getStoreProducts(selectedStore.value.id);
  if (selectedStoreCategoryFilter.value !== "all") {
    list = list.filter((f) => categoriaInclui(f, selectedStoreCategoryFilter.value));
  }
  return list;
});
// Item "misto" vale como doce e como salgado (igual ao sorteio das sacolas).
const categoriaInclui = (f, categoria) => f.category === categoria || f.category === "misto";
const contarCategoria = (lojaId, categoria) => getStoreProducts(lojaId).filter((f) => categoriaInclui(f, categoria)).length;
const handleSelectStore = (store) => {
  selectedStore.value = store;
  selectedStoreCategoryFilter.value = "all";
};
const handleBackToList = () => {
  selectedStore.value = null;
  selectedStoreCategoryFilter.value = "all";
};
const handleStartOrder = () => {
  emit("close");
  setScreen("stores");
};
</script>

<template>
  <q-dialog :model-value="show" persistent @update:model-value="(v) => { if (!v) emit('close') }">
    <q-card class="lojas-card column no-wrap text-left" :dark="isDark">
      <!-- HEADER -->
      <q-card-section class="row items-center justify-between no-wrap q-py-sm q-px-md lojas-bar">
        <div class="row items-center no-wrap q-gutter-sm col">
          <q-btn
            v-if="selectedStore"
            id="btn-back-stores-list"
            flat
            round
            dense
            icon="arrow_back"
            :color="isDark ? 'grey-5' : 'grey-7'"
            @click="handleBackToList"
          >
            <q-tooltip>Voltar para a lista de lojas</q-tooltip>
          </q-btn>
          <q-avatar rounded size="40px" color="positive" text-color="white" icon="storefront" />
          <div class="col ellipsis">
            <div class="row items-center q-gutter-sm no-wrap">
              <span v-if="!selectedStore" class="text-subtitle2 text-weight-bold">Lojas &amp; Padarias Cadastradas</span>
              <span v-else class="text-subtitle2 text-weight-bold ellipsis">{{ selectedStore.name }}</span>
              <q-badge color="amber-3" text-color="amber-10" rounded class="text-weight-bold text-uppercase lojas-badge">Apenas Visualização</q-badge>
            </div>
            <div class="text-caption text-grey-6 ellipsis">
              <span v-if="!selectedStore">Consulte todas as parceiras de {{ selectedCity }}</span>
              <span v-else>Todos os itens que o estabelecimento pode oferecer</span>
            </div>
          </div>
        </div>
        <q-btn id="btn-close-stores-modal" flat round dense icon="close" :color="isDark ? 'grey-5' : 'grey-7'" @click="emit('close')" />
      </q-card-section>
      <q-separator />

      <!-- CORPO 1: LISTA DE LOJAS -->
      <q-scroll-area v-if="!selectedStore" class="lojas-body">
        <div class="q-pa-md column q-gutter-md">
          <div class="column q-gutter-sm">
            <q-input
              id="input-search-stores-modal"
              v-model="searchQuery"
              outlined
              dense
              rounded
              :dark="isDark"
              placeholder="Buscar padaria por nome ou endereço..."
            >
              <template #prepend><q-icon name="search" size="18px" /></template>
            </q-input>

            <div class="row q-col-gutter-sm">
              <div class="col-6">
                <q-btn
                  id="btn-filter-active-stores"
                  no-caps
                  unelevated
                  rounded
                  class="full-width text-weight-bold"
                  :color="storeFilter === 'ativas' ? 'positive' : (isDark ? 'grey-9' : 'white')"
                  :text-color="storeFilter === 'ativas' ? 'dark' : (isDark ? 'grey-5' : 'grey-8')"
                  :outline="storeFilter !== 'ativas'"
                  icon="check_circle"
                  :label="`Ativas (${lojasAtivas.length})`"
                  @click="storeFilter = 'ativas'"
                />
              </div>
              <div class="col-6">
                <q-btn
                  id="btn-filter-inactive-stores"
                  no-caps
                  unelevated
                  rounded
                  class="full-width text-weight-bold"
                  :color="storeFilter === 'inativas' ? 'grey-7' : (isDark ? 'grey-9' : 'white')"
                  :text-color="storeFilter === 'inativas' ? 'white' : (isDark ? 'grey-5' : 'grey-8')"
                  :outline="storeFilter !== 'inativas'"
                  icon="pause_circle"
                  :label="`Inativas (${lojasInativas.length})`"
                  @click="storeFilter = 'inativas'"
                />
              </div>
            </div>
          </div>

          <div v-if="filteredStores.length === 0" class="column items-center q-py-xl text-grey-6 q-gutter-sm">
            <q-icon name="storefront" size="32px" class="lojas-faded" />
            <div class="text-caption text-center">
              {{ searchQuery.trim()
                ? 'Nenhuma padaria encontrada com essa busca.'
                : storeFilter === 'inativas'
                  ? 'Nenhuma padaria inativa na sua cidade.'
                  : 'Nenhuma padaria com itens disponíveis agora. Toque em Inativas para ver as demais.' }}
            </div>
          </div>

          <div v-else class="row q-col-gutter-md">
            <div v-for="store in filteredStores" :key="store.id" class="col-12 col-sm-6">
              <q-card
                :id="`store-card-view-${store.id}`"
                flat
                bordered
                clickable
                v-ripple
                class="lojas-store-card cursor-pointer full-height"
                :class="{ 'lojas-store-card--inativa': !lojaAtiva(store) }"
                :dark="isDark"
                @click="handleSelectStore(store)"
              >
                <q-card-section class="row no-wrap q-gutter-sm">
                  <q-avatar rounded size="48px">
                    <img :src="store.logo" :alt="store.name" />
                  </q-avatar>
                  <div class="col ellipsis">
                    <div class="row items-center justify-between no-wrap">
                      <span class="text-caption text-weight-bold ellipsis">{{ store.name }}</span>
                      <span class="row items-center no-wrap text-amber-8 text-weight-bold text-caption">
                        <q-icon name="star" size="14px" />
                        <span>{{ store.rating || '4.8' }}</span>
                      </span>
                    </div>
                    <div class="row items-center no-wrap text-grey-6 text-caption ellipsis">
                      <q-icon name="place" size="14px" class="q-mr-xs" />
                      <span class="ellipsis">{{ store.address }}</span>
                    </div>
                    <q-badge v-if="lojaAtiva(store)" color="green-1" text-color="positive" rounded class="q-mt-sm text-weight-bold">
                      {{ getStoreProducts(store.id).length }} {{ getStoreProducts(store.id).length === 1 ? 'item que a loja pode oferecer' : 'itens que a loja pode oferecer' }}
                    </q-badge>
                    <q-badge v-else color="grey-3" text-color="grey-8" rounded class="q-mt-sm text-weight-bold">
                      <q-icon name="pause_circle" size="12px" class="q-mr-xs" />
                      Inativa · {{ isStoreActiveToday(store.id) ? 'sem itens disponíveis' : 'fechada hoje' }}
                    </q-badge>
                  </div>
                </q-card-section>
                <q-separator />
                <q-card-section class="row items-center justify-between q-py-xs text-positive text-caption text-weight-bold">
                  <span class="row items-center q-gutter-xs">
                    <q-icon name="visibility" size="14px" />
                    <span>Ver cardápio completo da loja</span>
                  </span>
                  <q-icon name="chevron_right" size="18px" />
                </q-card-section>
              </q-card>
            </div>
          </div>
        </div>
      </q-scroll-area>

      <!-- CORPO 2: DETALHE DA LOJA -->
      <q-scroll-area v-else class="lojas-body">
        <div class="q-pa-md column q-gutter-md">
          <q-card flat bordered class="lojas-store-head" :dark="isDark">
            <q-card-section class="row items-center no-wrap q-gutter-md">
              <q-avatar rounded size="56px">
                <img :src="selectedStore.logo" :alt="selectedStore.name" />
              </q-avatar>
              <div class="col ellipsis">
                <div class="text-subtitle2 text-weight-bold ellipsis">{{ selectedStore.name }}</div>
                <div class="row items-center no-wrap text-grey-6 text-caption ellipsis">
                  <q-icon name="place" size="14px" class="q-mr-xs" />
                  <span class="ellipsis">{{ selectedStore.address }}</span>
                </div>
                <div class="row items-center q-gutter-sm q-mt-xs">
                  <q-badge color="green-1" text-color="positive" rounded class="text-weight-bold">
                    {{ getStoreProducts(selectedStore.id).length }} {{ getStoreProducts(selectedStore.id).length === 1 ? 'item ofertado' : 'itens ofertados' }}
                  </q-badge>
                  <span class="row items-center no-wrap text-amber-8 text-weight-bold text-caption">
                    <q-icon name="star" size="14px" />
                    <span>{{ selectedStore.rating || '4.8' }}</span>
                  </span>
                </div>
              </div>
            </q-card-section>
          </q-card>

          <div class="row items-center q-gutter-xs no-wrap lojas-filters">
            <q-btn
              id="filter-prod-all"
              no-caps
              unelevated
              dense
              rounded
              class="q-px-sm text-weight-bold"
              :color="selectedStoreCategoryFilter === 'all' ? 'positive' : (isDark ? 'grey-9' : 'grey-3')"
              :text-color="selectedStoreCategoryFilter === 'all' ? 'dark' : (isDark ? 'grey-5' : 'grey-8')"
              :label="`Todos (${getStoreProducts(selectedStore.id).length})`"
              @click="selectedStoreCategoryFilter = 'all'"
            />
            <q-btn
              id="filter-prod-salgado"
              no-caps
              unelevated
              dense
              rounded
              class="q-px-sm text-weight-bold"
              :color="selectedStoreCategoryFilter === 'salgado' ? 'positive' : (isDark ? 'grey-9' : 'grey-3')"
              :text-color="selectedStoreCategoryFilter === 'salgado' ? 'dark' : (isDark ? 'grey-5' : 'grey-8')"
              :label="`🥐 Salgados (${contarCategoria(selectedStore.id, 'salgado')})`"
              @click="selectedStoreCategoryFilter = 'salgado'"
            />
            <q-btn
              id="filter-prod-doce"
              no-caps
              unelevated
              dense
              rounded
              class="q-px-sm text-weight-bold"
              :color="selectedStoreCategoryFilter === 'doce' ? 'positive' : (isDark ? 'grey-9' : 'grey-3')"
              :text-color="selectedStoreCategoryFilter === 'doce' ? 'dark' : (isDark ? 'grey-5' : 'grey-8')"
              :label="`🍩 Doces (${contarCategoria(selectedStore.id, 'doce')})`"
              @click="selectedStoreCategoryFilter = 'doce'"
            />
          </div>

          <div v-if="selectedStoreProducts.length === 0" class="text-center text-grey-6 text-caption q-py-lg">
            {{ getStoreProducts(selectedStore.id).length === 0
              ? 'Esta padaria não tem itens disponíveis no momento.'
              : 'Nenhum produto disponível nesta categoria.' }}
          </div>

          <div v-else class="row q-col-gutter-md">
            <div v-for="food in selectedStoreProducts" :key="food.id" class="col-12 col-sm-6">
              <q-card flat bordered class="full-height" :dark="isDark">
                <q-card-section class="row no-wrap q-gutter-sm q-pa-sm">
                  <div class="lojas-food-img rounded-borders">
                    <q-img :src="food.image" :alt="food.name" class="fit rounded-borders">
                      <div class="absolute-top-left bg-transparent q-pa-xs text-caption">{{ categoryEmoji(food.category) }}</div>
                    </q-img>
                  </div>
                  <div class="col column justify-between">
                    <div>
                      <div class="text-caption text-weight-bold ellipsis">{{ food.name }}</div>
                      <div class="text-grey-6 lojas-desc">{{ food.description }}</div>
                    </div>
                    <div class="row items-center justify-between q-mt-sm">
                      <q-badge color="green-1" text-color="positive" rounded class="text-weight-bold">
                        {{ categoryLabel(food.category) }}
                      </q-badge>
                      <span class="text-grey-6 lojas-tiny">Item Ofertado</span>
                    </div>
                  </div>
                </q-card-section>
              </q-card>
            </div>
          </div>

          <q-banner v-if="getStoreProducts(selectedStore.id).length > 0" rounded dense class="bg-amber-1 text-amber-10" :class="{ 'lojas-banner-dark': isDark }">
            <template #avatar><q-icon name="auto_awesome" color="amber-8" size="18px" /></template>
            <span class="text-caption">
              Estes são os produtos deste estabelecimento. Para comprar, toque em <strong>Fazer Pedido</strong> e escolha a sacola.
            </span>
          </q-banner>
        </div>
      </q-scroll-area>

      <!-- FOOTER -->
      <q-separator />
      <q-card-actions class="row items-center justify-between q-px-md q-py-sm lojas-bar">
        <span class="text-caption text-grey-6 gt-xs">
          {{ selectedStore ? 'Cardápio transparente da padaria' : 'Transparência de estabelecimentos parceiros' }}
        </span>
        <div class="row items-center q-gutter-sm no-wrap">
          <q-btn
            id="btn-stores-start-order"
            unelevated
            no-caps
            rounded
            color="positive"
            text-color="dark"
            icon="storefront"
            class="text-weight-bold"
            label="Fazer Pedido →"
            @click="handleStartOrder"
          />
          <q-btn
            id="btn-close-stores-footer"
            outline
            no-caps
            rounded
            :color="isDark ? 'grey-5' : 'grey-7'"
            class="text-weight-bold"
            label="Fechar"
            @click="emit('close')"
          />
        </div>
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style scoped lang="scss">
.lojas-card {
  width: 100%;
  max-width: 672px;
  max-height: 92vh;
  border-radius: 24px;
  overflow: hidden;
}
.lojas-body {
  height: 60vh;
  min-height: 220px;
}
.lojas-bar { background: #f8fafc; }
.lojas-badge { font-size: 9px; }
.lojas-tiny { font-size: 9px; }
.lojas-faded { opacity: 0.4; }
.lojas-filters { overflow-x: auto; }
.lojas-food-img { width: 72px; height: 72px; flex-shrink: 0; overflow: hidden; }
.lojas-desc {
  font-size: 10px;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.lojas-store-card--inativa {
  opacity: 0.7;
}
.lojas-store-card {
  border-radius: 16px;
  transition: transform 0.15s, border-color 0.15s;
  &:hover { transform: scale(1.01); border-color: var(--q-positive); }
}
.lojas-store-head { border-radius: 16px; background: #f8fafc; }
.body--dark & {
  &.lojas-card { background: #06111a; }
  .lojas-bar, .lojas-store-head { background: #0f172a; }
  .lojas-banner-dark { background: rgba(245, 158, 11, 0.12) !important; color: #fcd34d !important; }
}
</style>