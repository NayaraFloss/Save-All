<script setup>
// Apresenta e ajusta a configuração de preços dinâmicos da loja.
import { ref, computed } from "vue";
import {
  DEFAULT_DYNAMIC_PRICING_CONFIG,
  DYNAMIC_PRICING_LIMITS,
  calculateDynamicPricing,
  formatarDataBR,
} from "../../utils/precificacaoDinamica";
// Entradas recebidas do componente pai que configuram os dados e opções desta tela.
const props = defineProps({
  lojaId: String,
  darkMode: Boolean,
  storeFoods: { type: Array, default: () => [] },
  foods: { type: Array, default: () => [] },
  initialConfig: { type: Object, default: undefined }
});
// Eventos emitidos para o componente pai executar as ações fora desta interface.
const emit = defineEmits(["saved", "save-config", "trigger-disposal", "notification"]);
// Estado local reativo usado para acompanhar seleções, formulários e etapas da interface.
const enabled = ref(props.initialConfig?.enabled ?? true);
const faixa1Discount = ref(props.initialConfig?.faixa1Discount ?? DEFAULT_DYNAMIC_PRICING_CONFIG.faixa1Discount);
const faixa2Discount = ref(props.initialConfig?.faixa2Discount ?? DEFAULT_DYNAMIC_PRICING_CONFIG.faixa2Discount);
const faixa3Discount = ref(props.initialConfig?.faixa3Discount ?? DEFAULT_DYNAMIC_PRICING_CONFIG.faixa3Discount);
const isSaved = ref(false);
const showSimulatorModal = ref(false);
// Valores derivados das entradas e do estado para manter a apresentação sincronizada.
const activeConfig = computed(() => ({
  enabled: enabled.value,
  faixa1Discount: Number(faixa1Discount.value),
  faixa2Discount: Number(faixa2Discount.value),
  faixa3Discount: Number(faixa3Discount.value)
}));
// Ações da tela validam a interação e encaminham as alterações ou eventos necessários.
const getFaixaBadgeProps = (index) => {
  if (props.darkMode) {
    if (index === 4) return { color: "grey-8", textColor: "grey-3" };
    if (index === 3) return { color: "red-10", textColor: "red-3" };
    if (index === 2) return { color: "orange-10", textColor: "orange-3" };
    if (index === 1) return { color: "yellow-10", textColor: "yellow-3" };
    return { color: "green-10", textColor: "green-3" };
  }
  if (index === 4) return { color: "grey-3", textColor: "grey-10" };
  if (index === 3) return { color: "red-1", textColor: "red-10" };
  if (index === 2) return { color: "orange-1", textColor: "orange-10" };
  if (index === 1) return { color: "yellow-2", textColor: "yellow-10" };
  return { color: "green-1", textColor: "green-10" };
};
const getProgressColor = (pct) => {
  if (pct >= 100) return "grey-7";
  if (pct >= 90) return "negative";
  if (pct >= 70) return "orange";
  if (pct >= 50) return "yellow-8";
  return "positive";
};
const handleResetDefaults = () => {
  faixa1Discount.value = DEFAULT_DYNAMIC_PRICING_CONFIG.faixa1Discount;
  faixa2Discount.value = DEFAULT_DYNAMIC_PRICING_CONFIG.faixa2Discount;
  faixa3Discount.value = DEFAULT_DYNAMIC_PRICING_CONFIG.faixa3Discount;
  enabled.value = true;
  emit("notification", "Configura\xE7\xF5es restauradas para os padr\xF5es da plataforma!", "success");
};
const handleSave = () => {
  emit("save-config", activeConfig.value);
  isSaved.value = true;
  setTimeout(() => {
    isSaved.value = false;
  }, 2500);
  emit("notification", "Regras de precifica\xE7\xE3o din\xE2mica salvas com sucesso!", "success");
};
const now = /* @__PURE__ */ new Date();
const defaultFab = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1e3).toISOString().substring(0, 10);
const defaultExp = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1e3).toISOString().substring(0, 10);
const simProductName = ref("P\xE3o Franc\xEAs Artesanal");
const simOriginalPrice = ref(10);
const simFabricationDate = ref(defaultFab);
const simExpirationDate = ref(defaultExp);
const applyPreset = (presetType) => {
  const current = /* @__PURE__ */ new Date();
  if (presetType === "example") {
    simProductName.value = "P\xE3o de Forma Especial";
    simOriginalPrice.value = 10;
    simFabricationDate.value = new Date(current.getTime() - 8 * 24 * 60 * 60 * 1e3).toISOString().substring(0, 10);
    simExpirationDate.value = new Date(current.getTime() + 2 * 24 * 60 * 60 * 1e3).toISOString().substring(0, 10);
  } else if (presetType === "short") {
    simProductName.value = "Sandu\xEDche Natural";
    simOriginalPrice.value = 18;
    simFabricationDate.value = new Date(current.getTime() - 2 * 24 * 60 * 60 * 1e3).toISOString().substring(0, 10);
    simExpirationDate.value = new Date(current.getTime() + 2 * 24 * 60 * 60 * 1e3).toISOString().substring(0, 10);
  } else if (presetType === "critical") {
    simProductName.value = "Bolo Decorado Morango";
    simOriginalPrice.value = 45;
    simFabricationDate.value = new Date(current.getTime() - 9.5 * 24 * 60 * 60 * 1e3).toISOString().substring(0, 10);
    simExpirationDate.value = new Date(current.getTime() + 0.5 * 24 * 60 * 60 * 1e3).toISOString().substring(0, 10);
  } else if (presetType === "expired") {
    simProductName.value = "Iogurte Natural de Frutas";
    simOriginalPrice.value = 8.5;
    simFabricationDate.value = new Date(current.getTime() - 10 * 24 * 60 * 60 * 1e3).toISOString().substring(0, 10);
    simExpirationDate.value = new Date(current.getTime() - 1 * 24 * 60 * 60 * 1e3).toISOString().substring(0, 10);
  }
};
const simResult = computed(() => {
  return calculateDynamicPricing(
    simFabricationDate.value,
    simExpirationDate.value,
    simOriginalPrice.value,
    activeConfig.value
  );
});
const myFoods = computed(() => {
  return props.foods.filter((f) => f.lojaId === props.lojaId);
});
const calculatedInventory = computed(() => {
  return myFoods.value.map((food) => {
    let fabDate = food.dataFabricacao;
    if (!fabDate) {
      const exp = new Date(food.dataValidade);
      fabDate = new Date(exp.getTime() - 5 * 24 * 60 * 60 * 1e3).toISOString().substring(0, 10);
    }
    const calc = calculateDynamicPricing(
      fabDate,
      food.dataValidade,
      food.precoOriginal,
      activeConfig.value
    );
    return {
      food,
      fabDate,
      calc
    };
  });
});
</script>

<template>
<!-- Interface principal: apresenta e ajusta a configuração de preços dinâmicos da loja. -->
  <div class="pricing-root column q-gutter-y-md">
    <!-- Cabeçalho -->
    <q-card flat bordered :dark="darkMode">
      <q-card-section class="column items-center text-center q-gutter-y-sm">
        <div class="row items-center justify-center q-gutter-sm">
          <q-badge color="positive" outline class="text-weight-bold text-uppercase mono">
            ⚡ Governança 7.3 — ODS 12
          </q-badge>
          <q-badge color="warning" outline class="text-weight-bold text-uppercase mono">
            Precificação Inteligente
          </q-badge>
        </div>

        <div class="text-h5 text-weight-bold">Precificação Dinâmica por Validade</div>

        <div class="text-body2 text-grey-7 intro-text">
          Ajuste automaticamente os descontos de seus produtos conforme a proximidade da data de vencimento, otimizando vendas e reduzindo desperdícios.
        </div>

        <div class="row items-center justify-center q-gutter-sm q-pt-sm">
          <q-card flat bordered :dark="darkMode">
            <q-card-section class="row items-center no-wrap q-gutter-x-md q-py-sm">
              <div class="text-left">
                <div class="text-caption text-weight-bold text-uppercase text-grey-7 mono">Status</div>
                <div
                  class="text-caption text-weight-bold"
                  :class="enabled ? (darkMode ? 'text-green-4' : 'text-green-9') : 'text-grey-6'"
                >
                  {{ enabled ? 'AUTOMAÇÃO ATIVA' : 'DESATIVADA' }}
                </div>
              </div>
              <q-toggle v-model="enabled" color="positive" :dark="darkMode" />
            </q-card-section>
          </q-card>

          <q-btn
            unelevated
            no-caps
            color="positive"
            icon="science"
            label="Testar / Simular Regras"
            class="text-weight-bold mono"
            @click="showSimulatorModal = true"
          />
        </div>
      </q-card-section>
    </q-card>

    <!-- Fórmula -->
    <q-banner rounded :class="['text-center', darkMode ? 'bg-grey-10 text-grey-4' : 'bg-green-1 text-green-10']">
      <div class="row items-center justify-center q-gutter-x-sm text-caption text-weight-bold text-uppercase mono">
        <q-icon name="calculate" size="18px" />
        <span>Fórmula de Cálculo Automático</span>
      </div>
      <q-card flat bordered :dark="darkMode" class="formula-box q-mx-auto q-mt-sm">
        <q-card-section class="q-pa-sm text-caption text-weight-bold mono">
          % Consumido = (Dias decorridos ÷ Prazo total) × 100
        </q-card-section>
      </q-card>
    </q-banner>

    <!-- Faixas -->
    <div class="column q-gutter-y-md">
      <div class="row items-center justify-between q-gutter-sm">
        <div class="row items-center q-gutter-x-sm text-caption text-weight-bold text-uppercase">
          <q-icon name="tune" size="18px" color="positive" />
          <span>Ajuste das Faixas de Desconto</span>
        </div>
        <q-btn
          outline
          dense
          no-caps
          size="sm"
          color="grey-7"
          icon="restart_alt"
          label="Restaurar Padrões"
          class="text-weight-bold mono"
          @click="handleResetDefaults"
        />
      </div>

      <div class="row q-col-gutter-md">
        <div class="col-12 col-md-4">
          <q-card flat bordered :dark="darkMode" class="full-height">
            <q-card-section class="column q-gutter-y-xs">
              <q-badge outline :color="amber" class="text-weight-bold mono self-start">50% a 69% do prazo</q-badge>
              <div class="text-caption text-weight-bold text-uppercase">Faixa 1 – Atenção</div>
              <div class="text-caption text-grey-7">Desconto inicial quando metade da validade expirou.</div>
            </q-card-section>
            <q-separator :dark="darkMode" />
            <q-card-section class="column q-gutter-y-xs">
              <div class="row items-center justify-between mono">
                <span class="text-caption text-weight-bold text-uppercase text-grey-7">Desconto:</span>
                <span class="text-h6 text-weight-bold" :class="darkMode ? 'text-yellow-4' : 'text-amber-9'">{{ faixa1Discount }}%</span>
              </div>
              <q-slider
                v-model="faixa1Discount"
                :min="DYNAMIC_PRICING_LIMITS.faixa1.min"
                :max="DYNAMIC_PRICING_LIMITS.faixa1.max"
                :step="1"
                :color="amber"
                :dark="darkMode"
              />
              <div class="row items-center justify-between text-caption text-weight-bold text-grey-7 mono">
                <span>Min: 5%</span>
                <span :class="darkMode ? 'text-yellow-4' : 'text-amber-9'">Padrão: 10%</span>
                <span>Max: 20%</span>
              </div>
            </q-card-section>
          </q-card>
        </div>
        <div class="col-12 col-md-4">
          <q-card flat bordered :dark="darkMode" class="full-height">
            <q-card-section class="column q-gutter-y-xs">
              <q-badge outline :color="orange" class="text-weight-bold mono self-start">70% a 89% do prazo</q-badge>
              <div class="text-caption text-weight-bold text-uppercase">Faixa 2 – Alerta</div>
              <div class="text-caption text-grey-7">Acelera o giro comercial na reta final do produto.</div>
            </q-card-section>
            <q-separator :dark="darkMode" />
            <q-card-section class="column q-gutter-y-xs">
              <div class="row items-center justify-between mono">
                <span class="text-caption text-weight-bold text-uppercase text-grey-7">Desconto:</span>
                <span class="text-h6 text-weight-bold" :class="darkMode ? 'text-orange-4' : 'text-orange-9'">{{ faixa2Discount }}%</span>
              </div>
              <q-slider
                v-model="faixa2Discount"
                :min="DYNAMIC_PRICING_LIMITS.faixa2.min"
                :max="DYNAMIC_PRICING_LIMITS.faixa2.max"
                :step="1"
                :color="orange"
                :dark="darkMode"
              />
              <div class="row items-center justify-between text-caption text-weight-bold text-grey-7 mono">
                <span>Min: 15%</span>
                <span :class="darkMode ? 'text-orange-4' : 'text-orange-9'">Padrão: 25%</span>
                <span>Max: 40%</span>
              </div>
            </q-card-section>
          </q-card>
        </div>
        <div class="col-12 col-md-4">
          <q-card flat bordered :dark="darkMode" class="full-height">
            <q-card-section class="column q-gutter-y-xs">
              <q-badge outline :color="negative" class="text-weight-bold mono self-start">90% a 99% do prazo</q-badge>
              <div class="text-caption text-weight-bold text-uppercase">Faixa 3 – Crítico</div>
              <div class="text-caption text-grey-7">Liquidação de emergência para resgate imediato.</div>
            </q-card-section>
            <q-separator :dark="darkMode" />
            <q-card-section class="column q-gutter-y-xs">
              <div class="row items-center justify-between mono">
                <span class="text-caption text-weight-bold text-uppercase text-grey-7">Desconto:</span>
                <span class="text-h6 text-weight-bold" :class="darkMode ? 'text-red-4' : 'text-red-9'">{{ faixa3Discount }}%</span>
              </div>
              <q-slider
                v-model="faixa3Discount"
                :min="DYNAMIC_PRICING_LIMITS.faixa3.min"
                :max="DYNAMIC_PRICING_LIMITS.faixa3.max"
                :step="1"
                :color="negative"
                :dark="darkMode"
              />
              <div class="row items-center justify-between text-caption text-weight-bold text-grey-7 mono">
                <span>Min: 30%</span>
                <span :class="darkMode ? 'text-red-4' : 'text-red-9'">Padrão: 50%</span>
                <span>Max: 70%</span>
              </div>
            </q-card-section>
          </q-card>
        </div>
      </div>

      <!-- Faixas fixas -->
      <div class="row q-col-gutter-md">
        <div class="col-12 col-md-6">
          <q-card flat bordered :dark="darkMode">
            <q-card-section class="row items-center no-wrap q-gutter-x-md q-pa-sm">
              <q-badge :color="getFaixaBadgeProps(0).color" :text-color="getFaixaBadgeProps(0).textColor" class="text-weight-bold mono q-pa-sm">
                0% – 49%
              </q-badge>
              <div>
                <div class="text-caption text-weight-bold">Faixa 0 – Normal</div>
                <div class="text-caption text-grey-7">Prazo regular sem desconto (Preço cheio).</div>
              </div>
            </q-card-section>
          </q-card>
        </div>
        <div class="col-12 col-md-6">
          <q-card flat bordered :dark="darkMode">
            <q-card-section class="row items-center no-wrap q-gutter-x-md q-pa-sm">
              <q-badge :color="getFaixaBadgeProps(4).color" :text-color="getFaixaBadgeProps(4).textColor" class="text-weight-bold mono q-pa-sm">
                100%
              </q-badge>
              <div>
                <div class="text-caption text-weight-bold">Faixa 4 – Limite</div>
                <div class="text-caption text-grey-7">Remoção da vitrine → Direcionado para Doação/Descarte.</div>
              </div>
            </q-card-section>
          </q-card>
        </div>
      </div>

      <!-- Salvar -->
      <div class="row justify-center q-pt-sm">
        <q-btn
          unelevated
          no-caps
          color="positive"
          icon="save"
          :icon-right="isSaved ? 'check' : undefined"
          :label="isSaved ? 'Configurações Salvas!' : 'Salvar Regras de Precificação'"
          class="save-btn text-weight-bold text-uppercase q-py-sm"
          @click="handleSave"
        />
      </div>
    </div>

    <!-- Impacto no estoque -->
    <q-card flat bordered :dark="darkMode">
      <q-card-section class="row items-center justify-between q-gutter-sm">
        <div>
          <div class="row items-center q-gutter-x-sm text-caption text-weight-bold text-uppercase">
            <q-icon name="sell" size="18px" color="positive" />
            <span>Impacto no Estoque Atual da Loja</span>
          </div>
          <div class="text-caption text-grey-7">Itens com cálculo de preço dinâmico aplicados.</div>
        </div>
        <q-badge outline color="grey-7" class="text-weight-bold mono q-pa-xs q-px-sm">
          {{ calculatedInventory.length }} item(ns)
        </q-badge>
      </q-card-section>

      <q-separator :dark="darkMode" />

      <q-card-section v-if="calculatedInventory.length === 0" class="text-center text-caption text-grey-6 text-italic q-py-lg">
        Nenhum item cadastrado para este estabelecimento.
      </q-card-section>

      <q-list v-else separator :dark="darkMode">
        <q-item
          v-for="item in calculatedInventory"
          :key="item.food.id"
          :class="['inventory-item', { 'inventory-item--expired': item.calc.vencido }]"
        >
          <q-item-section avatar>
            <q-avatar square size="44px" class="food-thumb">
              <img :src="item.food.image" :alt="item.food.name" />
            </q-avatar>
          </q-item-section>

          <q-item-section>
            <div class="row items-center q-gutter-x-sm">
              <span class="text-caption text-weight-bold">{{ item.food.name }}</span>
              <q-badge
                :color="getFaixaBadgeProps(item.calc.faixaIndex).color"
                :text-color="getFaixaBadgeProps(item.calc.faixaIndex).textColor"
                class="text-weight-bold mono"
              >
                {{ item.calc.faixaTag }}
              </q-badge>
            </div>
            <div class="text-caption text-grey-7 mono">
              Fab: {{ formatarDataBR(item.fabDate) }} · Val: {{ formatarDataBR(item.food.dataValidade) }}
            </div>
          </q-item-section>

          <q-item-section side>
            <div class="row items-center q-gutter-x-md">
              <div>
                <div class="text-caption text-weight-bold text-uppercase text-grey-7 mono">% Consumido</div>
                <div
                  class="text-caption text-weight-bold mono"
                  :class="item.calc.percentualConsumido >= 90 ? (darkMode ? 'text-red-4' : 'text-red-9') : (darkMode ? 'text-green-4' : 'text-green-9')"
                >
                  {{ item.calc.percentualConsumido }}%
                </div>
              </div>

              <div>
                <div class="text-caption text-weight-bold text-uppercase text-grey-7 mono">Preço Dinâmico</div>
                <div class="row items-baseline q-gutter-x-xs">
                  <span class="text-caption text-weight-bold mono" :class="darkMode ? 'text-amber-4' : 'text-amber-9'">
                    R$ {{ item.calc.precoComDesconto.toFixed(2) }}
                  </span>
                  <span class="text-caption text-grey-6 mono original-price">R$ {{ item.food.precoOriginal.toFixed(2) }}</span>
                </div>
              </div>

              <q-btn
                v-if="item.calc.vencido"
                outline
                dense
                no-caps
                size="sm"
                color="negative"
                icon="volunteer_activism"
                label="Doação / Descarte"
                class="text-weight-bold mono"
                @click="emit('trigger-disposal', item.food)"
              />
              <q-badge v-else outline color="positive" class="text-weight-bold mono">
                Desconto {{ item.calc.percentualDesconto }}%
              </q-badge>
            </div>
          </q-item-section>
        </q-item>
      </q-list>
    </q-card>

    <!-- Simulador -->
    <q-dialog v-model="showSimulatorModal">
      <q-card :dark="darkMode" class="simulator-card">
        <q-card-section class="row items-center no-wrap">
          <q-avatar size="40px" color="green-1" text-color="positive" icon="science" />
          <div class="col q-ml-sm">
            <div class="text-subtitle2 text-weight-bold text-uppercase">Simulador de Precificação</div>
            <div class="text-caption text-grey-7">Teste o cálculo dinâmico informando datas e valores</div>
          </div>
          <q-btn flat round dense icon="close" @click="showSimulatorModal = false" />
        </q-card-section>

        <q-separator :dark="darkMode" />

        <q-card-section class="column q-gutter-y-md">
          <div class="column q-gutter-y-xs">
            <div class="text-caption text-weight-bold text-uppercase text-grey-7 mono">Exemplos Prontos:</div>
            <div class="row items-center q-gutter-sm">
          <q-btn outline dense no-caps size="sm" color="amber" label="Pão 80%" class="text-weight-bold mono" @click="applyPreset('example')" />
          <q-btn outline dense no-caps size="sm" color="yellow-8" label="Sanduíche 50%" class="text-weight-bold mono" @click="applyPreset('short')" />
          <q-btn outline dense no-caps size="sm" color="negative" label="Bolo 95%" class="text-weight-bold mono" @click="applyPreset('critical')" />
          <q-btn outline dense no-caps size="sm" color="grey-7" label="Vencido 100%" class="text-weight-bold mono" @click="applyPreset('expired')" />
            </div>
          </div>

          <q-input v-model="simProductName" outlined dense :dark="darkMode" label="Nome do Produto" />

          <div class="row q-col-gutter-sm">
            <div class="col-12 col-sm-4">
              <q-input
                v-model.number="simOriginalPrice"
                type="number"
                step="0.5"
                min="0"
                outlined
                dense
                :dark="darkMode"
                label="Preço Original (R$)"
              />
            </div>
            <div class="col-12 col-sm-4">
              <q-input v-model="simFabricationDate" type="date" outlined dense :dark="darkMode" stack-label label="Data Fabricação" />
            </div>
            <div class="col-12 col-sm-4">
              <q-input v-model="simExpirationDate" type="date" outlined dense :dark="darkMode" stack-label label="Data Validade" />
            </div>
          </div>

          <!-- Resultado -->
          <q-card flat bordered :dark="darkMode">
            <q-card-section class="row items-center justify-between q-gutter-sm q-py-sm">
              <span class="text-caption text-weight-bold text-uppercase text-grey-7 mono">Resultado do Cálculo</span>
              <q-badge
                :color="getFaixaBadgeProps(simResult.faixaIndex).color"
                :text-color="getFaixaBadgeProps(simResult.faixaIndex).textColor"
                class="text-weight-bold mono q-pa-xs q-px-sm"
              >
                {{ simResult.faixaTag }}
              </q-badge>
            </q-card-section>

            <q-separator :dark="darkMode" />

            <q-card-section class="column q-gutter-y-sm">
              <div>
                <div class="row justify-between text-caption mono">
                  <span class="text-grey-7">Prazo Consumido:</span>
                  <span
                    class="text-weight-bold"
                    :class="simResult.percentualConsumido >= 90 ? (darkMode ? 'text-red-4' : 'text-red-9') : (darkMode ? 'text-green-4' : 'text-green-9')"
                  >
                    {{ simResult.percentualConsumido }}%
                  </span>
                </div>
                <q-linear-progress
                  rounded
                  size="10px"
                  class="q-mt-xs"
                  :value="Math.min(100, simResult.percentualConsumido) / 100"
                  :color="getProgressColor(simResult.percentualConsumido)"
                  :track-color="darkMode ? 'grey-9' : 'grey-3'"
                />
              </div>

              <div class="row q-col-gutter-sm">
                <div class="col-6">
                  <q-card flat bordered :dark="darkMode">
                    <q-card-section class="q-pa-sm">
                      <div class="text-caption text-weight-bold text-uppercase text-grey-7 mono">Desconto</div>
                      <div class="text-h6 text-weight-bold mono" :class="darkMode ? 'text-amber-4' : 'text-amber-9'">
                        -{{ simResult.percentualDesconto }}%
                      </div>
                    </q-card-section>
                  </q-card>
                </div>
                <div class="col-6">
                  <q-card flat bordered :dark="darkMode">
                    <q-card-section class="q-pa-sm">
                      <div class="text-caption text-weight-bold text-uppercase text-grey-7 mono">Preço Final</div>
                      <div class="row items-baseline q-gutter-x-xs">
                        <span class="text-h6 text-weight-bold mono" :class="darkMode ? 'text-green-4' : 'text-green-9'">
                          R$ {{ simResult.precoComDesconto.toFixed(2) }}
                        </span>
                        <span class="text-caption text-grey-6 mono original-price">R$ {{ simResult.precoOriginal.toFixed(2) }}</span>
                      </div>
                    </q-card-section>
                  </q-card>
                </div>
              </div>

              <q-banner
                dense
                rounded
                :class="simResult.vencido
                  ? (darkMode ? 'bg-red-10 text-red-3' : 'bg-red-1 text-red-10')
                  : (darkMode ? 'bg-green-10 text-green-3' : 'bg-green-1 text-green-10')"
              >
                <template #avatar>
                  <q-icon :name="simResult.vencido ? 'warning' : 'verified_user'" :color="simResult.vencido ? 'negative' : 'positive'" />
                </template>
                <span class="text-caption text-weight-bold mono">{{ simResult.textoStatus }}</span>
              </q-banner>
            </q-card-section>
          </q-card>
        </q-card-section>

        <q-card-actions align="right" class="q-pa-md">
          <q-btn unelevated no-caps color="grey-9" label="Fechar Simulador" class="text-weight-bold" @click="showSimulatorModal = false" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<style scoped lang="scss">
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.intro-text {
  max-width: 512px;
}
.formula-box {
  max-width: 448px;
}
.save-btn {
  min-width: min(260px, 100%);
}
.food-thumb {
  border-radius: 12px;
  img {
    object-fit: cover;
  }
}
.inventory-item--expired {
  opacity: 0.8;
}
.original-price {
  text-decoration: line-through;
}
.simulator-card {
  width: 100%;
  max-width: 576px;
}
</style>