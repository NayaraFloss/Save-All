<script setup>
import FundoSustentavel from "components/FundoSustentavel.vue";
import { useRouter } from "vue-router";
import { ref, computed } from "vue";
import { cidadesDasLojas } from "src/utils/cidades";
import { storeToRefs } from "pinia";
import { useAppStore } from "stores/estadoApp";
const router = useRouter();
const appStore = useAppStore();
const { stores, foods, selectedCity } = storeToRefs(appStore);
const { setSelectedCity, storeBelongsToCity } = appStore;
const cidadesAtendidas = computed(() => cidadesDasLojas(stores.value));
const search = ref("");
const storeTab = ref("hoje");
const storesInCurrentCity = computed(() => {
  return stores.value.filter((store) => storeBelongsToCity(store, selectedCity.value));
});
const storesWithSalesToday = computed(() => {
  const activeStoreIds = new Set(
    foods.value.filter((item) => item.status === "active" && (item.quantity === void 0 || item.quantity > 0)).map((item) => item.lojaId)
  );
  return storesInCurrentCity.value.filter((store) => activeStoreIds.has(store.id));
});
const currentStoresList = computed(() => {
  const baseList = storeTab.value === "hoje" ? storesWithSalesToday.value : storesInCurrentCity.value;
  return baseList.filter(
    (store) => store.name.toLowerCase().includes(search.value.toLowerCase()) || store.category.toLowerCase().includes(search.value.toLowerCase()) || store.address.toLowerCase().includes(search.value.toLowerCase())
  );
});
const getStoreItemsCount = (lojaId) => {
  return foods.value.filter(
    (item) => item.lojaId === lojaId && item.status === "active" && (item.quantity === void 0 || item.quantity > 0)
  ).length;
};
const handleSelectStore = (lojaId) => {
  router.push({ name: 'ListaAlimentos', query: { lojaId } });
};
</script>

<template>
  <q-page class="stores-page column no-wrap">
    <FundoSustentavel />
    <!-- Cabeçalho -->
    <q-toolbar class="bg-white text-dark stores-header">
      <q-btn id="btn-stores-list-back" flat round dense icon="arrow_back" @click="router.push({ name: 'PainelConsumidor' })" />
      <q-toolbar-title class="text-caption text-grey-6 text-uppercase text-weight-medium q-pl-sm">Início</q-toolbar-title>
      <span class="text-caption text-uppercase text-weight-bold text-positive">Estabelecimentos</span>
    </q-toolbar>

    <q-scroll-area class="col">
      <div class="q-pa-md q-gutter-y-md">

        <!-- Título -->
        <div class="text-center">
          <div class="text-caption text-warning text-weight-bold text-uppercase row items-center justify-center q-gutter-x-xs">
            <q-icon name="auto_awesome" size="14px" />
            <span>REDE SUSTENTÁVEL</span>
          </div>
          <div class="text-h6 text-weight-bold text-uppercase">Estabelecimentos Parceiros</div>
          <div class="text-caption text-grey-6 q-mt-xs">
            Escolha um estabelecimento para ver as sacolas disponíveis e fazer seu pedido.
          </div>
        </div>

        <!-- Seletor de cidade -->
        <q-card flat bordered class="narrow">
          <q-card-section class="row items-center justify-between no-wrap q-pa-sm">
            <div class="row items-center no-wrap q-gutter-x-sm">
              <q-icon name="place" color="positive" size="20px" />
              <div>
                <div class="text-caption text-grey-6 text-uppercase text-weight-bold">Filtrando por Cidade:</div>
                <div class="text-caption text-weight-bold">{{ selectedCity }}</div>
              </div>
            </div>
            <q-select
              id="select-city-in-stores"
              :model-value="selectedCity"
              :options="cidadesAtendidas"
              dense
              outlined
              options-dense
              color="positive"
              class="city-select"
              @update:model-value="setSelectedCity"
            />
          </q-card-section>
        </q-card>

        <!-- Abas -->
        <q-tabs
          v-model="storeTab"
          dense
          no-caps
          active-color="positive"
          indicator-color="positive"
          class="narrow bg-grey-3 rounded-borders store-tabs"
        >
          <q-tab id="tab-stores-today" name="hoje" icon="auto_awesome" :label="`Com Vendas Hoje (${storesWithSalesToday.length})`" />
          <q-tab id="tab-stores-all" name="todos" icon="business" :label="`Todos Cadastrados (${storesInCurrentCity.length})`" />
        </q-tabs>

        <!-- Busca -->
        <q-input
          id="input-stores-search"
          v-model="search"
          dense
          outlined
          color="positive"
          class="narrow"
          placeholder="Procurar estabelecimento por nome ou endereço..."
        >
          <template #prepend>
            <q-icon name="search" color="grey-6" />
          </template>
        </q-input>

        <!-- Grade de lojas -->
        <div class="row q-col-gutter-md">
          <div v-for="store in currentStoresList" :key="store.id" class="col-6 col-sm-4 col-md-3">
            <q-card
              flat
              bordered
              v-ripple
              class="store-card full-height column items-center text-center q-pa-md cursor-pointer relative-position"
              @click="handleSelectStore(store.id)"
            >
              <q-badge color="grey-2" text-color="warning" class="rating-badge text-weight-bold">
                <q-icon name="star" color="warning" size="12px" class="q-mr-xs" />
                {{ store.rating }}
              </q-badge>

              <q-avatar size="80px" class="store-logo q-mt-sm">
                <img :src="store.logo" :alt="store.name" />
              </q-avatar>

              <div class="q-mt-md full-width col">
                <div class="text-caption text-weight-bold ellipsis">{{ store.name }}</div>
                <div class="text-caption text-grey-6 text-uppercase ellipsis">{{ store.category }}</div>
                <div class="q-mt-xs">
                  <q-badge v-if="getStoreItemsCount(store.id) > 0" color="positive" outline>
                    {{ getStoreItemsCount(store.id) }} {{ getStoreItemsCount(store.id) === 1 ? "sacola disponível" : "sacolas disponíveis" }}
                  </q-badge>
                  <q-badge v-else color="grey-6" outline>Sem sacolas hoje</q-badge>
                </div>
              </div>

              <q-separator class="full-width q-mt-sm" />
              <div class="row items-center justify-center no-wrap full-width q-pt-sm text-caption text-grey-7">
                <q-icon name="place" size="12px" class="q-mr-xs" />
                <span class="ellipsis">{{ store.address.split('-')[0] }}</span>
              </div>
            </q-card>
          </div>
        </div>

        <div v-if="currentStoresList.length === 0" class="text-center q-py-lg text-grey-6">
          <div class="text-caption text-weight-medium">Nenhum estabelecimento encontrado nesta aba.</div>
          <div class="text-caption">Tente buscar por outro termo ou mude de aba acima.</div>
        </div>
      </div>
    </q-scroll-area>

    <!-- Rodapé -->
    <q-separator />
    <div class="row justify-center q-pa-md no-print stores-footer">
      <q-btn
        id="btn-stores-go-home"
        outline
        rounded
        no-caps
        color="grey-8"
        class="full-width text-weight-bold footer-btn"
        label="Voltar ao Início"
        @click="router.push({ name: 'PainelConsumidor' })"
      />
    </div>
  </q-page>
</template>

<style scoped lang="scss">
.stores-page {
  height: 100%;
  background: #f5f7f8;
}
.stores-header {
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
}
.narrow {
  max-width: 384px;
  margin-left: auto;
  margin-right: auto;
}
.city-select {
  min-width: min(140px, 100%);
}
.store-card {
  transition: box-shadow 0.2s, border-color 0.2s;
  border-top: 2px solid var(--q-positive);
  &:hover {
    border-color: var(--q-positive);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
  }
}
.rating-badge {
  position: absolute;
  top: 10px;
  right: 10px;
}
.store-logo {
  border: 2px solid var(--q-positive);
  padding: 4px;
}
.footer-btn {
  max-width: 384px;
}

.body--dark {
  .stores-page {
    background: #040c13;
  }
  .stores-header {
    background: #08121e !important;
    color: #fff !important;
    border-bottom-color: #1e293b;
  }
  .store-tabs {
    background: #0f1b2a !important;
  }
  .stores-footer {
    background: #08121e;
  }
  .footer-btn {
    color: #cbd5e1 !important;
  }
}
</style>
