<script setup>
import FundoSustentavel from "components/FundoSustentavel.vue";
import { useRouter } from "vue-router";
import { ref, computed, watch, onMounted } from "vue";
import { storeToRefs } from "pinia";
import { useAppStore } from "../stores/estadoApp";
import { servicoSorteio } from "../services/servicoSorteio";
const router = useRouter();
const appStore = useAppStore();
const { stores, foods, selectedCity, cidadesDisponiveis } = storeToRefs(appStore);
const {
  addToCart,
  clearCart,
  marcarSacolaMaxima,
  loadFoods,
  setSelectedCity,
  triggerNotification
} = appStore;
// Atualiza o estoque antes de sortear, para a sacola usar só produtos disponíveis agora
onMounted(() => {
  loadFoods();
});
const category = ref("salgado");
const priceOffer = ref("15.00");
const formErr = ref(null);
const isDrawing = ref(false);
const CATEGORY_DEFAULT_MIN = {
  salgado: 10,
  doce: 8,
  misto: 12
};
const storesWithBothOptions = computed(() => {
  return servicoSorteio.getEligibleStores(selectedCity.value, "misto", stores.value, foods.value);
});
const isMistoAvailable = computed(() => {
  return storesWithBothOptions.value.length > 0;
});
// Pedido mínimo = menor sacola que uma loja consegue montar de verdade com os produtos que tem hoje
const categoryMinValue = computed(() => {
  const minimoReal = servicoSorteio.calcularValorMinimo({
    city: selectedCity.value,
    category: category.value,
    stores: stores.value,
    foods: foods.value
  });
  return minimoReal ?? CATEGORY_DEFAULT_MIN[category.value] ?? 10;
});
// Maior valor que dá para montar hoje (loja com mais alimentos disponíveis)
const maximoDisponivel = computed(() => {
  return servicoSorteio.calcularValorMaximo({
    city: selectedCity.value,
    category: category.value,
    stores: stores.value,
    foods: foods.value
  });
});
const moeda = (n) => `R$ ${Number(n || 0).toFixed(2).replace(".", ",")}`;
const acimaDoMaximo = computed(() => {
  const max = maximoDisponivel.value;
  return !!max && currentNumericPrice.value > max.valor + 0.004;
});
const categoryDisplayName = computed(() => {
  if (category.value === "salgado") return "salgados";
  if (category.value === "doce") return "doces";
  return "misto";
});
const currentNumericPrice = computed(() => {
  const num = parseFloat(priceOffer.value);
  return isNaN(num) ? 0 : num;
});
const amountMissing = computed(() => {
  const diff = categoryMinValue.value - currentNumericPrice.value;
  return diff > 0 ? Number(diff.toFixed(2)) : 0;
});
const progressPercent = computed(() => {
  if (categoryMinValue.value <= 0) return 100;
  const pct = currentNumericPrice.value / categoryMinValue.value * 100;
  return Math.min(100, Math.max(0, Math.round(pct)));
});
const isMinimumReached = computed(() => {
  return currentNumericPrice.value >= categoryMinValue.value;
});
const quickPriceTiers = computed(() => {
  const min = categoryMinValue.value;
  const tiers = [
    { label: `R$ ${min.toFixed(0)},00`, value: min.toFixed(2), desc: "M\xEDnimo da Categoria" },
    { label: "R$ 15,00", value: "15.00", desc: "Recomendada" },
    { label: "R$ 20,00", value: "20.00", desc: "Fam\xEDlia" },
    { label: "R$ 25,00", value: "25.00", desc: "Completa" },
    { label: "R$ 30,00", value: "30.00", desc: "Super Sacola" }
  ];
  return tiers.filter((t) => parseFloat(t.value) >= min).filter((t, idx, arr) => arr.findIndex((x) => parseFloat(x.value) === parseFloat(t.value)) === idx);
});
watch(category, () => {
  formErr.value = null;
});
// Aviso quando a cidade/categoria não tem produto vendável (sem itens publicados)
const mensagemEstoque = computed(() => {
  if (!foods.value.length) return "";
  const situacao = servicoSorteio.diagnosticarEstoque({
    city: selectedCity.value,
    category: category.value,
    stores: stores.value,
    foods: foods.value
  });
  const cidade = String(selectedCity.value).split(",")[0];
  // Produtos vencidos ou ausentes recebem o mesmo aviso neutro: não há itens publicados.
  if (situacao === "vencidos" || situacao === "vazio") {
    return `Sem itens de ${categoryDisplayName.value} publicados em ${cidade} no momento.`;
  }
  return "";
});
// Se o mínimo mudar (troca de categoria ou estoque atualizado) e o valor ficar abaixo, sobe para o mínimo
watch(categoryMinValue, (min) => {
  if (currentNumericPrice.value < min) {
    priceOffer.value = min.toFixed(2);
  }
});
const handleSelectTier = (val) => {
  priceOffer.value = val;
  formErr.value = null;
};
const handleNext = async () => {
  // Uma sacola por vez: só é possível sortear outro pedido depois de pagar ou excluir a sacola atual
  const numPrice = currentNumericPrice.value;
  if (isNaN(numPrice) || numPrice < categoryMinValue.value) {
    const minFormatted = `R$ ${categoryMinValue.value.toFixed(2).replace(".", ",")}`;
    const missingFormatted = `R$ ${amountMissing.value.toFixed(2).replace(".", ",")}`;
    formErr.value = `Faltam ${missingFormatted} para atingir o pedido m\xEDnimo de ${categoryDisplayName.value} (${minFormatted}).`;
    triggerNotification(`Faltam ${missingFormatted} para atingir o pedido m\xEDnimo de ${categoryDisplayName.value} (${minFormatted}).`, "warning");
    return;
  }
  formErr.value = null;
  // Pediu mais do que existe hoje: monta a sacola com o máximo disponível (sem barrar o pedido)
  await realizarSorteio(acimaDoMaximo.value);
};
const realizarSorteio = async (maxima) => {
  isDrawing.value = true;
  try {
    // O sistema sorteia o estabelecimento (rodízio justo) e monta a sacola com produtos reais dele
    const params = {
      city: selectedCity.value,
      category: category.value,
      valor: currentNumericPrice.value,
      stores: stores.value,
      foods: foods.value
    };
    const sorteio = maxima ? servicoSorteio.sortearSacolaMaxima(params) : servicoSorteio.sortearSacola(params);
    clearCart();
    sorteio.itens.forEach((alimento) => addToCart({ ...alimento, surpresa: true }));
    if (maxima) {
      // O resumo do pedido mostra, ao lado do valor, que este foi o máximo disponível hoje
      marcarSacolaMaxima(currentNumericPrice.value, sorteio.valorTotal);
      triggerNotification(`Sacola montada com o máximo disponível hoje: ${moeda(sorteio.valorTotal)}.`, "success");
    } else if (sorteio.isNewCycle) {
      triggerNotification(`\u{1F3B2} Sorteio realizado! Novo ciclo de rod\xEDzio justo iniciado em ${selectedCity.value}.`, "success");
    } else {
      triggerNotification(`\u{1F3B2} Sorteio realizado com sucesso! Loja selecionada no rod\xEDzio justo (1 por estabelecimento).`, "success");
    }
    router.push({ name: 'FinalizarPedido' });
  } catch (err) {
    triggerNotification(err.message || "Erro ao realizar o sorteio de estabelecimento.", "error");
  } finally {
    isDrawing.value = false;
  }
};
</script>

<template>
  <q-page class="pedido-page column no-wrap">
    <FundoSustentavel />
    <!-- Cabeçalho -->
    <q-toolbar class="header-bar bg-white text-dark">
      <q-btn
        id="btn-custom-order-back"
        flat
        round
        dense
        icon="arrow_back"
        @click="router.push({ name: 'PainelConsumidor' })"
      />
      <div class="header-title col-auto q-mx-sm">
        <div class="text-subtitle2 text-weight-bold font-display">Sacola Surpresa</div>
        <div class="text-caption text-grey-6 gt-xs">Sorteio inteligente com rodízio justo de padarias</div>
      </div>
      <q-space />
      <q-select
        id="select-city-in-custom-order"
        :model-value="selectedCity"
        :options="cidadesDisponiveis"
        dense
        outlined
        options-dense
        color="primary"
        class="city-select"
        @update:model-value="(v) => setSelectedCity(v)"
      >
        <template #prepend>
          <q-icon name="place" color="primary" size="18px" />
        </template>
      </q-select>
      <q-avatar size="36px" square color="warning" text-color="white" class="avatar-round q-ml-sm">
        <q-icon name="shopping_bag" size="22px" />
      </q-avatar>
    </q-toolbar>
    <q-separator class="header-sep" />

    <!-- Conteúdo -->
    <div class="col scroll-area q-pa-md q-gutter-y-sm">
      <div class="row q-col-gutter-md main-row">
      <!-- Etapa 1: categoria -->
      <div class="col-12 col-md-5 main-col q-gutter-y-sm">
        <div class="row items-center justify-between">
          <div class="row items-center no-wrap text-weight-bold text-uppercase text-caption font-display">
            <q-avatar size="20px" color="primary" text-color="white" class="q-mr-xs">1</q-avatar>
            <span>Escolha a Categoria</span>
          </div>
        </div>

        <div class="row q-col-gutter-sm category-grid">
          <div class="col-4">
            <q-card
              id="opt-category-salgado"
              flat
              bordered
              clickable
              v-ripple
              class="category-card cursor-pointer full-height"
              :class="{ 'category-card--active-warning': category === 'salgado' }"
              @click="category = 'salgado'"
            >
              <q-card-section class="category-section column items-center text-center q-pa-sm relative-position">
                <q-icon
                  v-if="category === 'salgado'"
                  name="check_circle"
                  color="warning"
                  size="16px"
                  class="absolute-top-right q-ma-xs"
                />
                <div class="category-emoji">🥐</div>
                <div class="text-body2 text-weight-bold font-display">Salgado</div>
                <div class="text-caption text-grey-6 category-desc">Pães, queijos e salgados frescos</div>
              </q-card-section>
            </q-card>
          </div>

          <div class="col-4">
            <q-card
              id="opt-category-doce"
              flat
              bordered
              clickable
              v-ripple
              class="category-card cursor-pointer full-height"
              :class="{ 'category-card--active-warning': category === 'doce' }"
              @click="category = 'doce'"
            >
              <q-card-section class="category-section column items-center text-center q-pa-sm relative-position">
                <q-icon
                  v-if="category === 'doce'"
                  name="check_circle"
                  color="warning"
                  size="16px"
                  class="absolute-top-right q-ma-xs"
                />
                <div class="category-emoji">🍩</div>
                <div class="text-body2 text-weight-bold font-display">Doce</div>
                <div class="text-caption text-grey-6 category-desc">Bolos do dia, sonhos e cucas</div>
              </q-card-section>
            </q-card>
          </div>

          <!-- Misto: apenas padarias com ambas as opções -->
          <div class="col-4">
            <q-card
              id="opt-category-misto"
              flat
              bordered
              clickable
              v-ripple
              class="category-card cursor-pointer full-height"
              :class="{ 'category-card--active-primary': category === 'misto' }"
              @click="category = 'misto'"
            >
              <q-card-section class="category-section column items-center text-center q-pa-sm relative-position">
                <q-icon
                  v-if="category === 'misto'"
                  name="check_circle"
                  color="primary"
                  size="16px"
                  class="absolute-top-right q-ma-xs"
                />
                <div class="category-emoji">🥐🍩</div>
                <div class="text-body2 text-weight-bold text-primary font-display">Misto</div>
                <div class="text-caption text-grey-6 category-desc">Mix surpresa de doces e salgados</div>
                <q-badge color="primary" outline class="q-mt-xs font-mono" style="font-size: 9px">
                  {{ isMistoAvailable ? `${storesWithBothOptions.length} padarias com ambos` : 'Apenas lojas completas' }}
                </q-badge>
              </q-card-section>
            </q-card>
          </div>
        </div>
      </div>

      <!-- Etapa 2: valor -->
      <div class="col-12 col-md-7 main-col q-gutter-y-sm">
        <div class="row items-center justify-between">
          <div class="row items-center no-wrap text-weight-bold text-uppercase text-caption font-display">
            <q-avatar size="20px" color="primary" text-color="white" class="q-mr-xs">2</q-avatar>
            <span>Escolha o Valor</span>
          </div>
        </div>

        <!-- Progresso do valor mínimo -->
        <q-banner
          dense
          rounded
          :class="isMinimumReached ? 'bg-green-1 text-green-9' : 'bg-orange-1 text-orange-9'"
          class="progress-banner"
        >
          <div class="row items-center justify-between no-wrap text-caption q-mb-xs">
            <div v-if="!isMinimumReached" class="row items-center no-wrap">
              <q-icon name="hourglass_top" color="warning" size="14px" class="q-mr-xs" />
              <span>
                Faltam <strong>R$ {{ amountMissing.toFixed(2).replace('.', ',') }}</strong> para atingir o pedido mínimo de {{ categoryDisplayName }} (<strong>R$ {{ categoryMinValue.toFixed(2).replace('.', ',') }}</strong>)
              </span>
            </div>
            <div v-else class="row items-center no-wrap text-weight-bold">
              <q-icon name="check_circle" color="positive" size="14px" class="q-mr-xs" />
              <span>Pedido mínimo de {{ categoryDisplayName }} atingido! (<strong>R$ {{ categoryMinValue.toFixed(2).replace('.', ',') }}</strong>)</span>
            </div>
            <span class="text-weight-bold font-mono q-ml-sm">{{ progressPercent }}%</span>
          </div>
          <q-linear-progress
            rounded
            size="6px"
            :value="progressPercent / 100"
            :color="isMinimumReached ? 'positive' : 'warning'"
            track-color="grey-4"
          />
        </q-banner>

        <!-- Faixas rápidas -->
        <div class="row q-col-gutter-xs tier-row">
          <div v-for="tier in quickPriceTiers" :key="tier.value" class="col-4 col-sm">
            <q-btn
              :id="`btn-tier-${tier.value.replace('.', '-')}`"
              no-caps
              unelevated
              dense
              class="full-width tier-btn q-py-xs font-mono text-weight-bold"
              :color="priceOffer === tier.value ? 'primary' : undefined"
              :outline="priceOffer !== tier.value"
              :text-color="priceOffer === tier.value ? 'white' : 'grey-8'"
              :label="tier.label"
              @click="handleSelectTier(tier.value)"
            >
              <q-tooltip>{{ tier.desc }}</q-tooltip>
            </q-btn>
          </div>
        </div>

        <!-- Valor personalizado -->
        <q-card flat bordered class="value-card">
          <q-card-section class="value-section q-pa-sm q-gutter-y-xs">
            <div class="row items-center justify-between">
              <span class="text-caption text-weight-medium text-grey-7">Ou digite outro valor desejado:</span>
              <span class="text-caption text-grey-6 font-mono">
                Mínimo R$ {{ categoryMinValue.toFixed(2).replace('.', ',') }}
              </span>
            </div>
            <q-input
              id="input-price-offer"
              v-model="priceOffer"
              type="number"
              outlined
              prefix="R$"
              :min="categoryMinValue"
              step="1.00"
              :placeholder="categoryMinValue.toFixed(2)"
              :error="!!formErr"
              :error-message="formErr || ''"
              input-class="text-weight-bold font-mono price-input"
            />

            <!-- Mensagem de agradecimento -->
            <div class="thanks-box row items-center no-wrap q-mt-sm">
              <svg class="thanks-art" viewBox="0 0 160 110" fill="none" aria-hidden="true">
                <circle cx="124" cy="24" r="14" fill="#FFD54F" opacity="0.9" />
                <path d="M0 96 Q40 56 80 80 T160 70 V110 H0 Z" fill="#A5D6A7" />
                <path d="M0 104 Q50 74 100 94 T160 90 V110 H0 Z" fill="#66BB6A" />
                <g class="thanks-tree">
                  <rect x="22" y="66" width="5" height="20" fill="#8D6E63" />
                  <polygon points="24.5,34 36,68 13,68" fill="#388E3C" />
                  <polygon points="24.5,46 38,76 11,76" fill="#43A047" />
                </g>
                <g class="thanks-tree">
                  <rect x="134" y="72" width="4" height="16" fill="#8D6E63" />
                  <polygon points="136,50 145,74 127,74" fill="#2E7D32" />
                </g>
                <path d="M62 62 H98 L93 90 H67 Z" fill="#66BB6A" />
                <rect x="58" y="56" width="44" height="6" rx="3" fill="#E8F5E9" />
                <polygon points="66,56 72,47 76,56" fill="#FFA726" />
                <circle cx="82" cy="52" r="6" fill="#EF5350" />
                <circle cx="92" cy="54" r="4" fill="#FFEE58" />
              </svg>
              <div class="col q-pl-md">
                <div class="thanks-title text-weight-bold font-display">Parabéns pela escolha! 🌱</div>
                <div class="thanks-text">
                  Com a sua Sacola Surpresa de <strong>R$ {{ currentNumericPrice.toFixed(2).replace('.', ',') }}</strong> você
                  evita o desperdício de alimentos, apoia o comércio local de <strong>{{ selectedCity }}</strong> e ainda ajuda o planeta.
                </div>
                <div class="row q-gutter-xs q-mt-xs">
                  <q-chip dense square size="sm" class="thanks-chip">🥖 Menos desperdício</q-chip>
                  <q-chip dense square size="sm" class="thanks-chip">🌍 Planeta agradece</q-chip>
                  <q-chip dense square size="sm" class="thanks-chip">🤝 Comércio local</q-chip>
                </div>
              </div>
            </div>
          </q-card-section>
        </q-card>


        <q-banner v-if="mensagemEstoque" dense rounded class="aviso-estoque text-caption">
          <template #avatar>
            <q-icon name="inventory_2" color="warning" />
          </template>
          {{ mensagemEstoque }}
        </q-banner>

        <!-- Ação: fica logo abaixo do valor; só libera a partir do pedido mínimo -->
        <q-btn
          id="btn-custom-order-submit"
          unelevated
          no-caps
          color="primary"
          class="full-width text-weight-bold text-uppercase q-py-sm acao-pedido"
          icon-right="chevron_right"
          :loading="isDrawing"
          :disable="isDrawing || !isMinimumReached || !!mensagemEstoque"
          :label="`Fazer pedido (R$ ${currentNumericPrice.toFixed(2)})`"
          @click="handleNext"
        />
        <div v-if="!isMinimumReached" class="text-caption text-center text-negative q-mt-xs">
          O valor precisa ser de, no mínimo, R$ {{ categoryMinValue.toFixed(2).replace('.', ',') }}.
        </div>
      </div>
      </div>

    </div>
  </q-page>
</template>

<style scoped lang="scss">

.pedido-page {
  // Ocupa a área disponível (descontados topo e menu do cliente)
  height: 100%;
  overflow: hidden;
}

.header-bar {
  flex-shrink: 0;
  position: relative;
  z-index: 10;
  min-height: 56px;
  background: #fff;
}

.header-sep {
  position: relative;
  z-index: 10;
}

.header-title {
  min-width: 0;
  white-space: nowrap;
}

.scroll-area {
  position: relative;
  z-index: 1;
  overflow-y: auto;
  min-height: 0;
}

.avatar-round {
  border-radius: 12px;
}

.city-select {
  min-width: min(170px, 100%);
  max-width: 220px;
  background: #fff;
  border-radius: 4px;
}

.category-card {
  transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
  opacity: 0.85;

  &:hover {
    opacity: 1;
  }

  &--active-warning {
    opacity: 1;
    transform: scale(1.02);
    border-color: var(--q-warning);
    box-shadow: 0 0 0 2px rgba(255, 167, 38, 0.4);
  }

  &--active-primary {
    opacity: 1;
    transform: scale(1.02);
    border-color: var(--q-primary);
    box-shadow: 0 0 0 2px rgba(102, 187, 106, 0.4);
  }
}

.category-emoji {
  font-size: 28px;
  line-height: 1.2;
  margin-bottom: 4px;
}

.category-desc {
  font-size: 10px;
  line-height: 1.2;
}

:deep(.price-input) {
  font-size: 18px;
}

// Telas grandes: os blocos crescem e ocupam toda a altura disponível
@media (min-width: 1024px) {
  .scroll-area {
    display: flex;
    flex-direction: column;
    padding: 20px 24px;
  }

  .main-row {
    flex: 1 1 auto;
    align-items: stretch;
    min-height: 0;
  }

  .main-col {
    display: flex;
    flex-direction: column;
  }

  .category-grid {
    flex: 1 1 auto;
    flex-direction: column;
    flex-wrap: nowrap;

    > div {
      display: flex;
      flex: 1 1 0;
      width: 100%;
      max-width: 100%;
    }
  }

  .category-card {
    flex: 1;
    display: flex;
  }

  .category-section {
    flex: 1;
    justify-content: center;
    padding: 16px;
  }

  .category-emoji { font-size: 52px; margin-bottom: 8px; }
  .category-desc { font-size: 13px; }

  .thanks-art { width: 190px; }
  .thanks-title { font-size: 18px; }
  .thanks-text { font-size: 14px; }

  .tier-row { flex: 0 0 auto; }

  .tier-btn {
    min-height: 64px;
    font-size: 18px;
  }

  .progress-banner { padding: 14px 16px; font-size: 14px; }

  .value-card {
    flex: 1 1 auto;
    display: flex;
  }

  .value-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 12px;
    padding: 20px;
  }

  :deep(.price-input) {
    font-size: 28px;
  }

}

.progress-banner {
  transition: background-color 0.3s;
}

.thanks-box {
  background: linear-gradient(135deg, rgba(102, 187, 106, 0.16), rgba(255, 213, 79, 0.18));
  border: 1px dashed rgba(67, 160, 71, 0.5);
  border-radius: 14px;
  padding: 12px 14px;
}

.thanks-art {
  width: 150px;
  max-width: 34%;
  flex: none;
}

.thanks-tree {
  transform-origin: bottom center;
  animation: thanks-sway 4s ease-in-out infinite;
}

@keyframes thanks-sway {
  0%, 100% { transform: rotate(-1.5deg); }
  50% { transform: rotate(1.5deg); }
}

.thanks-title {
  font-size: 15px;
  color: #2e7d32;
}

.thanks-text {
  font-size: 12px;
  line-height: 1.4;
  opacity: 0.85;
}

.thanks-chip {
  background: rgba(255, 255, 255, 0.75);
  color: #2e7d32;
  font-weight: 600;
}

.body--dark {
  .thanks-title { color: #a5d6a7; }
  .thanks-chip { background: rgba(255, 255, 255, 0.1); color: #a5d6a7; }

  .city-select {
    background: transparent;
  }

  .header-bar {
    background: #07131d !important;
    color: #fff;
  }

  .progress-banner.bg-green-1 {
    background: rgba(102, 187, 106, 0.12) !important;
    color: #a5d6a7 !important;
  }

  .progress-banner.bg-orange-1 {
    background: rgba(255, 167, 38, 0.12) !important;
    color: #ffcc80 !important;
  }

  .bg-grey-2 {
    background: rgba(255, 255, 255, 0.06) !important;
    color: #cbd5e1 !important;
  }
}

.aviso-estoque {
  background: rgba(255, 152, 0, 0.12);
  color: inherit;
}

.acao-pedido {
  flex: 0 0 auto;
  min-height: 48px;
}
</style>