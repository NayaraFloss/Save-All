<script setup>
import { ref, onMounted, onUnmounted, computed } from "vue";
import { servicoDoacoes } from "../../services/servicoDoacoes";
import { useAppStore } from "../../stores/estadoApp";
import BlocoAssinatura from "./BlocoAssinatura.vue";
import { abrirWhatsapp, telefoneValido } from "../../utils/whatsapp";
defineProps({ lojaId: String, modoEscuro: Boolean });
const emit = defineEmits(["open-wizard", "select-offer", "proceed-donation", "doar-outra-entidade", "entrega-confirmada"]);
const appStore = useAppStore();
const { triggerNotification } = appStore;
const offers = ref([]);
const loadOffers = () => {
  offers.value = servicoDoacoes.getDonationOffers();
};
const handleOfferUpdate = () => {
  loadOffers();
};

// Relógio para o "Aguardando há 5h" atualizar sozinho a cada minuto
const agora = ref(Date.now());
let temporizadorRelogio = null;
// A entidade responde pelo link público (outro navegador): a loja busca a resposta no servidor sozinha
let temporizadorSincronizacao = null;
const sincronizar = async () => {
  await servicoDoacoes.atualizarDoServidor();
  loadOffers();
};
onMounted(() => {
  loadOffers();
  sincronizar();
  temporizadorSincronizacao = setInterval(sincronizar, 15000);
  window.addEventListener("saveall_donation_offer_created", handleOfferUpdate);
  window.addEventListener("saveall_donation_offer_updated", handleOfferUpdate);
  temporizadorRelogio = setInterval(() => {
    agora.value = Date.now();
  }, 60000);
});
onUnmounted(() => {
  window.removeEventListener("saveall_donation_offer_created", handleOfferUpdate);
  window.removeEventListener("saveall_donation_offer_updated", handleOfferUpdate);
  clearInterval(temporizadorRelogio);
  clearInterval(temporizadorSincronizacao);
});

const handleOpenWhatsApp = (offer) => {
  servicoDoacoes.sendWhatsAppInquiry(offer);
  triggerNotification(`Abrindo WhatsApp para enviar consulta a ${offer.recipientOrg}... \u{1F4AC}`, "success");
  loadOffers();
};

// ---------- Tempo de espera ----------
const LIMITE_ESPERA_LONGA_MIN = 4 * 60;
// Momento em que a mensagem foi enviada à entidade (ofertas antigas podem não ter todos os campos)
const dataEnvio = (oferta) => {
  const candidatos = [oferta.whatsappSentAt, oferta.inAppNotifiedAt, oferta.criadoEm, oferta.createdAt];
  return candidatos.find((d) => d && !Number.isNaN(new Date(d).getTime())) || null;
};
const minutosDesde = (dataIso) => {
  const ms = new Date(dataIso).getTime();
  if (!dataIso || Number.isNaN(ms)) return 0;
  return Math.max(0, Math.floor((agora.value - ms) / 60000));
};
const tempoDecorrido = (dataIso) => {
  const minutos = minutosDesde(dataIso);
  if (minutos < 1) return "menos de 1 min";
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (horas < 24) return resto ? `${horas}h ${resto}min` : `${horas}h`;
  const dias = Math.floor(horas / 24);
  const horasRestantes = horas % 24;
  return horasRestantes ? `${dias}d ${horasRestantes}h` : `${dias}d`;
};
const esperaLonga = (dataIso) => minutosDesde(dataIso) >= LIMITE_ESPERA_LONGA_MIN;
const formatarDataHora = (dataIso) => {
  if (!dataIso || Number.isNaN(new Date(dataIso).getTime())) return "";
  const data = new Date(dataIso);
  return `${data.toLocaleDateString("pt-BR")} \xE0s ${data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
};

// ---------- Aparência por status ----------
const rotuloStatus = (status) => ({
  pending_inquiry: "Aguardando Resposta",
  accepted: "Aceito pela entidade",
  rejected: "Recusada pela Entidade",
  cancelada: "Cancelada",
  entregue: "Entregue",
  completed: "Finalizada"
}[status] || "Concluída");
const corStatus = (status) => ({
  pending_inquiry: "warning",
  accepted: "positive",
  rejected: "negative",
  cancelada: "grey-7",
  entregue: "info",
  completed: "positive"
}[status] || "grey-7");
const iconeStatus = (status) => ({
  pending_inquiry: "schedule",
  accepted: "check_circle",
  rejected: "cancel",
  cancelada: "block",
  entregue: "local_shipping",
  completed: "verified"
}[status] || "check_circle");

// ---------- Cancelar consulta ----------
const ofertaParaCancelar = ref(null);
const motivoCancelamento = ref("");
const abrirCancelamento = (oferta) => {
  ofertaParaCancelar.value = oferta;
  motivoCancelamento.value = "";
};
const confirmarCancelamento = (doarParaOutra = false) => {
  const oferta = ofertaParaCancelar.value;
  if (!oferta) return;
  try {
    servicoDoacoes.cancelarOferta(oferta.id, motivoCancelamento.value);
    triggerNotification("Consulta cancelada. O alimento est\xE1 livre para ser doado a outra entidade.", "success");
    ofertaParaCancelar.value = null;
    loadOffers();
    if (doarParaOutra) emit("doar-outra-entidade", oferta);
  } catch (erro) {
    triggerNotification(erro.message, "error");
  }
};

// ---------- Agradecimento + avaliação da entidade ----------
const ofertaParaAgradecer = ref(null);
const enviarAgradecimento = (oferta) => {
  const atual = servicoDoacoes.getDonationOfferById(oferta.id) || oferta;
  if (!telefoneValido(atual.recipientWhatsapp)) {
    triggerNotification("A entidade n\xE3o tem um WhatsApp v\xE1lido cadastrado.", "warning");
    return;
  }
  // window.open precisa acontecer direto no clique
  const abriu = abrirWhatsapp(atual.recipientWhatsapp, servicoDoacoes.buildThanksWhatsAppMessage(atual), appStore.usuarioAtual);
  if (!abriu) {
    triggerNotification("O navegador bloqueou a abertura do WhatsApp. Libere pop-ups e tente novamente.", "warning");
    return;
  }
  ofertaParaAgradecer.value = null;
};
const avaliacaoAberta = (oferta) => servicoDoacoes.isEvaluationOpen(oferta);
const minutosRestantes = (oferta) => servicoDoacoes.getRemainingEvaluationMinutes(oferta);

// ---------- Termo assinado pelas duas partes ----------
// A loja assina desenhando (uma vez; pode ficar salva no perfil) antes de baixar o termo ou marcar a entrega.
const ofertaParaAssinar = ref(null);
const assinaturaDesenhada = ref("");
const salvarAssinaturaNoPerfil = ref(true);
const assinaturaDoPerfil = () => {
  const usuario = appStore.usuarioAtual;
  if (!usuario) return {};
  if (usuario.signatureType === "digital" && usuario.signatureCertificate) return { certificate: usuario.signatureCertificate };
  if (usuario.signatureImage) return { image: usuario.signatureImage };
  return {};
};
const garantirAssinaturaDaLoja = (oferta, depois) => {
  const atual = servicoDoacoes.getDonationOfferById(oferta.id) || oferta;
  if (atual.donorSignatureImage || atual.donorSignatureCertificate || atual.donorSignatureChoice) return depois();
  const doPerfil = assinaturaDoPerfil();
  if (doPerfil.image || doPerfil.certificate) {
    servicoDoacoes.assinarComoLoja(oferta.id, doPerfil);
    return depois();
  }
  assinaturaDesenhada.value = "";
  ofertaParaAssinar.value = { oferta, depois };
};
const confirmarAssinaturaDaLoja = async (desenhar = true) => {
  const pendente = ofertaParaAssinar.value;
  if (!pendente) return;
  if (desenhar && !assinaturaDesenhada.value) {
    triggerNotification('Desenhe a assinatura e toque em "Confirmar Assinatura".', "warning");
    return;
  }
  try {
    servicoDoacoes.assinarComoLoja(pendente.oferta.id, desenhar ? { image: assinaturaDesenhada.value } : { eletronica: true });
    if (desenhar && salvarAssinaturaNoPerfil.value) {
      await appStore.updateProfile({ signatureType: "drawn", signatureImage: assinaturaDesenhada.value, autoSignEnabled: true });
    }
    ofertaParaAssinar.value = null;
    pendente.depois();
  } catch (erro) {
    triggerNotification(erro.message, "error");
  }
};
const gerarPdfDoTermo = (oferta) => {
  servicoDoacoes.downloadDonationPdf(servicoDoacoes.getDonationOfferById(oferta.id) || oferta);
  triggerNotification("Termo de doa\xE7\xE3o assinado pelas duas partes baixado em PDF.", "success");
};
const baixarTermo = (oferta) => {
  try {
    garantirAssinaturaDaLoja(oferta, () => gerarPdfDoTermo(oferta));
  } catch (erro) {
    triggerNotification(erro.message, "error");
  }
};
const termosAssinados = computed(() =>
  offers.value.filter((o) => ["accepted", "entregue", "completed"].includes(o.status) && (o.signatureSignedAt || o.respondedAt)),
);

// ---------- Marcar como entregue ----------
const ofertaParaEntregar = ref(null);
const confirmarEntrega = () => {
  const oferta = ofertaParaEntregar.value;
  if (!oferta) return;
  ofertaParaEntregar.value = null;
  const concluir = () => {
    try {
      const entregue = servicoDoacoes.marcarEntregue(oferta.id);
      triggerNotification("Entrega registrada! Doa\xE7\xE3o finalizada e contabilizada nos relat\xF3rios.", "success");
      ofertaParaEntregar.value = null;
      loadOffers();
      // A loja baixa o lote do estoque e registra a doação nos relatórios e no certificado
      emit("entrega-confirmada", entregue);
      // Próximo passo: agradecer a entidade e mandar o link de avaliação (vale 1 hora)
      ofertaParaAgradecer.value = entregue;
    } catch (erro) {
      triggerNotification(erro.message, "error");
    }
  };
  try {
    garantirAssinaturaDaLoja(oferta, concluir);
  } catch (erro) {
    triggerNotification(erro.message, "error");
  }
};

const ofertasAguardando = computed(() => offers.value.filter((o) => o.status === "pending_inquiry"));
const ofertasRespondidas = computed(() => offers.value.filter((o) => o.status !== "pending_inquiry"));

const stats = computed(() => {
  const lista = offers.value;
  return {
    total: lista.length,
    pending: lista.filter((o) => o.status === "pending_inquiry").length,
    accepted: lista.filter((o) => o.status === "accepted" || o.status === "entregue").length,
    finalizadas: lista.filter((o) => o.status === "completed").length,
    recusadas: lista.filter((o) => o.status === "rejected" || o.status === "cancelada").length
  };
});
</script>

<template>
  <q-card flat bordered class="consultas-painel text-left">
    <!-- Cabeçalho -->
    <q-card-section class="row items-center justify-between no-wrap q-pb-sm">
      <div class="row items-center no-wrap q-gutter-sm">
        <q-avatar color="positive" text-color="white" size="36px" icon="chat" class="consultas-painel__avatar" />
        <div>
          <div class="row items-center q-gutter-xs text-subtitle2 text-weight-bold text-uppercase">
            <span>Consultas de Doação às Entidades</span>
            <q-badge color="positive" text-color="white" rounded label="app + whatsapp" />
          </div>
          <div class="text-caption text-grey-7">
            Notificação no app e envio de WhatsApp com link de confirmação em tempo real
          </div>
        </div>
      </div>

      <div class="row items-center no-wrap q-gutter-xs">
        <q-btn flat round dense color="grey-7" icon="refresh" size="sm" @click="sincronizar">
          <q-tooltip>Atualizar lista</q-tooltip>
        </q-btn>
      </div>
    </q-card-section>

    <q-separator />

    <!-- Estatísticas -->
    <q-card-section class="q-pb-none">
      <div class="row q-col-gutter-sm text-center">
        <div class="col-6 col-sm">
          <q-card flat bordered class="q-pa-sm">
            <div class="text-caption text-uppercase text-weight-bold text-grey-7">Total</div>
            <div class="text-subtitle1 text-weight-bold">{{ stats.total }}</div>
          </q-card>
        </div>
        <div class="col-6 col-sm">
          <q-card flat bordered class="q-pa-sm bg-orange-1 text-orange-9 stat-warning">
            <div class="text-caption text-uppercase text-weight-bold">Aguardando</div>
            <div class="text-subtitle1 text-weight-bold">{{ stats.pending }}</div>
          </q-card>
        </div>
        <div class="col-6 col-sm">
          <q-card flat bordered class="q-pa-sm bg-blue-1 text-blue-9 stat-info">
            <div class="text-caption text-uppercase text-weight-bold">Em andamento</div>
            <div class="text-subtitle1 text-weight-bold">{{ stats.accepted }}</div>
          </q-card>
        </div>
        <div class="col-6 col-sm">
          <q-card flat bordered class="q-pa-sm bg-green-1 text-green-9 stat-positive">
            <div class="text-caption text-uppercase text-weight-bold">Finalizadas</div>
            <div class="text-subtitle1 text-weight-bold">{{ stats.finalizadas }}</div>
          </q-card>
        </div>
        <div class="col-12 col-sm">
          <q-card flat bordered class="q-pa-sm bg-red-1 text-red-9 stat-negative">
            <div class="text-caption text-uppercase text-weight-bold">Recusadas / Canceladas</div>
            <div class="text-subtitle1 text-weight-bold">{{ stats.recusadas }}</div>
          </q-card>
        </div>
      </div>
    </q-card-section>

    <!-- Lista de ofertas -->
    <q-card-section class="q-pt-md">
      <div v-if="offers.length === 0" class="column items-center text-center q-pa-lg empty-state">
        <q-icon name="favorite" size="32px" color="grey-6" class="q-mb-sm" />
        <div class="text-subtitle2 text-weight-bold">Nenhuma consulta enviada</div>
        <div class="text-caption text-grey-7">Inicie uma triagem de doação para notificar entidades sociais.</div>
      </div>


      <!-- Grupo: aguardando resposta -->
      <section v-if="ofertasAguardando.length" class="grupo-consultas grupo-consultas--aguardando">
        <div class="grupo-consultas__titulo row items-center no-wrap">
          <q-icon name="schedule" color="warning" size="20px" class="q-mr-sm" />
          <span class="text-subtitle2 text-weight-bold text-uppercase">Aguardando resposta</span>
          <q-badge color="warning" text-color="black" rounded class="q-ml-sm" :label="ofertasAguardando.length" />
        </div>
        <div class="q-gutter-y-sm">
      <q-card
        v-for="item in ofertasAguardando"
        :key="item.id"
        flat
        bordered
        :class="['offer-card', `offer-card--${item.status}`]"
      >
        <q-card-section class="q-pb-sm">
          <div class="row items-start justify-between no-wrap q-gutter-sm">
            <div class="col">
              <div class="row items-center q-gutter-xs q-mb-xs">
                <q-chip
                  dense
                  square
                  :color="corStatus(item.status)"
                  :text-color="item.status === 'pending_inquiry' ? 'black' : 'white'"
                  :icon="iconeStatus(item.status)"
                  class="text-weight-bold text-uppercase"
                >
                  {{ rotuloStatus(item.status) }}
                </q-chip>
              </div>

              <div class="text-subtitle2 text-weight-bold text-positive">{{ item.foodName }}</div>
              <div class="row items-center q-gutter-x-sm text-caption text-grey-7">
                <span>Entidade: <strong>{{ item.recipientOrg }}</strong></span>
                <span>•</span>
                <span class="text-weight-bold text-warning">{{ item.weightEstimatedKg }} kg ({{ item.quantity }} un)</span>
              </div>

              <div v-if="item.recipientAddress" class="row items-center no-wrap text-caption text-grey-7 q-mt-xs">
                <q-icon name="place" color="positive" size="14px" class="q-mr-xs" />
                <span class="ellipsis address-line">Entrega: {{ item.recipientAddress }}</span>
              </div>
            </div>

            <!-- Tempo de espera (uma vez só, ao lado) -->
            <div
              v-if="item.status === 'pending_inquiry'"
              :class="['tempo-espera column items-end text-right', esperaLonga(dataEnvio(item)) ? 'tempo-espera--longa' : '']"
            >
              <div class="row items-center no-wrap text-weight-bold">
                <q-icon name="hourglass_top" size="18px" class="q-mr-xs" />
                <span v-if="dataEnvio(item)">Aguardando retorno há {{ tempoDecorrido(dataEnvio(item)) }}</span>
                <span v-else>Aguardando retorno da entidade</span>
              </div>
              <div v-if="dataEnvio(item)" class="text-caption tempo-espera__envio">
                Mensagem enviada em {{ formatarDataHora(dataEnvio(item)) }}
              </div>
              <div class="tempo-espera__dica">
                Se a entidade não responder, cancele a consulta e ofereça o alimento a outra entidade.
              </div>
            </div>
          </div>
        </q-card-section>

        <!-- Situação da doação -->
        <q-card-section v-if="item.status === 'accepted'" class="q-py-none">
          <q-banner dense rounded class="bg-green-1 text-green-9">
            <template #avatar>
              <q-icon name="check" color="positive" />
            </template>
            <div class="text-weight-bold">
              Retirada agendada para: <strong>{{ item.pickupEstimatedTime || 'Horário a combinar' }}</strong>
            </div>
            <div class="text-caption">
              Confirmado por: <strong>{{ item.confirmedBy || 'Representante' }}</strong>
            </div>
            <div v-if="item.responseNote" class="text-caption text-italic">"{{ item.responseNote }}"</div>
            <div class="text-caption q-mt-xs">
              Aceito e assinado pela entidade<span v-if="item.signatureSignedAt || item.respondedAt"> em {{ formatarDataHora(item.signatureSignedAt || item.respondedAt) }}</span>.
              Depois de entregar os alimentos, clique em <strong>Entregue</strong>.
            </div>
          </q-banner>
        </q-card-section>

        <q-card-section v-else-if="item.status === 'entregue'" class="q-py-none">
          <q-banner dense rounded class="bg-blue-1 text-blue-9">
            <template #avatar>
              <q-icon name="local_shipping" color="info" />
            </template>
            <div class="text-weight-bold">Alimentos entregues em {{ formatarDataHora(item.entregueEm) }}.</div>
            <div class="text-caption">Emita o termo e o certificado para finalizar a doação.</div>
          </q-banner>
        </q-card-section>

        <q-card-section v-else-if="item.status === 'completed'" class="q-py-none">
          <q-banner dense rounded class="bg-green-1 text-green-9">
            <template #avatar>
              <q-icon name="verified" color="positive" />
            </template>
            <div class="text-weight-bold">Doação finalizada em {{ formatarDataHora(item.finalizadoEm) }}.</div>
            <div v-if="item.certificadoId" class="text-caption">Certificado: <strong>{{ item.certificadoId }}</strong></div>
            <div class="text-caption">Já contabilizada nos gráficos e relatórios.</div>
          </q-banner>
        </q-card-section>

        <q-card-section v-else-if="item.status === 'cancelada'" class="q-py-none">
          <q-banner dense rounded class="bg-grey-3 text-grey-9">
            <template #avatar>
              <q-icon name="block" color="grey-7" />
            </template>
            <div class="text-weight-bold">Cancelada em {{ formatarDataHora(item.canceladoEm) }}.</div>
            <div class="text-caption">Motivo: {{ item.motivoCancelamento || 'Não informado' }}</div>
          </q-banner>
        </q-card-section>

        <q-card-section v-else-if="item.status === 'rejected'" class="q-py-none">
          <q-banner dense rounded class="bg-red-1 text-red-9">
            <template #avatar>
              <q-icon name="error_outline" color="negative" />
            </template>
            <div class="text-weight-bold">Motivo: {{ item.rejectionReason || 'Indisponibilidade de armazenamento' }}</div>
            <div v-if="item.responseNote" class="text-caption text-italic">"{{ item.responseNote }}"</div>
          </q-banner>
        </q-card-section>

        <!-- Ações -->
        <q-card-section class="q-pt-sm">
          <q-separator spaced class="dashed-separator" />
          <div class="row items-center justify-between q-gutter-sm">
            <div v-if="item.status === 'pending_inquiry' || item.status === 'accepted'" class="row items-center q-gutter-sm">
              <q-btn
                unelevated
                no-caps
                dense
                size="sm"
                color="positive"
                icon="send"
                label="Reenviar WhatsApp"
                class="q-px-sm"
                @click="handleOpenWhatsApp(item)"
              />
            </div>
            <div v-else />

            <div class="row items-center q-gutter-sm">
              <!-- Aguardando: pode cancelar -->
              <template v-if="item.status === 'pending_inquiry'">
                <q-btn
                  :id="`btn-cancelar-consulta-${item.id}`"
                  outline
                  no-caps
                  dense
                  size="sm"
                  color="negative"
                  icon="block"
                  label="Cancelar consulta"
                  class="q-px-sm"
                  @click="abrirCancelamento(item)"
                >
                  <q-tooltip>Cancela e libera o alimento para ser doado a outra entidade</q-tooltip>
                </q-btn>
              </template>

              <!-- Aceita: cancelar ou marcar como entregue -->
              <template v-else-if="item.status === 'accepted'">
                <q-btn
                  outline
                  no-caps
                  dense
                  size="sm"
                  color="negative"
                  icon="block"
                  label="Cancelar"
                  class="q-px-sm"
                  @click="abrirCancelamento(item)"
                />
                <q-btn
                  :id="`btn-baixar-termo-${item.id}`"
                  outline
                  no-caps
                  dense
                  size="sm"
                  color="primary"
                  icon="download"
                  label="Baixar Termo"
                  class="q-px-sm text-weight-bold"
                  @click="baixarTermo(item)"
                >
                  <q-tooltip>Termo de doação assinado pela loja e pela entidade (PDF)</q-tooltip>
                </q-btn>
                <q-btn
                  :id="`btn-entregue-${item.id}`"
                  unelevated
                  no-caps
                  dense
                  size="sm"
                  color="positive"
                  icon="local_shipping"
                  label="Entregue"
                  class="q-px-md text-weight-bold"
                  @click="ofertaParaEntregar = item"
                />
              </template>

              <!-- Entregue: emitir certificado -->
              <q-btn
                v-else-if="item.status === 'entregue'"
                unelevated
                no-caps
                dense
                size="sm"
                color="positive"
                icon="verified_user"
                label="Emitir Termo & Certificado"
                class="q-px-md text-weight-bold"
                @click="emit('proceed-donation', item)"
              />

              <!-- Recusada ou cancelada: doar para outra entidade -->
              <q-btn
                v-else-if="item.status === 'rejected' || item.status === 'cancelada'"
                :id="`btn-doar-outra-${item.id}`"
                unelevated
                no-caps
                dense
                size="sm"
                color="primary"
                icon="volunteer_activism"
                label="Doar para outra entidade"
                class="q-px-md text-weight-bold"
                @click="emit('doar-outra-entidade', item)"
              />

              <div v-else-if="item.status === 'completed'" class="column q-gutter-xs items-end">
                <div class="row items-center q-gutter-xs text-positive">
                  <q-icon name="verified" size="18px" />
                  <span class="text-caption text-weight-bold">Finalizada</span>
                </div>
                <div v-if="item.avaliacaoEntidade" class="row items-center q-gutter-xs text-caption">
                  <q-rating :model-value="item.avaliacaoEntidade.notaComida" readonly size="1.1em" color="amber-7" icon="star_border" icon-selected="star" />
                  <span class="text-weight-bold">Avaliação da entidade</span>
                  <q-tooltip v-if="item.avaliacaoEntidade.comentarioComida">{{ item.avaliacaoEntidade.comentarioComida }}</q-tooltip>
                </div>
                <q-btn
                  v-else-if="avaliacaoAberta(item)"
                  :id="`btn-reenviar-avaliacao-${item.id}`"
                  outline
                  no-caps
                  dense
                  size="sm"
                  color="positive"
                  icon="send"
                  label="Enviar agradecimento e avaliação"
                  class="q-px-sm text-weight-bold"
                  @click="enviarAgradecimento(item)"
                >
                  <q-tooltip>Restam ~{{ minutosRestantes(item) }} min para a entidade avaliar</q-tooltip>
                </q-btn>
                <span v-else class="text-caption text-grey-6">Prazo de avaliação encerrado</span>
              </div>
            </div>
          </div>
        </q-card-section>
      </q-card>
        </div>
      </section>

      <!-- Grupo: já respondidas / enviadas -->
      <section v-if="ofertasRespondidas.length" class="grupo-consultas grupo-consultas--respondidas">
        <div class="grupo-consultas__titulo row items-center no-wrap">
          <q-icon name="forward_to_inbox" color="positive" size="20px" class="q-mr-sm" />
          <span class="text-subtitle2 text-weight-bold text-uppercase">Enviadas / Respondidas</span>
          <q-badge color="positive" text-color="white" rounded class="q-ml-sm" :label="ofertasRespondidas.length" />
        </div>
        <div class="q-gutter-y-sm">
      <q-card
        v-for="item in ofertasRespondidas"
        :key="item.id"
        flat
        bordered
        :class="['offer-card', `offer-card--${item.status}`]"
      >
        <q-card-section class="q-pb-sm">
          <div class="row items-start justify-between no-wrap q-gutter-sm">
            <div class="col">
              <div class="row items-center q-gutter-xs q-mb-xs">
                <q-chip
                  dense
                  square
                  :color="corStatus(item.status)"
                  :text-color="item.status === 'pending_inquiry' ? 'black' : 'white'"
                  :icon="iconeStatus(item.status)"
                  class="text-weight-bold text-uppercase"
                >
                  {{ rotuloStatus(item.status) }}
                </q-chip>
              </div>

              <div class="text-subtitle2 text-weight-bold text-positive">{{ item.foodName }}</div>
              <div class="row items-center q-gutter-x-sm text-caption text-grey-7">
                <span>Entidade: <strong>{{ item.recipientOrg }}</strong></span>
                <span>•</span>
                <span class="text-weight-bold text-warning">{{ item.weightEstimatedKg }} kg ({{ item.quantity }} un)</span>
              </div>

              <div v-if="item.recipientAddress" class="row items-center no-wrap text-caption text-grey-7 q-mt-xs">
                <q-icon name="place" color="positive" size="14px" class="q-mr-xs" />
                <span class="ellipsis address-line">Entrega: {{ item.recipientAddress }}</span>
              </div>
            </div>

            <!-- Tempo de espera (uma vez só, ao lado) -->
            <div
              v-if="item.status === 'pending_inquiry'"
              :class="['tempo-espera column items-end text-right', esperaLonga(dataEnvio(item)) ? 'tempo-espera--longa' : '']"
            >
              <div class="row items-center no-wrap text-weight-bold">
                <q-icon name="hourglass_top" size="18px" class="q-mr-xs" />
                <span v-if="dataEnvio(item)">Aguardando retorno há {{ tempoDecorrido(dataEnvio(item)) }}</span>
                <span v-else>Aguardando retorno da entidade</span>
              </div>
              <div v-if="dataEnvio(item)" class="text-caption tempo-espera__envio">
                Mensagem enviada em {{ formatarDataHora(dataEnvio(item)) }}
              </div>
              <div class="tempo-espera__dica">
                Se a entidade não responder, cancele a consulta e ofereça o alimento a outra entidade.
              </div>
            </div>
          </div>
        </q-card-section>

        <!-- Situação da doação -->
        <q-card-section v-if="item.status === 'accepted'" class="q-py-none">
          <q-banner dense rounded class="bg-green-1 text-green-9">
            <template #avatar>
              <q-icon name="check" color="positive" />
            </template>
            <div class="text-weight-bold">
              Retirada agendada para: <strong>{{ item.pickupEstimatedTime || 'Horário a combinar' }}</strong>
            </div>
            <div class="text-caption">
              Confirmado por: <strong>{{ item.confirmedBy || 'Representante' }}</strong>
            </div>
            <div v-if="item.responseNote" class="text-caption text-italic">"{{ item.responseNote }}"</div>
            <div class="text-caption q-mt-xs">
              Aceito e assinado pela entidade<span v-if="item.signatureSignedAt || item.respondedAt"> em {{ formatarDataHora(item.signatureSignedAt || item.respondedAt) }}</span>.
              Depois de entregar os alimentos, clique em <strong>Entregue</strong>.
            </div>
          </q-banner>
        </q-card-section>

        <q-card-section v-else-if="item.status === 'entregue'" class="q-py-none">
          <q-banner dense rounded class="bg-blue-1 text-blue-9">
            <template #avatar>
              <q-icon name="local_shipping" color="info" />
            </template>
            <div class="text-weight-bold">Alimentos entregues em {{ formatarDataHora(item.entregueEm) }}.</div>
            <div class="text-caption">Emita o termo e o certificado para finalizar a doação.</div>
          </q-banner>
        </q-card-section>

        <q-card-section v-else-if="item.status === 'completed'" class="q-py-none">
          <q-banner dense rounded class="bg-green-1 text-green-9">
            <template #avatar>
              <q-icon name="verified" color="positive" />
            </template>
            <div class="text-weight-bold">Doação finalizada em {{ formatarDataHora(item.finalizadoEm) }}.</div>
            <div v-if="item.certificadoId" class="text-caption">Certificado: <strong>{{ item.certificadoId }}</strong></div>
            <div class="text-caption">Já contabilizada nos gráficos e relatórios.</div>
          </q-banner>
        </q-card-section>

        <q-card-section v-else-if="item.status === 'cancelada'" class="q-py-none">
          <q-banner dense rounded class="bg-grey-3 text-grey-9">
            <template #avatar>
              <q-icon name="block" color="grey-7" />
            </template>
            <div class="text-weight-bold">Cancelada em {{ formatarDataHora(item.canceladoEm) }}.</div>
            <div class="text-caption">Motivo: {{ item.motivoCancelamento || 'Não informado' }}</div>
          </q-banner>
        </q-card-section>

        <q-card-section v-else-if="item.status === 'rejected'" class="q-py-none">
          <q-banner dense rounded class="bg-red-1 text-red-9">
            <template #avatar>
              <q-icon name="error_outline" color="negative" />
            </template>
            <div class="text-weight-bold">Motivo: {{ item.rejectionReason || 'Indisponibilidade de armazenamento' }}</div>
            <div v-if="item.responseNote" class="text-caption text-italic">"{{ item.responseNote }}"</div>
          </q-banner>
        </q-card-section>

        <!-- Ações -->
        <q-card-section class="q-pt-sm">
          <q-separator spaced class="dashed-separator" />
          <div class="row items-center justify-between q-gutter-sm">
            <div v-if="item.status === 'pending_inquiry' || item.status === 'accepted'" class="row items-center q-gutter-sm">
              <q-btn
                unelevated
                no-caps
                dense
                size="sm"
                color="positive"
                icon="send"
                label="Reenviar WhatsApp"
                class="q-px-sm"
                @click="handleOpenWhatsApp(item)"
              />
            </div>
            <div v-else />

            <div class="row items-center q-gutter-sm">
              <!-- Aguardando: pode cancelar -->
              <template v-if="item.status === 'pending_inquiry'">
                <q-btn
                  :id="`btn-cancelar-consulta-${item.id}`"
                  outline
                  no-caps
                  dense
                  size="sm"
                  color="negative"
                  icon="block"
                  label="Cancelar consulta"
                  class="q-px-sm"
                  @click="abrirCancelamento(item)"
                >
                  <q-tooltip>Cancela e libera o alimento para ser doado a outra entidade</q-tooltip>
                </q-btn>
              </template>

              <!-- Aceita: cancelar ou marcar como entregue -->
              <template v-else-if="item.status === 'accepted'">
                <q-btn
                  outline
                  no-caps
                  dense
                  size="sm"
                  color="negative"
                  icon="block"
                  label="Cancelar"
                  class="q-px-sm"
                  @click="abrirCancelamento(item)"
                />
                <q-btn
                  :id="`btn-baixar-termo-${item.id}`"
                  outline
                  no-caps
                  dense
                  size="sm"
                  color="primary"
                  icon="download"
                  label="Baixar Termo"
                  class="q-px-sm text-weight-bold"
                  @click="baixarTermo(item)"
                >
                  <q-tooltip>Termo de doação assinado pela loja e pela entidade (PDF)</q-tooltip>
                </q-btn>
                <q-btn
                  :id="`btn-entregue-${item.id}`"
                  unelevated
                  no-caps
                  dense
                  size="sm"
                  color="positive"
                  icon="local_shipping"
                  label="Entregue"
                  class="q-px-md text-weight-bold"
                  @click="ofertaParaEntregar = item"
                />
              </template>

              <!-- Entregue: emitir certificado -->
              <q-btn
                v-else-if="item.status === 'entregue'"
                unelevated
                no-caps
                dense
                size="sm"
                color="positive"
                icon="verified_user"
                label="Emitir Termo & Certificado"
                class="q-px-md text-weight-bold"
                @click="emit('proceed-donation', item)"
              />

              <!-- Recusada ou cancelada: doar para outra entidade -->
              <q-btn
                v-else-if="item.status === 'rejected' || item.status === 'cancelada'"
                :id="`btn-doar-outra-${item.id}`"
                unelevated
                no-caps
                dense
                size="sm"
                color="primary"
                icon="volunteer_activism"
                label="Doar para outra entidade"
                class="q-px-md text-weight-bold"
                @click="emit('doar-outra-entidade', item)"
              />

              <div v-else-if="item.status === 'completed'" class="column q-gutter-xs items-end">
                <div class="row items-center q-gutter-xs text-positive">
                  <q-icon name="verified" size="18px" />
                  <span class="text-caption text-weight-bold">Finalizada</span>
                </div>
                <div v-if="item.avaliacaoEntidade" class="row items-center q-gutter-xs text-caption">
                  <q-rating :model-value="item.avaliacaoEntidade.notaComida" readonly size="1.1em" color="amber-7" icon="star_border" icon-selected="star" />
                  <span class="text-weight-bold">Avaliação da entidade</span>
                  <q-tooltip v-if="item.avaliacaoEntidade.comentarioComida">{{ item.avaliacaoEntidade.comentarioComida }}</q-tooltip>
                </div>
                <q-btn
                  v-else-if="avaliacaoAberta(item)"
                  :id="`btn-reenviar-avaliacao-${item.id}`"
                  outline
                  no-caps
                  dense
                  size="sm"
                  color="positive"
                  icon="send"
                  label="Enviar agradecimento e avaliação"
                  class="q-px-sm text-weight-bold"
                  @click="enviarAgradecimento(item)"
                >
                  <q-tooltip>Restam ~{{ minutosRestantes(item) }} min para a entidade avaliar</q-tooltip>
                </q-btn>
                <span v-else class="text-caption text-grey-6">Prazo de avaliação encerrado</span>
              </div>
            </div>
          </div>
        </q-card-section>
      </q-card>
        </div>
      </section>
    </q-card-section>

    <!-- Termos de doação assinados (guardados na loja) -->
    <q-separator v-if="termosAssinados.length" />
    <q-card-section v-if="termosAssinados.length">
      <div class="row items-center q-gutter-xs text-subtitle2 text-weight-bold text-uppercase q-mb-sm">
        <q-icon name="description" color="positive" size="18px" />
        <span>Termos de Doação assinados</span>
        <q-badge color="positive" rounded :label="termosAssinados.length" />
      </div>
      <div class="column q-gutter-y-xs">
        <div
          v-for="termo in termosAssinados"
          :key="`termo-${termo.id}`"
          class="row items-center justify-between no-wrap q-pa-sm rounded-borders bordered-termo"
        >
          <div class="col">
            <div class="text-weight-bold">{{ termo.foodName }} → {{ termo.recipientOrg }}</div>
            <div class="text-caption text-grey-7">
              {{ termo.weightEstimatedKg }} kg · assinado pela entidade em {{ formatarDataHora(termo.signatureSignedAt || termo.respondedAt) }} ·
              {{ rotuloStatus(termo.status) }}
            </div>
          </div>
          <q-btn
            :id="`btn-termo-guardado-${termo.id}`"
            outline
            no-caps
            dense
            size="sm"
            color="primary"
            icon="download"
            label="Baixar PDF"
            class="q-px-sm text-weight-bold"
            @click="baixarTermo(termo)"
          />
        </div>
      </div>
    </q-card-section>

    <!-- Diálogo: cancelar consulta -->
    <q-dialog :model-value="!!ofertaParaCancelar" @update:model-value="(v) => { if (!v) ofertaParaCancelar = null; }">
      <q-card class="dialogo-doacao">
        <q-card-section class="row items-center q-pb-none">
          <q-avatar color="red-1" text-color="negative" icon="block" size="40px" class="q-mr-sm" />
          <div class="text-subtitle1 text-weight-bold">Cancelar consulta de doação?</div>
        </q-card-section>
        <q-card-section class="q-gutter-y-sm">
          <div class="text-body2">
            A consulta de <strong>{{ ofertaParaCancelar?.foodName }}</strong> para
            <strong>{{ ofertaParaCancelar?.recipientOrg }}</strong> será cancelada e o alimento ficará livre para ser
            doado a outra entidade.
          </div>
          <q-input
            v-model="motivoCancelamento"
            outlined
            dense
            autogrow
            label="Motivo (opcional)"
            placeholder="Ex.: sem resposta da entidade"
          />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md q-gutter-sm">
          <q-btn flat no-caps color="grey-7" label="Voltar" @click="ofertaParaCancelar = null" />
          <q-btn outline no-caps color="negative" label="Só cancelar" @click="confirmarCancelamento(false)" />
          <q-btn
            id="btn-cancelar-e-doar-outra"
            unelevated
            no-caps
            color="primary"
            icon="volunteer_activism"
            label="Cancelar e escolher outra entidade"
            @click="confirmarCancelamento(true)"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Diálogo: agradecer a entidade e enviar o link de avaliação -->
    <q-dialog :model-value="!!ofertaParaAgradecer" @update:model-value="(v) => { if (!v) ofertaParaAgradecer = null; }">
      <q-card class="dialogo-doacao">
        <q-card-section class="row items-center q-pb-none">
          <q-avatar color="green-1" text-color="positive" icon="favorite" size="40px" class="q-mr-sm" />
          <div class="text-subtitle1 text-weight-bold">Entrega registrada!</div>
        </q-card-section>
        <q-card-section class="text-body2 q-gutter-y-sm">
          <div>
            Agora envie uma mensagem para <strong>{{ ofertaParaAgradecer?.recipientOrg }}</strong> agradecendo pela confiança,
            com o <strong>link para avaliar os produtos</strong> recebidos.
          </div>
          <q-banner dense rounded class="bg-amber-1 text-grey-9">
            <template #avatar><q-icon name="schedule" color="amber-8" /></template>
            <span class="text-caption">A entidade só poderá responder em até <strong>1 hora</strong> depois da entrega.
            A avaliação conta na nota geral do seu estabelecimento.</span>
          </q-banner>
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md q-gutter-sm">
          <q-btn flat no-caps color="grey-7" label="Agora não" v-close-popup />
          <q-btn
            id="btn-enviar-agradecimento"
            unelevated
            no-caps
            color="positive"
            icon="send"
            label="Enviar pelo WhatsApp"
            @click="enviarAgradecimento(ofertaParaAgradecer)"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Diálogo: assinatura do estabelecimento no termo de doação -->
    <q-dialog :model-value="!!ofertaParaAssinar" @update:model-value="(v) => { if (!v) ofertaParaAssinar = null; }">
      <q-card class="dialogo-doacao">
        <q-card-section class="row items-center q-pb-none">
          <q-avatar color="green-1" text-color="positive" icon="draw" size="40px" class="q-mr-sm" />
          <div class="text-subtitle1 text-weight-bold">Assinatura do estabelecimento</div>
        </q-card-section>
        <q-card-section class="q-gutter-y-sm">
          <div class="text-body2">
            Assine abaixo para que o termo de doação para <strong>{{ ofertaParaAssinar?.oferta?.recipientOrg }}</strong>
            saia com a assinatura da loja e da entidade.
          </div>
          <BlocoAssinatura
            :modo-escuro="modoEscuro"
            label="Assine com o dedo ou mouse"
            :initial-image="assinaturaDesenhada"
            @save="(img) => (assinaturaDesenhada = img)"
            @clear="assinaturaDesenhada = ''"
          />
          <q-checkbox v-model="salvarAssinaturaNoPerfil" dense color="positive" label="Salvar esta assinatura no perfil da loja para as próximas doações" />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md q-gutter-sm">
          <q-btn flat no-caps color="grey-7" label="Usar assinatura eletrônica" @click="confirmarAssinaturaDaLoja(false)" />
          <q-btn
            id="btn-assinar-termo-loja"
            unelevated
            no-caps
            color="positive"
            icon="check"
            label="Assinar e continuar"
            @click="confirmarAssinaturaDaLoja(true)"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Diálogo: confirmar entrega -->
    <q-dialog :model-value="!!ofertaParaEntregar" @update:model-value="(v) => { if (!v) ofertaParaEntregar = null; }">
      <q-card class="dialogo-doacao">
        <q-card-section class="row items-center q-pb-none">
          <q-avatar color="green-1" text-color="positive" icon="local_shipping" size="40px" class="q-mr-sm" />
          <div class="text-subtitle1 text-weight-bold">Confirmar entrega?</div>
        </q-card-section>
        <q-card-section>
          <div class="text-body2">
            Confirme que os alimentos (<strong>{{ ofertaParaEntregar?.foodName }}</strong>,
            {{ ofertaParaEntregar?.weightEstimatedKg }} kg) foram entregues para
            <strong>{{ ofertaParaEntregar?.recipientOrg }}</strong>. O termo de doação (assinado pela loja e pela
            entidade) fica guardado, e a doação será finalizada e contabilizada nos relatórios.
          </div>
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md q-gutter-sm">
          <q-btn flat no-caps color="grey-7" label="Ainda não" @click="ofertaParaEntregar = null" />
          <q-btn
            id="btn-confirmar-entrega"
            unelevated
            no-caps
            color="positive"
            icon="check"
            label="Sim, foi entregue e finalizar"
            @click="confirmarEntrega"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-card>
</template>

<style scoped lang="scss">
.bordered-termo {
  border: 1px solid rgba(16, 185, 129, 0.35);
}
.consultas-painel {
  border-radius: 24px;

  &__avatar {
    background: rgba(16, 185, 129, 0.12) !important;
    color: #10b981 !important;
    border: 1px solid rgba(16, 185, 129, 0.3);
  }
}

.empty-state {
  border: 1px dashed rgba(148, 163, 184, 0.5);
  border-radius: 16px;
}

.offer-card {
  border-radius: 16px;

  &--accepted {
    border-color: rgba(16, 185, 129, 0.5);
  }

  &--rejected,
  &--cancelada {
    border-color: rgba(239, 68, 68, 0.5);
  }

  &--entregue {
    border-color: rgba(14, 165, 233, 0.5);
  }

  &--completed {
    border-color: rgba(16, 185, 129, 0.5);
    background: rgba(16, 185, 129, 0.04);
  }
}

.grupo-consultas {
  & + & {
    margin-top: 32px;
    padding-top: 24px;
    border-top: 2px solid rgba(148, 163, 184, 0.35);
  }

  &__titulo {
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.25);
  }

  &--aguardando &__titulo {
    border-bottom-color: rgba(245, 158, 11, 0.5);
  }

  &--respondidas &__titulo {
    border-bottom-color: rgba(16, 185, 129, 0.5);
  }
}

.tempo-espera {
  max-width: 340px;
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(245, 158, 11, 0.12);
  color: #b45309;

  &--longa {
    background: rgba(239, 68, 68, 0.12);
    color: #b91c1c;
  }

  &__envio {
    opacity: 0.85;
  }

  &__dica {
    margin-top: 6px;
    font-size: 11px;
    line-height: 1.3;
    opacity: 0.85;
  }
}

.dialogo-doacao {
  width: 100%;
  max-width: 460px;
}

.address-line {
  max-width: 280px;
}

.dashed-separator {
  border-top: 1px dashed rgba(148, 163, 184, 0.5);
  background: transparent;
}

.body--dark {
  .tempo-espera { color: #fbbf24; }
  .tempo-espera--longa { color: #f87171; }

  .stat-warning,
  .stat-positive,
  .stat-info,
  .stat-negative {
    background: transparent !important;
  }

  .stat-warning { color: #fbbf24 !important; }
  .stat-positive { color: #34d399 !important; }
  .stat-negative { color: #f87171 !important; }
  .stat-info { color: #38bdf8 !important; }

  .offer-card--accepted .q-banner,
  .offer-card--rejected .q-banner,
  .offer-card--cancelada .q-banner,
  .offer-card--entregue .q-banner,
  .offer-card--completed .q-banner {
    background: rgba(255, 255, 255, 0.05) !important;
    color: inherit !important;
  }
}
</style>