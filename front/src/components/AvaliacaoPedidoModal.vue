<script setup>
import { ref, computed, watch } from "vue";
import { useQuasar } from "quasar";
import { useAppStore } from "../stores/estadoApp.js";
import { isWithinOneHourOfDelivery, getRemainingRatingMinutes } from "../utils/utilitariosAvaliacaoPedido.js";
const props = defineProps({
  show: Boolean,
  order: Object
});
const emit = defineEmits(["close", "submitted"]);
const $q = useQuasar();
const { submitOrderEvaluation } = useAppStore();
const isDark = computed(() => $q.dark.isActive);
const isEvaluationExpired = computed(() => {
  if (!props.order) return false;
  return !isWithinOneHourOfDelivery(props.order);
});
const remainingMinutes = computed(() => {
  if (!props.order) return 0;
  return getRemainingRatingMinutes(props.order);
});
const notaComida = ref(5);
const comentarioComida = ref("");
const reclamacaoComida = ref(false);
const submitting = ref(false);
const validationErrors = ref({});
const submittedAttempt = ref(false);
const isFoodLowRating = computed(() => notaComida.value < 3);
watch(notaComida, (newVal) => {
  if (newVal >= 3) {
    validationErrors.value.food = void 0;
  }
  if (newVal === 1) {
    reclamacaoComida.value = true;
  }
});
watch(comentarioComida, (newVal) => {
  if (newVal && newVal.trim()) {
    validationErrors.value.food = void 0;
  }
});
watch(() => props.order, (ord) => {
  if (ord) {
    notaComida.value = ord.notaComida || 5;
    comentarioComida.value = ord.comentarioComida || "";
    reclamacaoComida.value = ord.reclamacaoComida || ord.notaComida === 1;
    validationErrors.value = {};
    submittedAttempt.value = false;
  }
}, { immediate: true });
const getRatingLabel = (stars) => {
  switch (stars) {
    case 1:
      return "1 \u2605 - P\xE9ssimo (Gera Reclama\xE7\xE3o)";
    case 2:
      return "2 \u2605 - Ruim (Motivo Obrigat\xF3rio)";
    case 3:
      return "3 \u2605 - Regular";
    case 4:
      return "4 \u2605 - Muito Bom";
    case 5:
      return "5 \u2605 - Excelente!";
    default:
      return "";
  }
};
const validateForm = () => {
  validationErrors.value = {};
  let isValid = true;
  if (isFoodLowRating.value && (!comentarioComida.value || !comentarioComida.value.trim())) {
    validationErrors.value.food = "Por favor, informe obrigatoriamente o motivo da nota abaixo de 3 estrelas na comida.";
    isValid = false;
  }
  return isValid;
};
const handleSubmit = async () => {
  if (!props.order) return;
  if (isEvaluationExpired.value) {
    return;
  }
  submittedAttempt.value = true;
  if (!validateForm()) {
    return;
  }
  submitting.value = true;
  try {
    await submitOrderEvaluation(props.order.id, {
      notaComida: notaComida.value,
      comentarioComida: comentarioComida.value.trim(),
      reclamacaoComida: reclamacaoComida.value || notaComida.value === 1
    });
    emit("submitted");
    emit("close");
  } catch (e) {
    console.error(e);
  } finally {
    submitting.value = false;
  }
};
</script>

<template>
  <q-dialog :model-value="show && !!order" persistent @update:model-value="(v) => { if (!v) emit('close') }">
    <q-card v-if="order" class="avaliacao-card column no-wrap" :dark="isDark">
      <q-card-section class="row items-center justify-between q-pa-md avaliacao-header">
        <div class="row items-center q-gutter-sm no-wrap">
          <q-avatar color="positive" text-color="white" size="40px" rounded icon="restaurant" class="avaliacao-avatar" />
          <div>
            <div class="text-subtitle2 text-weight-bold text-uppercase">Avaliar Pedido #{{ order.id }}</div>
            <div class="text-caption text-grey-6">{{ order.nomeLoja || "Padaria parceira" }}</div>
          </div>
        </div>
        <q-btn flat round dense icon="close" :color="isDark ? 'grey-5' : 'grey-7'" @click="emit('close')" />
      </q-card-section>
      <q-separator />

      <div class="avaliacao-body">
        <div class="q-pa-md column q-gutter-md text-left">
          <q-banner v-if="isEvaluationExpired" rounded dense class="bg-negative text-white">
            <template #avatar><q-icon name="warning" /></template>
            <div class="text-weight-bold text-uppercase text-caption">Prazo de Avaliação Expirado (Limite 1h):</div>
            <div class="text-caption">Este pedido foi entregue há mais de 1 hora. Conforme a regra da plataforma, o envio ou edição de avaliações não é mais permitido após 1 hora da entrega.</div>
          </q-banner>

          <q-banner v-else rounded dense class="bg-green-1 text-positive" :class="{ 'avaliacao-banner-dark': isDark }">
            <template #avatar><q-icon name="schedule" color="positive" /></template>
            <div class="row items-center justify-between no-wrap">
              <span class="text-weight-bold text-caption">Prazo: até 1h após entrega</span>
              <q-badge color="positive" text-color="white" rounded class="q-px-sm q-py-xs text-weight-bold">
                Restam ~{{ remainingMinutes }} min
              </q-badge>
            </div>
          </q-banner>

          <q-banner rounded dense class="bg-amber-1 text-grey-9" :class="{ 'avaliacao-banner-dark': isDark }">
            <template #avatar><q-icon name="favorite" color="amber-8" /></template>
            <div class="text-weight-bold text-uppercase text-caption">Sua opinião é muito importante</div>
            <div class="text-caption">
              Por meio da sua avaliação, o Save All aprimora continuamente a qualidade dos estabelecimentos,
              dos alimentos. Agradecemos a sua colaboração.
            </div>
          </q-banner>

          <!-- SECTION 1 -->
          <q-card flat bordered class="avaliacao-section" :class="{ 'avaliacao-section--low': isFoodLowRating }" :dark="isDark">
            <q-card-section class="column q-gutter-sm">
              <div class="row items-center justify-between">
                <div class="row items-center q-gutter-xs">
                  <q-icon name="restaurant" color="positive" size="18px" />
                  <span class="text-caption text-weight-bold text-uppercase">Comida e Excedente</span>
                </div>
                <span class="text-caption text-weight-bold" :class="isFoodLowRating ? 'text-negative' : 'text-amber-8'">{{ getRatingLabel(notaComida) }}</span>
              </div>

              <div class="column items-center q-py-sm">
                <q-rating
                  v-model="notaComida"
                  :max="5"
                  size="2.2em"
                  :color="notaComida < 3 ? 'negative' : 'amber-7'"
                  icon="star_border"
                  icon-selected="star"
                  :readonly="isEvaluationExpired"
                />
              </div>

              <q-banner v-if="isFoodLowRating" dense rounded class="bg-red-1 text-negative">
                <template #avatar><q-icon name="warning" color="negative" size="18px" /></template>
                <span class="text-caption">Nota abaixo de 3 estrelas: <strong>é obrigatório</strong> preencher o motivo da avaliação abaixo.</span>
              </q-banner>

              <div>
                <div class="row items-center justify-between q-mb-xs">
                  <span class="text-caption text-weight-bold text-uppercase" :class="isFoodLowRating ? 'text-negative' : 'text-grey-6'">
                    <template v-if="isFoodLowRating">Motivo da Nota na Comida (Obrigatório) *</template>
                    <template v-else>Comentário sobre os Alimentos (opcional)</template>
                  </span>
                  <q-badge v-if="isFoodLowRating" color="negative" class="text-weight-bold">Obrigatório</q-badge>
                </div>
                <q-input
                  v-model="comentarioComida"
                  type="textarea"
                  outlined
                  dense
                  autogrow
                  rows="2"
                  :dark="isDark"
                  :disable="isEvaluationExpired"
                  :error="!!validationErrors.food"
                  :error-message="validationErrors.food"
                  :color="isFoodLowRating ? 'negative' : 'positive'"
                  :placeholder="isFoodLowRating ? 'Explique obrigatoriamente o que houve de errado com os alimentos (ex: temperatura, sabor, embalagem danificada)...' : 'Ex: A comida estava ótima, embalagem selada e saborosa...'"
                />
              </div>

              <q-checkbox
                v-model="reclamacaoComida"
                dense
                color="negative"
                :disable="isEvaluationExpired"
                :dark="isDark"
                label="Registrar Reclamação Formal da Comida (Aviso de Qualidade)"
                class="text-caption text-weight-medium text-negative"
              />
            </q-card-section>
          </q-card>
        </div>
      </div>

      <q-banner
        v-if="submittedAttempt && isFoodLowRating && !comentarioComida.trim()"
        dense
        class="bg-red-1 text-negative text-weight-bold text-caption"
      >
        <template #avatar><q-icon name="warning" color="negative" size="18px" /></template>
        Preenchimento do motivo obrigatório para avaliações abaixo de 3 estrelas.
      </q-banner>

      <q-separator />
      <q-card-actions align="right" class="q-pa-md q-gutter-sm avaliacao-footer">
        <q-btn flat no-caps label="Cancelar" :color="isDark ? 'grey-5' : 'grey-7'" @click="emit('close')" />
        <q-btn
          unelevated
          no-caps
          rounded
          :color="isEvaluationExpired ? 'grey-8' : 'amber-9'"
          :text-color="isEvaluationExpired ? 'grey-4' : 'dark'"
          :label="isEvaluationExpired ? 'Prazo Expirado (1h)' : (submitting ? 'Enviando...' : 'Confirmar Avaliação')"
          :loading="submitting"
          :disable="isEvaluationExpired"
          class="text-weight-bold q-px-lg"
          @click="handleSubmit"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style scoped lang="scss">
.avaliacao-card {
  display: flex;
  flex-direction: column;
  flex-wrap: nowrap;
  width: 100%;
  max-width: 512px;
  max-height: 90vh;
  border-radius: 16px;
  overflow: hidden;
}
/* Rolagem nativa: o miolo ocupa o espaço que sobra entre cabeçalho e rodapé
   e rola sozinho quando o conteúdo é maior que a tela. */
.avaliacao-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}
.avaliacao-header,
.avaliacao-footer {
  flex: 0 0 auto;
  background: #f8fafc;
}
.avaliacao-section--low {
  background: #fff1f2;
  border-color: #fecdd3;
}
.body--dark & {
  &.avaliacao-card { background: #0b1622; }
  .avaliacao-header,
  .avaliacao-footer { background: #0f172a; }
  .avaliacao-section { background: rgba(15, 23, 42, 0.5); }
  .avaliacao-section--low { background: rgba(76, 5, 25, 0.2); border-color: rgba(244, 63, 94, 0.4); }
  .avaliacao-banner-dark { background: rgba(255, 255, 255, 0.06) !important; color: #e2e8f0 !important; }
}
</style>