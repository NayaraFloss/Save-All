<script setup>
// Permite desenhar, limpar e confirmar uma assinatura no canvas, inclusive em telas sensíveis ao toque.
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
// Entradas recebidas do componente pai que configuram os dados e opções desta tela.
const props = defineProps({ modelValue: String, label: String, modoEscuro: Boolean, initialImage: String });
// Eventos emitidos para o componente pai executar as ações fora desta interface.
const emit = defineEmits(["update:modelValue", "save", "clear"]);
// Estado local reativo usado para acompanhar seleções, formulários e etapas da interface.
const canvasRef = ref(null);
const isDrawing = ref(false);
const hasDrawn = ref(false);
const showExisting = ref(!!props.initialImage);
let ctx = null;
// Ações da tela validam a interação e encaminham as alterações ou eventos necessários.
const initCanvas = () => {
  if (!canvasRef.value) return;
  const canvas = canvasRef.value;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width || 320;
  canvas.height = rect.height || 128;
  ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.strokeStyle = "#f97316";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }
};
// Celular girou ou a janela mudou de tamanho: reajusta o canvas (senão o traço sai deslocado)
let observador = null;
let larguraAnterior = 0;
onMounted(() => {
  if (!showExisting.value) {
    setTimeout(initCanvas, 150);
  }
  if (typeof ResizeObserver !== "undefined") {
    observador = new ResizeObserver(() => {
      const largura = Math.round(canvasRef.value?.getBoundingClientRect().width || 0);
      if (!largura || largura === larguraAnterior) return;
      larguraAnterior = largura;
      if (!hasDrawn.value) initCanvas();
    });
    if (canvasRef.value) observador.observe(canvasRef.value);
  }
});
onBeforeUnmount(() => observador?.disconnect());
// Observa mudanças relevantes e sincroniza o estado local com os dados recebidos.
watch(() => props.initialImage, (newVal) => {
  showExisting.value = !!newVal;
  if (!newVal) {
    setTimeout(initCanvas, 150);
  }
});
const getCoordinates = (event) => {
  if (!canvasRef.value) return { x: 0, y: 0 };
  const canvas = canvasRef.value;
  const rect = canvas.getBoundingClientRect();
  let clientX = 0;
  let clientY = 0;
  if (event instanceof MouseEvent) {
    clientX = event.clientX;
    clientY = event.clientY;
  } else if (event instanceof TouchEvent) {
    const touch = event.touches[0] || event.changedTouches[0];
    clientX = touch.clientX;
    clientY = touch.clientY;
  }
  // Converte da posição na tela para a escala interna do canvas
  const escalaX = rect.width ? canvas.width / rect.width : 1;
  const escalaY = rect.height ? canvas.height / rect.height : 1;
  return {
    x: (clientX - rect.left) * escalaX,
    y: (clientY - rect.top) * escalaY
  };
};
const startDrawing = (event) => {
  event.preventDefault();
  isDrawing.value = true;
  hasDrawn.value = true;
  const coord = getCoordinates(event);
  if (ctx) {
    ctx.beginPath();
    ctx.moveTo(coord.x, coord.y);
  }
};
const draw = (event) => {
  if (!isDrawing.value) return;
  event.preventDefault();
  const coord = getCoordinates(event);
  if (ctx) {
    ctx.lineTo(coord.x, coord.y);
    ctx.stroke();
  }
};
const stopDrawing = () => {
  isDrawing.value = false;
};
const handleClear = () => {
  hasDrawn.value = false;
  if (canvasRef.value && ctx) {
    ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height);
  }
  emit("clear");
};
const handleSave = () => {
  if (!canvasRef.value || !hasDrawn.value) return;
  const dataUrl = canvasRef.value.toDataURL("image/png");
  emit("save", dataUrl);
};
const handleRedraw = () => {
  showExisting.value = false;
  hasDrawn.value = false;
  emit("clear");
  setTimeout(initCanvas, 150);
};
</script>

<template>
<!-- Interface principal: permite desenhar, limpar e confirmar uma assinatura no canvas, inclusive em telas sensíveis ao toque. -->
  <div class="column q-gutter-y-xs">
    <div v-if="label" class="text-caption text-uppercase text-weight-bold text-grey-7 pad-label">
      {{ label }}
    </div>

    <!-- If we have an existing loaded signature -->
    <q-card v-if="showExisting && initialImage" flat bordered>
      <q-card-section class="column items-center q-gutter-y-sm relative-position">
        <div class="text-caption text-weight-bold text-positive text-uppercase self-start">
          Assinatura Salva Ativa ✓
        </div>
        <div class="saved-box full-width row items-center justify-center q-pa-sm rounded-borders">
          <img :src="initialImage" alt="Assinatura Salva" class="saved-img" referrerpolicy="no-referrer" />
        </div>
        <q-btn
          outline
          rounded
          dense
          no-caps
          color="warning"
          icon="replay"
          label="Refazer Assinatura"
          class="q-px-md text-weight-bold"
          type="button"
          @click="handleRedraw"
        />
      </q-card-section>
    </q-card>

    <!-- Interactive drawing Canvas -->
    <q-card v-else flat bordered class="overflow-hidden">
      <div class="relative-position">
        <div class="canvas-hint text-caption text-weight-bold text-uppercase text-grey-7 absolute-top-left q-pa-sm">
          Assine com o Dedo ou Mouse aqui
        </div>

        <!-- Canvas -->
        <canvas
          ref="canvasRef"
          class="signature-canvas"
          @mousedown="startDrawing"
          @mousemove="draw"
          @mouseup="stopDrawing"
          @mouseleave="stopDrawing"
          @touchstart="startDrawing"
          @touchmove="draw"
          @touchend="stopDrawing"
        ></canvas>
      </div>

      <q-separator />

      <!-- Draw Actions -->
      <q-card-actions align="between" class="q-pa-sm acoes-assinatura">
        <q-btn flat dense no-caps color="grey-7" icon="replay" label="Limpar Tela" type="button" @click="handleClear" />
        <q-btn
          unelevated
          dense
          no-caps
          color="positive"
          icon="check"
          label="Confirmar Assinatura"
          type="button"
          class="q-px-md text-weight-bold"
          :disable="!hasDrawn"
          @click="handleSave"
        />
      </q-card-actions>
    </q-card>
  </div>
</template>

<style scoped lang="scss">
.pad-label {
  letter-spacing: 0.1em;
}
.signature-canvas {
  display: block;
  width: 100%;
  height: 128px;
  touch-action: none;
  cursor: crosshair;
  background: rgba(255, 255, 255, 0.4);
}
.acoes-assinatura {
  flex-wrap: wrap;
  gap: 8px;
}
.canvas-hint {
  pointer-events: none;
}
.saved-box {
  height: 64px;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(128, 128, 128, 0.3);
}
.saved-img {
  max-height: 100%;
  max-width: 100%;
  object-fit: contain;
}
</style>
