<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { useRoute } from "vue-router";
import { storeToRefs } from "pinia";
import { armazem } from "../services/armazemServidor";
import { servicoDoacoes } from "../services/servicoDoacoes";
import { useAppStore } from "../stores/estadoApp";

// Avaliação dos produtos doados, aberta pela entidade pelo link do WhatsApp (sem login).
// Mesmas regras da avaliação do cliente: nota de 1 a 5, motivo obrigatório abaixo de 3 estrelas,
// reclamação automática com 1 estrela e prazo de 1 hora depois da entrega.
const route = useRoute();
const { modoEscuro } = storeToRefs(useAppStore());

const oferta = ref(null);
const carregando = ref(true);
const naoEncontrada = ref(false);
const enviando = ref(false);
const enviadoComSucesso = ref(false);
const tentouEnviar = ref(false);
const erroServidor = ref("");

const nota = ref(5);
const comentario = ref("");
const reclamacao = ref(false);
const avaliadoPor = ref("");

const agora = ref(Date.now());
let relogio = null;

const notaBaixa = computed(() => nota.value < 3);
const entregue = computed(() => oferta.value?.status === "completed");
const prazoAberto = computed(() => {
  agora.value; // reavalia a cada minuto
  return servicoDoacoes.isEvaluationOpen(oferta.value);
});
const minutosRestantes = computed(() => {
  agora.value;
  return servicoDoacoes.getRemainingEvaluationMinutes(oferta.value);
});
const jaAvaliada = computed(() => !!oferta.value?.avaliacaoEntidade);
const podeResponder = computed(() => entregue.value && prazoAberto.value);

const rotulo = (estrelas) =>
  ({
    1: "1 ★ - Péssimo (gera reclamação)",
    2: "2 ★ - Ruim (motivo obrigatório)",
    3: "3 ★ - Regular",
    4: "4 ★ - Muito bom",
    5: "5 ★ - Excelente!",
  })[estrelas] || "";

const erroComentario = computed(() =>
  tentouEnviar.value && notaBaixa.value && !comentario.value.trim()
    ? "Informe o motivo da nota abaixo de 3 estrelas."
    : "",
);

const carregar = async () => {
  carregando.value = true;
  const chave = route.query.id || route.query.token || "";
  // Sempre do servidor: o status e a hora da entrega precisam estar atualizados
  const encontrada = chave ? await armazem.buscarOfertaPublica(chave) : null;
  if (!encontrada) {
    naoEncontrada.value = true;
  } else {
    oferta.value = encontrada;
    const anterior = encontrada.avaliacaoEntidade;
    if (anterior) {
      nota.value = anterior.notaComida || 5;
      comentario.value = anterior.comentarioComida || "";
      reclamacao.value = !!anterior.reclamacaoComida;
    }
    avaliadoPor.value = anterior?.avaliadoPor || encontrada.confirmedBy || "";
  }
  carregando.value = false;
};

const enviar = async () => {
  tentouEnviar.value = true;
  erroServidor.value = "";
  if (!podeResponder.value || erroComentario.value) return;
  enviando.value = true;
  try {
    const atualizada = await armazem.avaliarOfertaPublica(oferta.value.token || oferta.value.id, {
      notaComida: nota.value,
      comentarioComida: comentario.value.trim(),
      reclamacaoComida: reclamacao.value || nota.value === 1,
      avaliadoPor: avaliadoPor.value.trim(),
    });
    oferta.value = atualizada;
    enviadoComSucesso.value = true;
  } catch (erro) {
    erroServidor.value = erro.message;
  } finally {
    enviando.value = false;
  }
};

onMounted(() => {
  carregar();
  relogio = setInterval(() => (agora.value = Date.now()), 30000);
});
onBeforeUnmount(() => clearInterval(relogio));
</script>

<template>
  <q-page :class="['avaliar-page column', { 'bg-dark text-white': modoEscuro, 'bg-grey-2': !modoEscuro }]">
    <q-toolbar :class="modoEscuro ? 'bg-dark' : 'bg-white'">
      <div class="row items-center no-wrap q-gutter-x-sm q-px-sm">
        <q-avatar square size="36px" class="bg-green-1 text-positive">
          <q-icon name="favorite" size="20px" />
        </q-avatar>
        <div>
          <div class="text-subtitle2 text-weight-bold">Save All</div>
          <div class="text-caption text-grey-6">Avaliação dos produtos recebidos</div>
        </div>
      </div>
    </q-toolbar>
    <q-separator />

    <div class="avaliar-conteudo q-pa-md">
      <div v-if="carregando" class="text-center q-pa-xl">
        <q-spinner color="positive" size="36px" />
      </div>

      <q-banner v-else-if="naoEncontrada" rounded class="bg-red-1 text-negative">
        <template #avatar><q-icon name="error" /></template>
        Link de avaliação não encontrado. Confira se o link foi copiado por completo.
      </q-banner>

      <q-card v-else flat bordered :dark="modoEscuro" class="avaliar-card">
        <q-card-section>
          <div class="text-overline text-positive">Doação recebida</div>
          <div class="text-h6 text-weight-bold">{{ oferta.foodName }}</div>
          <div class="text-caption text-grey-7">
            {{ oferta.nomeLoja }} → {{ oferta.recipientOrg }}
            <span v-if="oferta.weightEstimatedKg"> · {{ oferta.weightEstimatedKg }} kg</span>
          </div>
        </q-card-section>
        <q-separator />

        <!-- Sucesso -->
        <q-card-section v-if="enviadoComSucesso" class="text-center q-pa-xl">
          <q-avatar size="64px" color="green-1" text-color="positive" icon="check_circle" />
          <div class="text-h6 text-weight-bold q-mt-md">Avaliação enviada!</div>
          <div class="text-body2 text-grey-7 q-mt-xs">
            Obrigado pela confiança e pela ajuda. Sua avaliação foi registrada e conta na nota geral do estabelecimento.
          </div>
          <div class="q-mt-md">
            <q-rating :model-value="nota" readonly size="2em" color="amber-7" icon="star_border" icon-selected="star" />
          </div>
        </q-card-section>

        <template v-else>
          <q-card-section class="q-gutter-y-md">
            <q-banner v-if="!entregue" rounded dense class="bg-amber-1 text-grey-9">
              <template #avatar><q-icon name="hourglass_top" color="amber-8" /></template>
              A avaliação fica disponível depois que o estabelecimento registrar a entrega da doação.
            </q-banner>
            <q-banner v-else-if="!prazoAberto" rounded dense class="bg-negative text-white">
              <template #avatar><q-icon name="warning" /></template>
              <div class="text-weight-bold text-uppercase text-caption">Prazo de avaliação encerrado (limite de 1h)</div>
              <div class="text-caption">
                Esta doação foi entregue há mais de 1 hora. Pela regra da plataforma, não é mais possível enviar ou editar a avaliação.
              </div>
            </q-banner>
            <q-banner v-else rounded dense class="bg-green-1 text-positive">
              <template #avatar><q-icon name="schedule" color="positive" /></template>
              <div class="row items-center justify-between no-wrap">
                <span class="text-weight-bold text-caption">Prazo: até 1h após a entrega</span>
                <q-badge color="positive" rounded class="q-px-sm q-py-xs text-weight-bold">Restam ~{{ minutosRestantes }} min</q-badge>
              </div>
            </q-banner>

            <q-banner rounded dense class="bg-amber-1 text-grey-9">
              <template #avatar><q-icon name="favorite" color="amber-8" /></template>
              <div class="text-weight-bold text-uppercase text-caption">Sua opinião é muito importante</div>
              <div class="text-caption">
                A avaliação dos produtos ajuda o Save All a melhorar a qualidade das doações e compõe a nota geral do estabelecimento.
              </div>
            </q-banner>

            <q-banner v-if="jaAvaliada && podeResponder" rounded dense class="bg-blue-1 text-primary">
              Você já avaliou esta doação. Enquanto o prazo estiver aberto, é possível alterar a avaliação.
            </q-banner>

            <!-- Nota dos produtos -->
            <div :class="['avaliar-secao q-pa-md rounded-borders', { 'avaliar-secao--baixa': notaBaixa }]">
              <div class="row items-center justify-between q-mb-xs">
                <span class="text-caption text-weight-bold text-uppercase">
                  <q-icon name="restaurant" color="positive" size="18px" /> Produtos recebidos
                </span>
                <span class="text-caption text-weight-bold" :class="notaBaixa ? 'text-negative' : 'text-amber-8'">{{ rotulo(nota) }}</span>
              </div>
              <div class="column items-center q-py-sm">
                <q-rating
                  id="avaliar-nota"
                  v-model="nota"
                  :max="5"
                  size="2.4em"
                  :color="nota < 3 ? 'negative' : 'amber-7'"
                  icon="star_border"
                  icon-selected="star"
                  :readonly="!podeResponder"
                />
              </div>

              <q-banner v-if="notaBaixa" dense rounded class="bg-red-1 text-negative q-mb-sm">
                <template #avatar><q-icon name="warning" color="negative" size="18px" /></template>
                <span class="text-caption">Nota abaixo de 3 estrelas: <strong>é obrigatório</strong> informar o motivo abaixo.</span>
              </q-banner>

              <q-input
                id="avaliar-comentario"
                v-model="comentario"
                type="textarea"
                outlined
                dense
                autogrow
                rows="2"
                :dark="modoEscuro"
                :disable="!podeResponder"
                :error="!!erroComentario"
                :error-message="erroComentario"
                :label="notaBaixa ? 'Motivo da nota (obrigatório) *' : 'Comentário sobre os produtos (opcional)'"
                :color="notaBaixa ? 'negative' : 'positive'"
                placeholder="Ex.: temperatura, validade, embalagem, quantidade..."
              />

              <q-checkbox
                v-model="reclamacao"
                dense
                color="negative"
                class="q-mt-sm"
                :disable="!podeResponder || nota === 1"
                label="Registrar como reclamação formal sobre os alimentos"
              />
              <div v-if="nota === 1" class="text-caption text-negative q-mt-xs">
                Nota de 1 estrela gera reclamação automaticamente.
              </div>
            </div>

            <q-input
              v-model="avaliadoPor"
              outlined
              dense
              :dark="modoEscuro"
              :disable="!podeResponder"
              label="Responsável pela avaliação (opcional)"
            />

            <q-banner v-if="erroServidor" rounded dense class="bg-red-1 text-negative">{{ erroServidor }}</q-banner>
          </q-card-section>

          <q-card-actions class="q-pa-md">
            <q-btn
              id="btn-enviar-avaliacao"
              unelevated
              no-caps
              color="positive"
              class="full-width text-weight-bold"
              icon="send"
              :label="jaAvaliada ? 'Atualizar avaliação' : 'Enviar avaliação'"
              :loading="enviando"
              :disable="!podeResponder"
              @click="enviar"
            />
          </q-card-actions>
        </template>
      </q-card>
    </div>
  </q-page>
</template>

<style scoped>
.avaliar-conteudo {
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
}
.avaliar-card {
  border-radius: 16px;
}
.avaliar-secao {
  border: 1px solid rgba(148, 163, 184, 0.45);
}
.avaliar-secao--baixa {
  border-color: var(--q-negative, #c10015);
  background: rgba(239, 68, 68, 0.05);
}
</style>