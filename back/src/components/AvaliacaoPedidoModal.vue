<script setup>
// Importa reatividade, propriedades derivadas e observadores do Vue.
import { ref, computed, watch } from "vue";
// Importa o estado visual do tema Quasar.
import { useQuasar } from "quasar";
// Importa a store global para enviar a avaliação ao backend.
import { useAppStore } from "../stores/estadoApp.js";
// Importa regras auxiliares para validar o prazo e calcular minutos restantes.
import { isWithinOneHourOfDelivery, getRemainingRatingMinutes } from "../utils/utilitariosAvaliacaoPedido.js";

// Recebe do componente pai se o modal está aberto e qual pedido será avaliado.
const props = defineProps({
  show: Boolean,
  order: Object
});
// Emite eventos para fechar o modal ou informar que a avaliação foi enviada.
const emit = defineEmits(["close", "submitted"]);

// Obtém o tema atual para aplicar estilos claros ou escuros.
const $q = useQuasar();
// Obtém a ação que grava a avaliação do pedido no estado da aplicação.
const { submitOrderEvaluation } = useAppStore();

// Converte o tema Quasar em uma propriedade reativa usada pelo template.
const isDark = computed(() => $q.dark.isActive);
// Verifica se o prazo de uma hora após a entrega já expirou.
const isEvaluationExpired = computed(() => {
  if (!props.order) return false;
  return !isWithinOneHourOfDelivery(props.order);
});
// Calcula quantos minutos ainda restam para avaliar o pedido.
const remainingMinutes = computed(() => {
  if (!props.order) return 0;
  return getRemainingRatingMinutes(props.order);
});

// Armazena a nota da comida e seu comentário.
const notaComida = ref(5);
const comentarioComida = ref("");
const reclamacaoComida = ref(false);
// Armazena a nota da entrega e seu comentário.
const notaEntregador = ref(5);
const comentarioEntregador = ref("");
const reclamacaoEntregador = ref(false);
// Controla o envio e os erros de validação exibidos no formulário.
const submitting = ref(false);
const validationErrors = ref({});
const submittedAttempt = ref(false);
// Indica se uma das notas foi considerada baixa.
const isFoodLowRating = computed(() => notaComida.value < 3);
const isDriverLowRating = computed(() => notaEntregador.value < 3);

// Limpa o erro da comida ao melhorar a nota e cria reclamação automática para nota 1.
watch(notaComida, (newVal) => {
  if (newVal >= 3) {
    validationErrors.value.food = void 0;
  }
  if (newVal === 1) {
    reclamacaoComida.value = true;
  }
});
// Remove o erro da comida quando o usuário escreve um comentário válido.
watch(comentarioComida, (newVal) => {
  if (newVal && newVal.trim()) {
    validationErrors.value.food = void 0;
  }
});
// Limpa o erro da entrega ao melhorar a nota e cria reclamação automática para nota 1.
watch(notaEntregador, (newVal) => {
  if (newVal >= 3) {
    validationErrors.value.driver = void 0;
  }
  if (newVal === 1) {
    reclamacaoEntregador.value = true;
  }
});
// Remove o erro da entrega quando o usuário escreve um comentário válido.
watch(comentarioEntregador, (newVal) => {
  if (newVal && newVal.trim()) {
    validationErrors.value.driver = void 0;
  }
});
// Quando o pedido muda, preenche o formulário com uma avaliação existente ou reinicia os dados.
watch(() => props.order, (ord) => {
  if (ord) {
    notaComida.value = ord.notaComida || 5;
    comentarioComida.value = ord.comentarioComida || "";
    reclamacaoComida.value = ord.reclamacaoComida || ord.notaComida === 1;
    notaEntregador.value = ord.notaEntregador || 5;
    comentarioEntregador.value = ord.comentarioEntregador || "";
    reclamacaoEntregador.value = ord.reclamacaoEntregador || ord.notaEntregador === 1;
    validationErrors.value = {};
    submittedAttempt.value = false;
  }
}, { immediate: true });
// Converte uma quantidade de estrelas em uma descrição textual exibida ao usuário.
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
// Valida os campos obrigatórios; notas menores que 3 exigem comentário.
const validateForm = () => {
  validationErrors.value = {};
  let isValid = true;
  if (isFoodLowRating.value && (!comentarioComida.value || !comentarioComida.value.trim())) {
    validationErrors.value.food = "Por favor, informe obrigatoriamente o motivo da nota abaixo de 3 estrelas na comida.";
    isValid = false;
  }
  if (isDriverLowRating.value && (!comentarioEntregador.value || !comentarioEntregador.value.trim())) {
    validationErrors.value.driver = "Por favor, informe obrigatoriamente o motivo da nota abaixo de 3 estrelas na entrega.";
    isValid = false;
  }
  return isValid;
};
// Envia ao backend os dados da avaliação do pedido.
const handleSubmit = async () => {
  // Interrompe o envio quando não existe um pedido válido.
  if (!props.order) return;
  // Impede novas avaliações ou alterações depois do prazo.
  if (isEvaluationExpired.value) {
    return;
  }
  // Marca que o usuário tentou confirmar para mostrar avisos de validação.
  submittedAttempt.value = true;
  // Impede o envio se o comentário obrigatório estiver vazio.
  if (!validateForm()) {
    return;
  }
  // Ativa o indicador de carregamento no botão.
  submitting.value = true;
  try {
    // Envia todas as notas, comentários e reclamações da avaliação.
    await submitOrderEvaluation(props.order.id, {
      notaComida: notaComida.value,
      comentarioComida: comentarioComida.value.trim(),
      notaEntregador: notaEntregador.value,
      comentarioEntregador: comentarioEntregador.value.trim(),
      reclamacaoComida: reclamacaoComida.value || notaComida.value === 1,
      reclamacaoEntregador: reclamacaoEntregador.value || notaEntregador.value === 1
    });
    // Comunica ao componente pai que o pedido foi avaliado.
    emit("submitted");
    // Fecha o modal após o envio bem-sucedido.
    emit("close");
  } catch (e) {
    // Registra falhas inesperadas no envio sem fechar o modal.
    console.error(e);
  } finally {
    // Remove o estado de carregamento independentemente do resultado.
    submitting.value = false;
  }
};
</script>

<template>
  <!-- Cria um diálogo persistente que só abre quando há pedido associado. -->
  <q-dialog :model-value="show && !!order" persistent @update:model-value="(v) => { if (!v) emit('close') }">
    <q-card v-if="order" class="avaliacao-card column no-wrap" :dark="isDark">
      <!-- Cabeçalho com identificação do pedido e botão de fechamento. -->
      <q-card-section class="row items-center justify-between q-pa-md avaliacao-header">
        <div class="row items-center q-gutter-sm no-wrap">
          <q-avatar color="positive" text-color="white" size="40px" rounded icon="restaurant" class="avaliacao-avatar" />
          <div>
            <div class="text-subtitle2 text-weight-bold text-uppercase">Avaliar Pedido #{{ order.id }}</div>
            <div class="text-caption text-grey-6">{{ order.nomeLoja }}</div>
          </div>
        </div>
        <q-btn flat round dense icon="close" :color="isDark ? 'grey-5' : 'grey-7'" @click="emit('close')" />
      </q-card-section>
      <q-separator />

      <!-- Corpo rolável contendo informações e os campos de avaliação. -->
      <div class="avaliacao-body">
        <div class="q-pa-md column q-gutter-md text-left">
          <!-- Exibe o aviso crítico quando o prazo de uma hora terminou. -->
          <q-banner v-if="isEvaluationExpired" rounded dense class="bg-negative text-white">
            <template #avatar><q-icon name="warning" /></template>
            <div class="text-weight-bold text-uppercase text-caption">Prazo de Avaliação Expirado (Limite 1h):</div>
            <div class="text-caption">Este pedido foi entregue há mais de 1 hora. Conforme a regra da plataforma, o envio ou edição de avaliações não é mais permitido após 1 hora da entrega.</div>
          </q-banner>

          <!-- Exibe o prazo válido e a quantidade de minutos restantes. -->
          <q-banner v-else rounded dense class="bg-green-1 text-positive" :class="{ 'avaliacao-banner-dark': isDark }">
            <template #avatar><q-icon name="schedule" color="positive" /></template>
            <div class="row items-center justify-between no-wrap">
              <span class="text-weight-bold text-caption">Prazo: até 1h após entrega</span>
              <q-badge color="positive" text-color="white" rounded class="q-px-sm q-py-xs text-weight-bold">
                Restam ~{{ remainingMinutes }} min
              </q-badge>
            </div>
          </q-banner>

          <!-- Apresenta uma mensagem sobre a importância da avaliação. -->
          <q-banner rounded dense class="bg-amber-1 text-grey-9" :class="{ 'avaliacao-banner-dark': isDark }">
            <template #avatar><q-icon name="favorite" color="amber-8" /></template>
            <div class="text-weight-bold text-uppercase text-caption">Sua opinião é muito importante</div>
            <div class="text-caption">
              Por meio da sua avaliação, o Save All aprimora continuamente a qualidade dos estabelecimentos,
              dos alimentos e das entregas. Agradecemos a sua colaboração.
            </div>
          </q-banner>

          <!-- Seção 1: avaliação da comida e de possíveis excedentes. -->
          <q-card flat bordered class="avaliacao-section" :class="{ 'avaliacao-section--low': isFoodLowRating }" :dark="isDark">
            <q-card-section class="column q-gutter-sm">
              <div class="row items-center justify-between">
                <div class="row items-center q-gutter-xs">
                  <q-icon name="restaurant" color="positive" size="18px" />
                  <span class="text-caption text-weight-bold text-uppercase">1. Comida e Excedente</span>
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

          <!-- Seção 2: avaliação da entrega e do entregador responsável. -->
          <q-card flat bordered class="avaliacao-section" :class="{ 'avaliacao-section--low': isDriverLowRating }" :dark="isDark">
            <q-card-section class="column q-gutter-sm">
              <div class="row items-center justify-between">
                <div class="row items-center q-gutter-xs">
                  <q-icon name="local_shipping" color="indigo-4" size="18px" />
                  <span class="text-caption text-weight-bold text-uppercase">2. Entrega e Entregador</span>
                </div>
                <span class="text-caption text-weight-bold" :class="isDriverLowRating ? 'text-negative' : 'text-amber-8'">{{ getRatingLabel(notaEntregador) }}</span>
              </div>

              <div v-if="order.nomeEntregador" class="text-caption text-grey-6">
                Entregador responsável: <strong :class="isDark ? 'text-grey-4' : 'text-grey-8'">{{ order.nomeEntregador }}</strong>
              </div>

              <div class="column items-center q-py-sm">
                <q-rating
                  v-model="notaEntregador"
                  :max="5"
                  size="2.2em"
                  :color="notaEntregador < 3 ? 'negative' : 'amber-7'"
                  icon="star_border"
                  icon-selected="star"
                  :readonly="isEvaluationExpired"
                />
              </div>

              <q-banner v-if="isDriverLowRating" dense rounded class="bg-red-1 text-negative">
                <template #avatar><q-icon name="warning" color="negative" size="18px" /></template>
                <span class="text-caption">Nota abaixo de 3 estrelas: <strong>é obrigatório</strong> preencher o motivo da avaliação abaixo.</span>
              </q-banner>

              <div>
                <div class="row items-center justify-between q-mb-xs">
                  <span class="text-caption text-weight-bold text-uppercase" :class="isDriverLowRating ? 'text-negative' : 'text-grey-6'">
                    <template v-if="isDriverLowRating">Motivo da Nota na Entrega (Obrigatório) *</template>
                    <template v-else>Comentário sobre a Entrega (opcional)</template>
                  </span>
                  <q-badge v-if="isDriverLowRating" color="negative" class="text-weight-bold">Obrigatório</q-badge>
                </div>
                <q-input
                  v-model="comentarioEntregador"
                  type="textarea"
                  outlined
                  dense
                  autogrow
                  rows="2"
                  :dark="isDark"
                  :disable="isEvaluationExpired"
                  :error="!!validationErrors.driver"
                  :error-message="validationErrors.driver"
                  :color="isDriverLowRating ? 'negative' : 'indigo'"
                  :placeholder="isDriverLowRating ? 'Explique obrigatoriamente o que ocorreu com a entrega (atraso imprevisto, conduta, extravio)...' : 'Ex: Entregador rápido, educado e atencioso...'"
                />
              </div>

              <q-checkbox
                v-model="reclamacaoEntregador"
                dense
                color="negative"
                :disable="isEvaluationExpired"
                :dark="isDark"
                label="Registrar Reclamação Formal da Entrega"
                class="text-caption text-weight-medium text-negative"
              />
            </q-card-section>
          </q-card>
        </div>
      </div>

      <!-- Aviso resumido exibido depois de uma tentativa de envio inválida. -->
      <q-banner
        v-if="submittedAttempt && ((isFoodLowRating && !comentarioComida.trim()) || (isDriverLowRating && !comentarioEntregador.trim()))"
        dense
        class="bg-red-1 text-negative text-weight-bold text-caption"
      >
        <template #avatar><q-icon name="warning" color="negative" size="18px" /></template>
        Preenchimento do motivo obrigatório para avaliações abaixo de 3 estrelas.
      </q-banner>

      <q-separator />
      <!-- Rodapé com ações de cancelamento e confirmação da avaliação. -->
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
// Define o tamanho, o limite visual e o recorte do cartão do modal.
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
  // Permite que apenas o conteúdo central role entre cabeçalho e rodapé.
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}
.avaliacao-header,
.avaliacao-footer {
  // Mantém cabeçalho e rodapé fixos fora da área rolável.
  flex: 0 0 auto;
  background: #f8fafc;
}
.avaliacao-section--low {
  // Destaca visualmente seções cuja avaliação exige justificativa.
  background: #fff1f2;
  border-color: #fecdd3;
}
.body--dark & {
  // Ajusta cores do modal, cabeçalho, rodapé e avisos no tema escuro.
  &.avaliacao-card { background: #0b1622; }
  .avaliacao-header,
  .avaliacao-footer { background: #0f172a; }
  .avaliacao-section { background: rgba(15, 23, 42, 0.5); }
  .avaliacao-section--low { background: rgba(76, 5, 25, 0.2); border-color: rgba(244, 63, 94, 0.4); }
  .avaliacao-banner-dark { background: rgba(255, 255, 255, 0.06) !important; color: #e2e8f0 !important; }
}
</style>