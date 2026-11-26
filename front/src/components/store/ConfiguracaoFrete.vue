<script setup>
// Edita a taxa padrão e as regras de frete por região, além de simular o cálculo para um endereço.
import { ref, watch, computed } from "vue";
import { DEFAULT_DELIVERY_FEE, formatCep, formatMoney, calculateDeliveryFee } from "src/utils/frete";

// Entradas recebidas do componente pai que configuram os dados e opções desta tela.
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  config: { type: Object, default: () => ({}) }
});
// Eventos emitidos para o componente pai executar as ações fora desta interface.
const emit = defineEmits(["update:modelValue", "save"]);

// Estado local reativo usado para acompanhar seleções, formulários e etapas da interface.
const defaultFee = ref(String(DEFAULT_DELIVERY_FEE));
const zones = ref([]);
const newType = ref("bairro");
const newValue = ref("");
const newFee = ref("");
const formError = ref("");

// Simulador: o lojista confere quanto o cliente pagaria
const testInput = ref("");

// Observa mudanças relevantes e sincroniza o estado local com os dados recebidos.
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    const cfg = props.config || {};
    defaultFee.value = String(cfg.defaultFee ?? DEFAULT_DELIVERY_FEE);
    zones.value = (cfg.zones || []).map((z) => ({ ...z }));
    newType.value = "bairro";
    newValue.value = "";
    newFee.value = "";
    formError.value = "";
    testInput.value = "";
  },
  { immediate: true }
);

// Ações da tela validam a interação e encaminham as alterações ou eventos necessários.
const normalizar = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const addZone = () => {
  formError.value = "";
  const value = newType.value === "cep" ? formatCep(newValue.value) : newValue.value.trim();
  const fee = parseFloat(String(newFee.value).replace(",", "."));
  if (newType.value === "cep" && value.replace(/\D/g, "").length < 5) {
    formError.value = "Informe o CEP completo ou ao menos os 5 primeiros dígitos.";
    return;
  }
  if (newType.value === "bairro" && value.length < 2) {
    formError.value = "Informe o nome do bairro.";
    return;
  }
  if (isNaN(fee) || fee < 0) {
    formError.value = "Informe um valor de frete válido (use 0 para frete grátis).";
    return;
  }
  const existing = zones.value.find((z) => z.type === newType.value && normalizar(z.value) === normalizar(value));
  if (existing) {
    existing.fee = fee;
  } else {
    zones.value.push({ id: `zone-${Date.now()}-${Math.round(Math.random() * 1000)}`, type: newType.value, value, fee });
  }
  newValue.value = "";
  newFee.value = "";
};

const removeZone = (id) => {
  zones.value = zones.value.filter((z) => z.id !== id);
};

// Valores derivados das entradas e do estado para manter a apresentação sincronizada.
const cleanedConfig = computed(() => {
  const parsed = parseFloat(String(defaultFee.value).replace(",", "."));
  return {
    defaultFee: isNaN(parsed) || parsed < 0 ? DEFAULT_DELIVERY_FEE : parsed,
    zones: zones.value.map((z) => ({ ...z, fee: Number(z.fee) || 0 }))
  };
});

const testResult = computed(() => {
  const txt = testInput.value.trim();
  if (!txt) return null;
  const digits = txt.replace(/\D/g, "");
  const isCep = digits.length >= 5 && /^[\d\s-]+$/.test(txt);
  return calculateDeliveryFee(cleanedConfig.value, isCep ? { cep: digits } : { neighborhood: txt });
});

const save = () => {
  emit("save", cleanedConfig.value);
  emit("update:modelValue", false);
};
</script>

<template>
<!-- Interface principal: edita a taxa padrão e as regras de frete por região, além de simular o cálculo para um endereço. -->
  <q-dialog :model-value="modelValue" @update:model-value="(v) => emit('update:modelValue', v)">
    <q-card class="frete-card">
      <q-card-section class="row items-center justify-between">
        <div class="row items-center q-gutter-x-sm">
          <q-avatar color="green-1" text-color="positive" icon="local_shipping" size="40px" />
          <div>
            <div class="text-subtitle1 text-weight-bold">Taxas de entrega</div>
            <div class="text-caption text-grey-6">Defina o frete por bairro ou por CEP</div>
          </div>
        </div>
        <q-btn flat round dense icon="close" color="grey-7" @click="emit('update:modelValue', false)" />
      </q-card-section>
      <q-separator />

      <q-card-section class="frete-body q-gutter-y-md">
        <!-- Taxa padrão -->
        <div>
          <div class="text-subtitle2 text-weight-bold text-uppercase">Taxa padrão</div>
          <div class="text-caption text-grey-6 q-mb-sm">
            Cobrada quando o endereço do cliente não está em nenhuma região cadastrada abaixo.
          </div>
          <q-input
            id="input-default-delivery-fee"
            v-model="defaultFee"
            type="number"
            min="0"
            step="0.5"
            outlined
            dense
            prefix="R$"
            class="fee-input"
          />
        </div>

        <q-separator />

        <!-- Nova região -->
        <div>
          <div class="text-subtitle2 text-weight-bold text-uppercase">Adicionar região</div>
          <div class="text-caption text-grey-6 q-mb-sm">
            O CEP tem prioridade sobre o bairro. Use só os 5 primeiros dígitos do CEP para cobrir uma área inteira.
          </div>
          <q-btn-toggle
            v-model="newType"
            no-caps
            unelevated
            dense
            toggle-color="positive"
            color="grey-3"
            text-color="grey-8"
            class="q-mb-sm"
            :options="[
              { label: 'Por bairro', value: 'bairro', icon: 'location_city' },
              { label: 'Por CEP', value: 'cep', icon: 'pin_drop' }
            ]"
          />
          <div class="row q-col-gutter-sm items-start">
            <div class="col-12 col-sm-5">
              <q-input
                id="input-zone-value"
                :model-value="newValue"
                outlined
                dense
                :label="newType === 'cep' ? 'CEP (ex.: 89870-000 ou 89870)' : 'Bairro (ex.: Centro)'"
                :maxlength="newType === 'cep' ? 9 : 60"
                @update:model-value="(v) => (newValue = newType === 'cep' ? formatCep(v) : v)"
                @keyup.enter="addZone"
              />
            </div>
            <div class="col-7 col-sm-4">
              <q-input
                id="input-zone-fee"
                v-model="newFee"
                type="number"
                min="0"
                step="0.5"
                outlined
                dense
                prefix="R$"
                label="Frete"
                @keyup.enter="addZone"
              />
            </div>
            <div class="col-5 col-sm-3">
              <q-btn
                id="btn-add-zone"
                unelevated
                no-caps
                color="positive"
                icon="add"
                label="Adicionar"
                class="full-width add-btn"
                @click="addZone"
              />
            </div>
          </div>
          <div v-if="formError" class="text-caption text-negative q-mt-xs">{{ formError }}</div>
        </div>

        <!-- Lista -->
        <div>
          <div class="text-subtitle2 text-weight-bold text-uppercase q-mb-xs">Regiões cadastradas ({{ zones.length }})</div>
          <q-banner v-if="!zones.length" dense rounded class="bg-grey-2 text-grey-7 text-caption">
            Nenhuma região cadastrada. Todos os pedidos usam a taxa padrão de {{ formatMoney(cleanedConfig.defaultFee) }}.
          </q-banner>
          <q-list v-else bordered separator class="rounded-borders">
            <q-item v-for="z in zones" :key="z.id">
              <q-item-section avatar>
                <q-avatar size="34px" :color="z.type === 'cep' ? 'blue-1' : 'orange-1'" :text-color="z.type === 'cep' ? 'blue-8' : 'orange-9'" :icon="z.type === 'cep' ? 'pin_drop' : 'location_city'" />
              </q-item-section>
              <q-item-section>
                <q-item-label class="text-weight-bold">{{ z.value }}</q-item-label>
                <q-item-label caption>{{ z.type === 'cep' ? 'CEP' : 'Bairro' }}</q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-input
                  v-model.number="z.fee"
                  type="number"
                  min="0"
                  step="0.5"
                  outlined
                  dense
                  prefix="R$"
                  class="fee-inline"
                />
              </q-item-section>
              <q-item-section side>
                <q-btn flat round dense color="negative" icon="delete" @click="removeZone(z.id)">
                  <q-tooltip>Remover</q-tooltip>
                </q-btn>
              </q-item-section>
            </q-item>
          </q-list>
        </div>

        <!-- Simulador -->
        <q-card flat bordered class="bg-green-1-soft">
          <q-card-section class="q-pa-sm q-gutter-y-xs">
            <div class="text-caption text-weight-bold text-uppercase text-grey-7">Testar um endereço</div>
            <q-input v-model="testInput" outlined dense placeholder="Digite um bairro ou CEP para ver o frete" />
            <div v-if="testResult" class="text-body2">
              Frete cobrado: <strong class="text-positive">{{ formatMoney(testResult.fee) }}</strong>
              <span class="text-grey-6 text-caption"> · {{ testResult.label }}</span>
            </div>
          </q-card-section>
        </q-card>
      </q-card-section>

      <q-separator />
      <q-card-actions align="right" class="q-pa-md q-gutter-x-sm">
        <q-btn flat no-caps color="grey-7" label="Cancelar" @click="emit('update:modelValue', false)" />
        <q-btn id="btn-save-delivery-config" unelevated no-caps color="positive" icon="save" label="Salvar taxas" @click="save" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style scoped lang="scss">
.frete-card {
  width: 100%;
  max-width: 640px;
}

.frete-body {
  max-height: 65vh;
  overflow-y: auto;
}

.fee-input {
  max-width: 200px;
}

.fee-inline {
  width: 130px;
}

.add-btn {
  height: 40px;
}

.bg-green-1-soft {
  background: rgba(102, 187, 106, 0.08);
}

.body--dark .bg-grey-2 {
  background: rgba(255, 255, 255, 0.06) !important;
  color: #cbd5e1 !important;
}
</style>
