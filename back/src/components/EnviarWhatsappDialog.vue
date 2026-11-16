<script setup>
// Janela do painel master para mandar uma mensagem pronta pelo WhatsApp
// a um estabelecimento ou cliente (o WhatsApp abre com número e texto preenchidos).
import { ref, computed, watch } from "vue";
import { useAppStore } from "../stores/estadoApp";
import { MODELOS_MASTER, abrirWhatsapp, formatarTelefone, normalizarTelefone } from "../utils/whatsapp";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  // { nome, telefone, motivo?, loja?: boolean }
  destinatario: { type: Object, default: null }
});
const emit = defineEmits(["update:modelValue"]);
const appStore = useAppStore();

const aberto = computed({
  get: () => props.modelValue,
  set: (v) => emit("update:modelValue", v)
});
const modelos = computed(() => MODELOS_MASTER.filter((m) => !m.paraLoja || props.destinatario?.loja));
const modelo = ref("aviso");
const texto = ref("");

const aplicarModelo = () => {
  const m = MODELOS_MASTER.find((x) => x.id === modelo.value) || MODELOS_MASTER[0];
  texto.value = m.texto({ nome: props.destinatario?.nome || "", motivo: props.destinatario?.motivo || "" });
};
watch(
  () => props.modelValue,
  (v) => {
    if (!v) return;
    modelo.value = props.destinatario?.motivo ? "suspensao" : "aviso";
    aplicarModelo();
  }
);
watch(modelo, aplicarModelo);

const telefoneOk = computed(() => !!normalizarTelefone(props.destinatario?.telefone));
const enviar = () => {
  if (!texto.value.trim()) return;
  const ok = abrirWhatsapp(props.destinatario.telefone, texto.value.trim(), appStore.usuarioAtual);
  if (!ok) {
    appStore.triggerNotification("O navegador bloqueou a aba do WhatsApp. Permita pop-ups para este site.", "warning");
    return;
  }
  aberto.value = false;
};
</script>

<template>
  <q-dialog v-model="aberto">
    <q-card class="whatsapp-dialog">
      <q-card-section class="row items-center justify-between no-wrap">
        <div class="row items-center no-wrap q-gutter-x-sm">
          <q-icon name="chat" color="positive" size="24px" />
          <div>
            <div class="text-subtitle1 text-weight-bold ellipsis">Mensagem para {{ destinatario?.nome }}</div>
            <div class="text-caption text-grey-7">{{ formatarTelefone(destinatario?.telefone) }}</div>
          </div>
        </div>
        <q-btn flat round dense icon="close" color="grey-7" @click="aberto = false" />
      </q-card-section>
      <q-separator />
      <q-card-section class="q-gutter-y-md">
        <q-select
          v-model="modelo"
          :options="modelos"
          option-value="id"
          option-label="rotulo"
          emit-value
          map-options
          outlined
          dense
          label="Modelo"
        />
        <q-input v-model="texto" type="textarea" autogrow outlined label="Mensagem" maxlength="1000" counter />
        <div class="text-caption text-grey-6">O WhatsApp abre com a mensagem pronta; confira e toque em enviar.</div>
      </q-card-section>
      <q-card-actions align="right" class="q-pa-md q-pt-none">
        <q-btn flat no-caps color="grey-7" label="Cancelar" @click="aberto = false" />
        <q-btn
          unelevated
          no-caps
          color="positive"
          icon="send"
          label="Abrir no WhatsApp"
          :disable="!telefoneOk || !texto.trim()"
          @click="enviar"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.whatsapp-dialog {
  width: 460px;
  max-width: 94vw;
  border-radius: 16px;
}
</style>