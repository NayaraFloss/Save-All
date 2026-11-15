<script setup>
import FundoSustentavel from "components/FundoSustentavel.vue";
import { useRoute, useRouter } from "vue-router";
import { ref, computed, onMounted } from "vue";
import { storeToRefs } from "pinia";
import { useAppStore } from "stores/estadoApp";
import { ordenarPorUrgenciaDeVencimento } from "src/utils/precificacaoDinamica";
const route = useRoute();
const router = useRouter();
const appStore = useAppStore();
const { foods, stores, cart, cartStoreId } = storeToRefs(appStore);
const { addToCart, updateCartQty, getCartSubtotal, loadFoods } = appStore;

const lojaId = computed(() => String(route.query.lojaId || ""));
const currentStore = computed(() => stores.value.find((s) => s.id === lojaId.value) || null);
const selectedCategory = ref("todos");
const activeDetailItem = ref(null);
const showDetail = computed({
  get: () => !!activeDetailItem.value,
  set: (val) => {
    if (!val) activeDetailItem.value = null;
  }
});

const categories = [
  { value: "todos", label: "Todas" },
  { value: "doce", label: "Doces" },
  { value: "salgado", label: "Salgados" },
  { value: "misto", label: "Mistas" }
];
const categoryLabel = (category) =>
  category === "doce" ? "Doce 🍩" : category === "salgado" ? "Salgado 🥐" : "Misto 🥐🍩";

// Sacolas desta loja que ainda podem ser compradas
const storeBags = computed(() =>
  foods.value.filter(
    (item) => item.lojaId === lojaId.value && item.status === "active" && (item.quantity === void 0 || item.quantity > 0)
  )
);
// Itens com alerta de vencimento mais avançado (faixa mais alta) aparecem primeiro.
const filteredBags = computed(() =>
  ordenarPorUrgenciaDeVencimento(
    storeBags.value.filter((item) => selectedCategory.value === "todos" || item.category === selectedCategory.value)
  )
);

// Preço vigente: calculado pela validade no momento (o preço gravado é só o preço cheio)
const precoVigente = (item) => Number(item.calc?.precoComDesconto ?? item.precoComDesconto) || 0;
const hasPrice = (item) => precoVigente(item) > 0;
const money = (v) => `R$ ${Number(v || 0).toFixed(2).replace(".", ",")}`;
const percentualDesconto = (item) => {
  const original = Number(item.precoOriginal) || 0;
  const price = precoVigente(item);
  return original > price && price > 0 ? Math.round((1 - price / original) * 100) : 0;
};

// Quanto desta sacola já está no carrinho (só vale se o carrinho for desta loja)
const qtyInCart = (item) => {
  if (cartStoreId.value !== lojaId.value) return 0;
  return cart.value.find((c) => c.itemId === item.id)?.quantity || 0;
};
const maxQty = (item) => (item.quantity === void 0 ? 99 : item.quantity);
const canAdd = (item) => hasPrice(item) && qtyInCart(item) < maxQty(item);

const handleAdd = (item) => {
  if (!hasPrice(item)) return;
  if (qtyInCart(item) >= maxQty(item)) {
    appStore.triggerNotification("Você já pegou todas as unidades disponíveis desta sacola.", "warning");
    return;
  }
  addToCart(item);
};
const handleMinus = (item) => updateCartQty(item.id, qtyInCart(item) - 1);

const cartCount = computed(() => (cartStoreId.value === lojaId.value ? cart.value.reduce((n, i) => n + i.quantity, 0) : 0));
const cartTotal = computed(() => (cartStoreId.value === lojaId.value ? getCartSubtotal() : 0));

onMounted(async () => {
  if (!lojaId.value) {
    router.replace({ name: "ListaLojas" });
    return;
  }
  // atualiza o estoque com o que as lojas publicaram agora
  await loadFoods();
});
</script>

<template>
  <q-page class="foods-page column no-wrap">
    <FundoSustentavel />
    <!-- Cabeçalho -->
    <q-toolbar class="bg-white text-dark foods-header">
      <q-btn id="btn-foods-list-back" flat round dense icon="arrow_back" @click="router.push({ name: 'ListaLojas' })" />
      <q-toolbar-title class="q-pl-sm">
        <div class="text-caption text-grey-6 text-uppercase text-weight-medium">Estabelecimento</div>
        <div class="text-subtitle2 text-weight-bold ellipsis store-name">{{ currentStore?.name || "Carregando..." }}</div>
      </q-toolbar-title>
      <q-btn
        id="btn-foods-open-bag"
        flat
        round
        dense
        icon="shopping_bag"
        :disable="cartCount === 0"
        @click="router.push({ name: 'FinalizarPedido' })"
      >
        <q-badge v-if="cartCount > 0" color="secondary" floating>{{ cartCount }}</q-badge>
      </q-btn>
    </q-toolbar>

    <!-- Conteúdo -->
    <q-scroll-area class="col">
      <div class="q-pa-md q-gutter-y-md">
        <div v-if="currentStore" class="text-center">
          <div class="text-h6 text-weight-bold">Sacolas disponíveis</div>
          <div class="text-caption text-grey-6">
            {{ currentStore.address }}
          </div>
        </div>

        <!-- Filtros de categoria -->
        <div class="row justify-center q-gutter-sm">
          <q-chip
            v-for="cat in categories"
            :key="cat.value"
            clickable
            :color="selectedCategory === cat.value ? 'warning' : undefined"
            :text-color="selectedCategory === cat.value ? 'dark' : undefined"
            :outline="selectedCategory !== cat.value"
            class="text-weight-bold"
            @click="selectedCategory = cat.value"
          >
            {{ cat.label }}
          </q-chip>
        </div>

        <!-- Grade de sacolas -->
        <div class="row q-col-gutter-md">
          <div v-for="item in filteredBags" :key="item.id" class="col-12 col-sm-6 col-md-4">
            <q-card flat bordered class="food-card full-height column q-pa-sm">
              <div class="row no-wrap items-start">
                <q-avatar size="84px" class="food-avatar cursor-pointer" @click="activeDetailItem = item">
                  <img :src="item.image" :alt="item.name" />
                </q-avatar>
                <div class="col q-pl-sm">
                  <div class="text-subtitle2 text-weight-bold food-name">{{ item.name }}</div>
                  <q-badge color="positive" text-color="white" class="q-my-xs" outline>
                    {{ categoryLabel(item.category) }}
                  </q-badge>
                  <div class="text-caption text-grey-6 food-desc">{{ item.description }}</div>
                </div>
              </div>

              <q-space />

              <div class="row items-center justify-between q-mt-sm">
                <div v-if="hasPrice(item)">
                  <span class="text-subtitle1 text-weight-bold text-positive">{{ money(precoVigente(item)) }}</span>
                  <span v-if="percentualDesconto(item) > 0" class="text-caption text-grey-6 q-ml-xs original-price">
                    {{ money(item.precoOriginal) }}
                  </span>
                  <q-badge v-if="percentualDesconto(item) > 0" color="orange" class="q-ml-xs">-{{ percentualDesconto(item) }}%</q-badge>
                </div>
                <div v-else class="text-caption text-grey-6">Preço ainda não definido pela loja</div>
                <div class="text-caption text-grey-7">
                  {{ item.quantity === void 0 ? "" : item.quantity === 1 ? "Resta 1" : `Restam ${item.quantity}` }}
                </div>
              </div>

              <div class="row items-center q-mt-sm q-gutter-x-sm">
                <q-btn flat dense no-caps color="grey-8" icon="visibility" label="Detalhes" class="text-weight-bold" @click="activeDetailItem = item" />
                <q-space />
                <template v-if="qtyInCart(item) > 0">
                  <q-btn round dense unelevated color="grey-3" text-color="grey-9" icon="remove" @click="handleMinus(item)" />
                  <span class="text-weight-bold">{{ qtyInCart(item) }}</span>
                  <q-btn round dense unelevated color="positive" icon="add" :disable="!canAdd(item)" @click="handleAdd(item)" />
                </template>
                <q-btn
                  v-else
                  unelevated
                  dense
                  no-caps
                  color="positive"
                  icon="add_shopping_cart"
                  label="Adicionar"
                  class="text-weight-bold q-px-sm"
                  :disable="!canAdd(item)"
                  @click="handleAdd(item)"
                />
              </div>
            </q-card>
          </div>
        </div>

        <div v-if="filteredBags.length === 0" class="text-center q-py-xl text-grey-6">
          <q-icon name="shopping_bag" size="32px" color="warning" class="q-mb-sm" />
          <div class="text-caption text-weight-medium">Nenhuma sacola disponível neste estabelecimento agora.</div>
          <div class="text-caption">Volte mais tarde ou escolha outra loja.</div>
        </div>
      </div>
    </q-scroll-area>

    <!-- Rodapé -->
    <q-separator />
    <div class="foods-footer column items-center q-pa-md q-gutter-y-sm">
      <q-btn
        v-if="cartCount > 0"
        id="btn-foods-go-checkout"
        unelevated
        rounded
        no-caps
        color="positive"
        class="full-width text-weight-bold footer-btn"
        :label="`Ver minha sacola (${cartCount}) · ${money(cartTotal)}`"
        @click="router.push({ name: 'FinalizarPedido' })"
      />
      <q-btn
        id="btn-foods-back-stores"
        outline
        rounded
        no-caps
        color="grey-8"
        class="full-width text-weight-bold footer-btn"
        label="← Voltar aos Estabelecimentos"
        @click="router.push({ name: 'ListaLojas' })"
      />
    </div>

    <!-- Detalhes da sacola -->
    <q-dialog v-model="showDetail" position="bottom">
      <q-card v-if="activeDetailItem" class="detail-card">
        <q-card-section class="row items-start no-wrap">
          <div class="col">
            <div class="text-caption text-positive text-uppercase">{{ currentStore?.name }}</div>
            <div class="text-h6 text-weight-bold">{{ activeDetailItem.name }}</div>
            <div class="text-caption text-warning text-uppercase text-weight-bold">{{ categoryLabel(activeDetailItem.category) }}</div>
          </div>
          <q-btn flat round dense icon="close" color="grey-6" @click="activeDetailItem = null" />
        </q-card-section>

        <q-card-section class="q-pt-none">
          <q-img :src="activeDetailItem.image" :alt="activeDetailItem.name" :ratio="16 / 9" class="rounded-borders" />
        </q-card-section>

        <q-card-section class="q-pt-none q-gutter-y-sm">
          <div>
            <div class="text-subtitle2 text-weight-bold">O que vem na sacola</div>
            <div class="text-caption text-grey-6" style="white-space: pre-line">{{ activeDetailItem.description }}</div>
          </div>
          <div v-if="hasPrice(activeDetailItem)" class="text-subtitle1 text-weight-bold text-positive">
            {{ money(precoVigente(activeDetailItem)) }}
            <span v-if="percentualDesconto(activeDetailItem) > 0" class="text-caption text-grey-6 q-ml-xs original-price">{{ money(activeDetailItem.precoOriginal) }}</span>
          </div>
          <div v-if="activeDetailItem.dataValidade" class="text-caption text-grey-7">
            Produzido para consumo até {{ String(activeDetailItem.dataValidade).slice(0, 10).split("-").reverse().join("/") }}
          </div>
        </q-card-section>

        <q-separator />
        <q-card-actions>
          <q-btn
            unelevated
            no-caps
            color="positive"
            icon="add_shopping_cart"
            class="full-width text-weight-bold"
            label="Adicionar à sacola"
            :disable="!canAdd(activeDetailItem)"
            @click="handleAdd(activeDetailItem)"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<style scoped lang="scss">
.foods-page {
  height: calc(100vh - 50px);
  background: #f5f7f8;
}
.foods-header {
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
}
.store-name {
  max-width: 200px;
}
.food-avatar {
  border: 2px solid rgba(251, 191, 36, 0.45);
  padding: 2px;
}
.food-name,
.food-desc {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.original-price {
  text-decoration: line-through;
}
.detail-card {
  width: 100%;
  max-width: 448px;
  max-height: 85vh;
  overflow-y: auto;
}
.footer-btn {
  max-width: 384px;
}
.foods-footer {
  flex-shrink: 0;
}

.body--dark {
  .foods-page {
    background: #040c13;
  }
  .foods-header {
    background: #08121e !important;
    color: #fff !important;
    border-bottom-color: #1e293b;
  }
  .foods-footer {
    background: #08121e;
  }
  .footer-btn {
    color: #e2e8f0 !important;
  }
}
</style>
