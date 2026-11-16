<script setup>
import { ref, computed, watch } from "vue";
import { useQuasar } from "quasar";
import { abrirWhatsapp, telefoneValido, formatarTelefone } from "../utils/whatsapp";

// Avaliação do alimento recebido: a entidade informa as condições e envia o resultado
// para a loja por WhatsApp (a mensagem abre pronta no aplicativo; o envio é feito pela entidade).
const props = defineProps({
  modelValue: Boolean,
  doacao: { type: Object, default: null },
  usuario: { type: Object, default: null },
});
const emit = defineEmits(["update:modelValue", "enviado"]);
const $q = useQuasar();

const CONDICOES = [
  { value: "excelente", label: "Excelente", detalhe: "Fresco, bem embalado e dentro do esperado", icon: "sentiment_very_satisfied", color: "positive", texto: "em excelente estado" },
  { value: "boa", label: "Boa", detalhe: "Adequado ao consumo, pequenos detalhes", icon: "sentiment_satisfied", color: "teal", texto: "em boas condições" },
  { value: "regular", label: "Regular", detalhe: "Utilizável, mas com restrições", icon: "sentiment_neutral", color: "warning", texto: "em condição regular" },
  { value: "inadequada", label: "Inadequada", detalhe: "Impróprio para consumo ou fora do combinado", icon: "sentiment_very_dissatisfied", color: "negative", texto: "em condição inadequada" },
];
const OBSERVACOES = [
  "Embalagem íntegra",
  "Temperatura adequada",
  "Validade conferida",
  "Quantidade conforme o combinado",
  "Embalagem danificada",
  "Alimento fora da temperatura",
  "Validade próxima do vencimento",
  "Quantidade diferente do combinado",
];

const condicao = ref("boa");
const observacoes = ref([]);
const comentario = ref("");

watch(
  () => [props.modelValue, props.doacao?.id],
  () => {
    if (props.modelValue) {
      condicao.value = props.doacao?.avaliacaoAlimento?.condicao || "boa";
      observacoes.value = [...(props.doacao?.avaliacaoAlimento?.observacoes || [])];
      comentario.value = props.doacao?.avaliacaoAlimento?.comentario || "";
    }
  },
  { immediate: true },
);

const condicaoAtual = computed(() => CONDICOES.find((c) => c.value === condicao.value) || CONDICOES[1]);
const telefone = computed(() => props.doacao?.storePhone || "");
const temTelefone = computed(() => telefoneValido(telefone.value));
const comentarioObrigatorio = computed(() => condicao.value === "inadequada" || condicao.value === "regular");

const alternar = (obs) => {
  const i = observacoes.value.indexOf(obs);
  if (i >= 0) observacoes.value.splice(i, 1);
  else observacoes.value.push(obs);
};

const montarMensagem = () => {
  const d = props.doacao || {};
  const entidade = props.usuario?.name || "Instituição social";
  const linhas = [
    `Olá, ${d.nomeLoja || "equipe"}! Aqui é a *${entidade}*.`,
    "",
    `Recebemos a doação *${d.foodName || "de alimentos"}*${d.weightEstimatedKg ? ` (${d.weightEstimatedKg} kg)` : ""} e registramos a avaliação do alimento:`,
    "",
    `*Condição:* ${condicaoAtual.value.label} — alimento recebido ${condicaoAtual.value.texto}.`,
  ];
  if (observacoes.value.length) linhas.push(`*Observações:* ${observacoes.value.join("; ")}.`);
  if (comentario.value.trim()) linhas.push(`*Comentário:* ${comentario.value.trim()}`);
  linhas.push("", "Agradecemos a parceria e a doação. Mensagem enviada pelo Save All.");
  return linhas.join("\n");
};

const enviar = () => {
  if (comentarioObrigatorio.value && !comentario.value.trim()) {
    $q.notify({ type: "warning", message: "Descreva brevemente o motivo da avaliação antes de enviar." });
    return;
  }
  if (!temTelefone.value) {
    $q.notify({ type: "warning", message: "A loja não possui WhatsApp válido cadastrado." });
    return;
  }
  // window.open precisa ocorrer diretamente no clique
  const abriu = abrirWhatsapp(telefone.value, montarMensagem(), props.usuario);
  if (!abriu) {
    $q.notify({ type: "warning", message: "O navegador bloqueou a abertura do WhatsApp. Libere pop-ups e tente novamente." });
    return;
  }
  emit("enviado", {
    condicao: condicao.value,
    observacoes: [...observacoes.value],
    comentario: comentario.value.trim(),
    enviadoEm: new Date().toISOString(),
  });
  emit("update:modelValue", false);
};
const fechar = () => emit("update:modelValue", false);
</script>

<template>
  <q-dialog :model-value="modelValue" persistent @update:model-value="(v) => emit('update:modelValue', v)">
    <q-card class="avaliacao-alimento" :dark="$q.dark.isActive" style="width: 520px; max-width: 94vw">
      <q-card-section class="row items-center no-wrap">
        <q-icon name="fact_check" color="positive" size="28px" class="q-mr-sm" />
        <div>
          <div class="text-h6">Avaliar o alimento recebido</div>
          <div class="text-caption text-grey-7">
            {{ doacao?.foodName }} · {{ doacao?.nomeLoja }}
          </div>
        </div>
      </q-card-section>

      <q-separator />

      <q-card-section class="q-gutter-y-md" style="max-height: 62vh; overflow: auto">
        <div>
          <div class="text-subtitle2 text-weight-bold q-mb-xs">Em que condições o alimento chegou?</div>
          <div class="column q-gutter-y-xs">
            <q-btn
              v-for="c in CONDICOES"
              :id="`btn-condicao-${c.value}`"
              :key="c.value"
              no-caps
              align="left"
              :outline="condicao !== c.value"
              :unelevated="condicao === c.value"
              :color="c.color"
              :icon="c.icon"
              @click="condicao = c.value"
            >
              <div class="q-ml-sm text-left">
                <div class="text-weight-bold">{{ c.label }}</div>
                <div class="text-caption" style="opacity: 0.85">{{ c.detalhe }}</div>
              </div>
            </q-btn>
          </div>
        </div>

        <div>
          <div class="text-subtitle2 text-weight-bold q-mb-xs">Observações (opcional)</div>
          <div class="row q-gutter-xs">
            <q-chip
              v-for="o in OBSERVACOES"
              :key="o"
              clickable
              dense
              :outline="!observacoes.includes(o)"
              :color="observacoes.includes(o) ? 'positive' : 'grey-7'"
              :text-color="observacoes.includes(o) ? 'white' : undefined"
              @click="alternar(o)"
            >
              {{ o }}
            </q-chip>
          </div>
        </div>

        <q-input
          id="campo-comentario-alimento"
          v-model="comentario"
          outlined
          dense
          autogrow
          type="textarea"
          maxlength="400"
          counter
          :dark="$q.dark.isActive"
          :label="comentarioObrigatorio ? 'Comentário (obrigatório para esta condição)' : 'Comentário (opcional)'"
        />

        <q-banner v-if="!temTelefone" dense rounded class="bg-orange-1 text-orange-10">
          A loja não possui WhatsApp válido cadastrado; não é possível enviar a avaliação.
        </q-banner>
        <div v-else class="text-caption text-grey-7">
          A mensagem será aberta no WhatsApp para <b>{{ doacao?.nomeLoja }}</b> ({{ formatarTelefone(telefone) }}). Confira o texto e envie.
        </div>
      </q-card-section>

      <q-separator />

      <q-card-actions align="right" class="q-pa-md">
        <q-btn flat no-caps label="Agora não" @click="fechar" />
        <q-btn
          id="btn-enviar-avaliacao-alimento"
          unelevated
          no-caps
          color="positive"
          icon="send"
          label="Enviar pelo WhatsApp"
          :disable="!temTelefone"
          @click="enviar"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>
