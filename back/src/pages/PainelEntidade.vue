<script setup>
import BlocoAssinatura from "../components/store/BlocoAssinatura.vue";
import ExplicacaoImpacto from "../components/ExplicacaoImpacto.vue";
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { storeToRefs } from "pinia";
import { useAppStore } from "../stores/estadoApp";
import { armazem } from "../services/armazemServidor";
import { servicoDoacoes } from "../services/servicoDoacoes";
const appStore = useAppStore();
// Botão Início do cabeçalho: volta à primeira aba do painel
watch(() => appStore.inicioSinal, () => {
  activeTab.value = "inquiries";
});
const { usuarioAtual } = storeToRefs(appStore);
const { alternarModoEscuro, logout, triggerNotification } = appStore;
const activeTab = ref("inquiries");
const rejectionReasonOptions = [
  "Capacidade m\xE1xima de armazenamento atingida hoje",
  "Sem equipe de transporte dispon\xEDvel no hor\xE1rio",
  "Estoque suficiente no momento",
  "Outro motivo operacional"
];
const allLogs = ref([]);
const donationOffers = ref([]);
const entityRating = computed(() => Number(usuarioAtual.value?.rating ?? 5));
const suspenso = computed(() => {
  return entityRating.value < 4;
});
const loadDonationOffers = () => {
  donationOffers.value = servicoDoacoes.getDonationOffers();
};
const pendingInquiriesForEntity = computed(() => {
  return donationOffers.value.filter((o) => o.status === "pending_inquiry");
});
const showInquiryResponseModal = ref(false);
const activeInquiryToRespond = ref(null);
const entityResponseChoice = ref("accept");
const entityRespName = ref("");
const entityRespPickupTime = ref("17:30");
const entityRespNotes = ref("");
const entityRespRejectionReason = ref("Capacidade m\xE1xima de armazenamento atingida hoje");
const openRespondInquiry = (offer) => {
  if (suspenso.value) {
    triggerNotification("Sua conta est\xE1 suspensa devido \xE0 baixa reputa\xE7\xE3o. N\xE3o \xE9 poss\xEDvel responder consultas.", "error");
    return;
  }
  activeInquiryToRespond.value = offer;
  entityRespName.value = usuarioAtual.value?.name ? `${usuarioAtual.value.name} (Coord. Triagem)` : "Clara Silva (Coord. Triagem)";
  showInquiryResponseModal.value = true;
};
const handleConfirmInquiryResponse = async () => {
  if (!activeInquiryToRespond.value) return;
  if (entityResponseChoice.value === "accept" && !entityRespName.value.trim()) {
    triggerNotification("Informe o nome do respons\xE1vel pelo recebimento.", "error");
    return;
  }
  const status = entityResponseChoice.value === "accept" ? "accepted" : "rejected";
  // A resposta é validada e gravada no servidor antes de atualizar a tela
  try {
    await servicoDoacoes.updateDonationResponse(activeInquiryToRespond.value.id, {
      status,
      confirmedBy: entityRespName.value.trim() || void 0,
      pickupEstimatedTime: entityRespPickupTime.value || void 0,
      responseNote: entityRespNotes.value.trim() || void 0,
      rejectionReason: status === "rejected" ? entityRespRejectionReason.value : void 0
    });
  } catch (err) {
    triggerNotification(err.message || "Erro ao registrar a resposta.", "error");
    loadDonationOffers();
    return;
  }
  if (!activeInquiryToRespond.value) return;
  if (status === "accepted") {
    pendingIncoming.value.unshift({
      id: `pend-${activeInquiryToRespond.value.id}`,
      foodId: activeInquiryToRespond.value.foodId || "food-custom",
      foodName: activeInquiryToRespond.value.foodName,
      category: activeInquiryToRespond.value.category,
      nomeLoja: activeInquiryToRespond.value.nomeLoja,
      weightEstimatedKg: activeInquiryToRespond.value.weightEstimatedKg,
      date: (/* @__PURE__ */ new Date()).toISOString()
    });
    triggerNotification(`Recebimento confirmado! O estabelecimento ${activeInquiryToRespond.value.nomeLoja} foi notificado em tempo real.`, "success");
    activeTab.value = "incoming";
  } else {
    triggerNotification(`Indisponibilidade comunicada ao estabelecimento ${activeInquiryToRespond.value.nomeLoja}.`, "warning");
  }
  loadDonationOffers();
  showInquiryResponseModal.value = false;
  activeInquiryToRespond.value = null;
};
// Registros ESG vêm do servidor (tabela registros_descarte)
const loadLogs = () => {
  allLogs.value = armazem.colecao("esg_disposal_logs");
};
onMounted(() => {
  loadLogs();
  loadDonationOffers();
  window.addEventListener("saveall_donation_offer_created", loadDonationOffers);
  window.addEventListener("saveall_donation_offer_updated", loadDonationOffers);
});
onUnmounted(() => {
  window.removeEventListener("saveall_donation_offer_created", loadDonationOffers);
  window.removeEventListener("saveall_donation_offer_updated", loadDonationOffers);
});
const receivedDonations = computed(() => {
  return allLogs.value.filter((log) => log.type === "donation" && log.recipientOrganization === (usuarioAtual.value?.name || "Mesa Brasil Sesc"));
});
const pendingIncoming = ref([]);
const gpsCoordinates = ref("");
const captureGps = () => {
  gpsCoordinates.value = "";
  if (typeof navigator === "undefined" || !navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      gpsCoordinates.value = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
    },
    () => {},
    { timeout: 8000 }
  );
};
const drawnSignature = ref("");
const handleSignatureSave = (dataUrl) => {
  drawnSignature.value = dataUrl || "";
};
const handleSignatureClear = () => {
  drawnSignature.value = "";
};
const showSignModal = ref(false);
const activePendingItem = ref(null);
const signatureTypeChoice = ref("digital");
const certificateKey = ref("ICP-Brasil: Mesa-Brasil-Sesc-A3-Token-48192");
const handleOpenConfirm = (item) => {
  if (suspenso.value) {
    triggerNotification("Sua conta est\xE1 suspensa devido \xE0 baixa reputa\xE7\xE3o. N\xE3o \xE9 poss\xEDvel confirmar recebimentos.", "error");
    return;
  }
  activePendingItem.value = item;
  drawnSignature.value = "";
  captureGps();
  showSignModal.value = true;
};
const handleConfirmReceipt = () => {
  if (!activePendingItem.value) return;
  if (signatureTypeChoice.value === "drawn" && !drawnSignature.value) {
    triggerNotification("Desenhe e salve a assinatura antes de confirmar.", "warning");
    return;
  }
  const newItemLog = {
    id: `disp-${Date.now()}`,
    foodId: activePendingItem.value.foodId,
    foodName: activePendingItem.value.foodName,
    category: activePendingItem.value.category,
    type: "donation",
    recipientOrganization: usuarioAtual.value?.name || "Mesa Brasil Sesc",
    signatureName: `${usuarioAtual.value?.name || "Mesa Brasil Sesc"} - Coletor Respons\xE1vel`,
    signatureImage: signatureTypeChoice.value === "drawn" ? drawnSignature.value : void 0,
    signatureType: signatureTypeChoice.value,
    signatureCertificate: signatureTypeChoice.value === "digital" ? `\u{1F512} Assinado digitalmente por ${usuarioAtual.value?.name || "Mesa Brasil Sesc"} (${certificateKey.value}) em ${(/* @__PURE__ */ new Date()).toLocaleString()}` : `\u270D\uFE0F Assinado por desenho manual em ${(/* @__PURE__ */ new Date()).toLocaleString()}`,
    discardDestination: "",
    weightEstimatedKg: activePendingItem.value.weightEstimatedKg,
    gpsCoordinates: gpsCoordinates.value || "N\xE3o informada",
    date: (/* @__PURE__ */ new Date()).toISOString()
  };
  allLogs.value.unshift(newItemLog);
  armazem.salvarColecao("esg_disposal_logs", allLogs.value);
  pendingIncoming.value = pendingIncoming.value.filter((item) => item.id !== activePendingItem.value.id);
  triggerNotification("Doa\xE7\xE3o recebida e assinada digitalmente com sucesso! Ciclo fechado com rastreabilidade total.", "success");
  showSignModal.value = false;
  activePendingItem.value = null;
};
const esgTotals = computed(() => {
  const totalWeight = receivedDonations.value.reduce((sum, log) => sum + log.weightEstimatedKg, 0);
  return {
    weightKg: totalWeight.toFixed(1),
    co2Kg: (totalWeight * 2.5).toFixed(1),
    waterL: Math.round(totalWeight * 130),
    meals: Math.round(totalWeight * 2)
    // assuming 500g per meal
  };
});
</script>

<template>
  <q-page class="painel-entidade q-pa-md">
    <div class="painel-entidade__container column q-gutter-y-md">

      <!-- Cabeçalho com perfil -->
      <q-card flat bordered class="painel-entidade__header">
        <q-card-section class="row items-center justify-between no-wrap">
          <div class="row items-center no-wrap q-gutter-sm">
            <q-avatar size="40px" color="green-1" text-color="positive">🏛️</q-avatar>
            <div class="text-left">
              <div class="row items-center no-wrap q-gutter-x-xs">
                <div class="text-subtitle2 text-weight-bold ellipsis name-line">{{ usuarioAtual?.name || 'Mesa Brasil Sesc' }}</div>
                <q-icon name="verified_user" color="positive" size="16px">
                  <q-tooltip>Cadastro Verificado</q-tooltip>
                </q-icon>
              </div>
              <div class="text-caption text-grey-7 ellipsis name-line">ID: {{ usuarioAtual?.id || 'user-institution-1' }}</div>
            </div>
          </div>

          <div class="row items-center no-wrap q-gutter-xs">
            <q-btn flat round dense color="grey-7" :icon="$q.dark.isActive ? 'light_mode' : 'dark_mode'" @click="alternarModoEscuro">
              <q-tooltip>Alternar tema</q-tooltip>
            </q-btn>
            <q-btn flat round dense color="negative" icon="logout" @click="logout">
              <q-tooltip>Sair</q-tooltip>
            </q-btn>
          </div>
        </q-card-section>
      </q-card>

      <!-- Alerta de suspensão (Governança Camada 2) -->
      <q-banner v-if="suspenso" rounded class="bg-negative text-white suspended-banner">
        <template #avatar>
          <q-icon name="warning" color="white" />
        </template>
        <div class="text-subtitle2 text-weight-bold">CONTA SUSPENSA - REPUTAÇÃO BAIXA</div>
        <div class="text-caption">
          Sua nota atual ({{ entityRating }}⭐) está abaixo do limite de 4.0 estabelecido nas regras de governança da plataforma. Entre em contato com o suporte para reavaliação.
        </div>
      </q-banner>

      <!-- Abas -->
      <q-card flat bordered>
        <q-tabs
          v-model="activeTab"
          dense
          no-caps
          active-color="positive"
          indicator-color="positive"
          class="text-grey-7"
          align="justify"
          narrow-indicator
        >
          <q-tab name="inquiries">
            <div class="column items-center text-weight-bold">
              <span>💬 Consultas</span>
              <span class="text-caption">({{ pendingInquiriesForEntity.length }})</span>
            </div>
          </q-tab>
          <q-tab name="incoming">
            <div class="column items-center text-weight-bold">
              <span>📥 Receber</span>
              <span class="text-caption">({{ pendingIncoming.length }})</span>
            </div>
          </q-tab>
          <q-tab name="history">
            <div class="column items-center text-weight-bold">
              <span>📋 Histórico</span>
              <span class="text-caption">({{ receivedDonations.length }})</span>
            </div>
          </q-tab>
          <q-tab name="profile">
            <div class="column items-center text-weight-bold">
              <span>🛡️ Trust</span>
              <span class="text-caption">ESG</span>
            </div>
          </q-tab>
        </q-tabs>
        <q-separator />

        <q-tab-panels v-model="activeTab" animated class="bg-transparent text-left">

          <!-- ABA 0: CONSULTAS RECEBIDAS (APP & WHATSAPP) -->
          <q-tab-panel name="inquiries" class="q-gutter-y-sm">
            <div class="row items-center justify-between">
              <span class="text-caption text-uppercase text-weight-bold text-grey-7">Consultas de Doação Recebidas</span>
              <span class="text-caption text-positive">Notificação App + WhatsApp</span>
            </div>

            <div v-if="pendingInquiriesForEntity.length === 0" class="column items-center text-center q-pa-lg empty-state">
              <q-icon name="chat" size="32px" color="positive" class="q-mb-sm" />
              <div class="text-subtitle2 text-weight-bold">Nenhuma consulta pendente</div>
              <div class="text-caption text-grey-7 empty-text">
                Quando estabelecimentos parceiros tiverem excedentes para doar, a notificação e mensagem WhatsApp aparecerão aqui.
              </div>
            </div>

            <q-card v-for="offer in pendingInquiriesForEntity" :key="offer.id" flat bordered class="item-card">
              <q-card-section>
                <div class="row items-start justify-between no-wrap">
                  <div>
                    <q-chip dense square color="orange-2" text-color="orange-10" icon="schedule" class="text-weight-bold text-uppercase q-ma-none">
                      CONSULTA PENDENTE DE RESPOSTA
                    </q-chip>
                    <div class="text-subtitle2 text-weight-bold text-positive q-mt-xs">{{ offer.foodName }}</div>
                    <div class="row items-center q-gutter-x-sm text-caption text-grey-7">
                      <span>Doador: <strong>{{ offer.nomeLoja }}</strong></span>
                      <span>•</span>
                      <span>Categoria: <b>{{ offer.category }}</b></span>
                    </div>
                  </div>

                  <div class="text-right">
                    <div class="text-subtitle2 text-weight-bold text-positive">{{ offer.weightEstimatedKg }} kg</div>
                    <div class="text-caption text-grey-7">({{ offer.quantity }} un)</div>
                  </div>
                </div>

                <!-- Endereço e nota da loja -->
                <q-card flat bordered class="q-pa-sm q-mt-sm info-box">
                  <div v-if="offer.storeAddress" class="row items-center no-wrap text-caption">
                    <q-icon name="place" color="positive" size="14px" class="q-mr-xs" />
                    <span>{{ offer.storeAddress }}</span>
                  </div>
                  <div v-if="offer.description" class="text-caption text-grey-7 text-italic">
                    "{{ offer.description }}"
                  </div>
                </q-card>

                <!-- Indicador de WhatsApp -->
                <q-separator class="q-mt-sm" />
                <div class="row items-center justify-between q-mt-sm text-caption text-grey-7">
                  <span class="row items-center q-gutter-x-xs">
                    <q-icon name="chat" color="positive" size="14px" />
                    <span>Mensagem WhatsApp enviada</span>
                  </span>
                  <a :href="`#/confirmar-doacao?id=${offer.id}`" target="_blank" class="row items-center text-positive public-link">
                    <span>Link Público</span>
                    <q-icon name="open_in_new" size="12px" class="q-ml-xs" />
                  </a>
                </div>

                <!-- Ações: aceitar / recusar -->
                <div class="row q-col-gutter-sm q-mt-xs">
                  <div class="col-6">
                    <q-btn
                      unelevated
                      no-caps
                      color="positive"
                      icon="check"
                      label="Sim, Podemos Receber"
                      class="full-width text-weight-bold"
                      @click="openRespondInquiry(offer)"
                    />
                  </div>
                  <div class="col-6">
                    <q-btn
                      outline
                      no-caps
                      color="negative"
                      icon="cancel"
                      label="Não Podemos Hoje"
                      class="full-width text-weight-bold"
                      @click="openRespondInquiry(offer); entityResponseChoice = 'reject'"
                    />
                  </div>
                </div>
              </q-card-section>
            </q-card>
          </q-tab-panel>

          <!-- ABA 1: DOAÇÕES A CONFIRMAR -->
          <q-tab-panel name="incoming" class="q-gutter-y-sm">
            <div class="row items-center justify-between">
              <span class="text-caption text-uppercase text-weight-bold text-grey-7">Doações a Confirmar</span>
              <span class="text-caption text-grey-7">Confirmando fecha o ciclo de auditoria</span>
            </div>

            <div v-if="pendingIncoming.length === 0" class="column items-center text-center q-pa-lg empty-state">
              <q-icon name="check_circle" size="32px" color="positive" class="q-mb-sm" />
              <div class="text-subtitle2 text-weight-bold">Tudo em dia!</div>
              <div class="text-caption text-grey-7">Nenhuma doação pendente de assinatura no momento.</div>
            </div>

            <q-card v-for="item in pendingIncoming" :key="item.id" flat bordered class="item-card">
              <q-card-section class="q-gutter-y-sm">
                <div class="row items-start justify-between no-wrap">
                  <div>
                    <q-badge color="green-2" text-color="green-10" class="text-weight-bold text-uppercase">PENDENTE RECEBIMENTO</q-badge>
                    <div class="text-subtitle2 text-weight-bold q-mt-xs">{{ item.foodName }}</div>
                    <div class="row items-center q-gutter-x-sm text-caption text-grey-7">
                      <span>Doador: <b>{{ item.nomeLoja }}</b></span>
                      <span>•</span>
                      <span>Categoria: <b>{{ item.category }}</b></span>
                    </div>
                  </div>
                  <div class="text-right">
                    <div class="text-subtitle2 text-weight-bold text-positive">{{ item.weightEstimatedKg }} kg</div>
                    <div class="text-caption text-grey-7">Estimado</div>
                  </div>
                </div>

                <!-- Impacto calculado do lote -->
                <q-card flat bordered class="q-pa-sm info-box">
                  <div class="row q-col-gutter-sm text-caption">
                    <div class="col-6">
                      <div class="text-grey-7">Redução de CO₂e</div>
                      <div class="text-weight-bold text-positive">+{{ (item.weightEstimatedKg * 2.5).toFixed(1) }} kg CO₂e</div>
                    </div>
                    <div class="col-6">
                      <div class="text-grey-7">Água Poupada</div>
                      <div class="text-weight-bold text-info">+{{ Math.round(item.weightEstimatedKg * 130) }} L</div>
                    </div>
                  </div>
                </q-card>

                <q-btn
                  unelevated
                  no-caps
                  color="positive"
                  label="✍️ Confirmar Recebimento & Assinar"
                  class="full-width text-weight-bold"
                  @click="handleOpenConfirm(item)"
                />
              </q-card-section>
            </q-card>
          </q-tab-panel>

          <!-- ABA 2: HISTÓRICO (RASTREABILIDADE) -->
          <q-tab-panel name="history" class="q-gutter-y-sm">
            <div class="row items-center justify-between">
              <span class="text-caption text-uppercase text-weight-bold text-grey-7">Histórico de Coletas Realizadas</span>
              <span class="text-caption text-grey-7">Layer 3 — Rastreabilidade Legal</span>
            </div>
            <ExplicacaoImpacto :peso-kg="receivedDonations.reduce((soma, log) => soma + (Number(log.weightEstimatedKg) || 0), 0)" />

            <div v-if="receivedDonations.length === 0" class="column items-center text-center q-pa-lg empty-state">
              <q-icon name="schedule" size="32px" color="grey-6" class="q-mb-sm" />
              <div class="text-subtitle2 text-weight-bold">Nenhum registro</div>
              <div class="text-caption text-grey-7">Sua instituição ainda não possui coletas registradas no log.</div>
            </div>

            <q-card v-for="log in receivedDonations" :key="log.id" flat bordered class="item-card">
              <q-card-section class="q-gutter-y-sm">
                <div class="row items-center justify-between text-caption text-grey-7">
                  <span>ID: {{ log.id }}</span>
                  <span>{{ new Date(log.date).toLocaleDateString() }} às {{ new Date(log.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) }}</span>
                </div>

                <div class="text-subtitle2 text-weight-bold">{{ log.foodName }}</div>

                <q-card flat bordered class="q-pa-sm info-box">
                  <div class="row q-col-gutter-sm text-caption text-grey-7">
                    <div class="col-4">
                      <div>Peso Líquido</div>
                      <div class="text-weight-bold text-positive">{{ log.weightEstimatedKg }} kg</div>
                    </div>
                    <div class="col-4">
                      <div>CO₂ Evitado</div>
                      <div class="text-weight-bold text-positive">{{ (log.weightEstimatedKg * 2.5).toFixed(1) }} kg</div>
                    </div>
                    <div class="col-4">
                      <div>Água Poupada</div>
                      <div class="text-weight-bold text-info">{{ Math.round(log.weightEstimatedKg * 130) }} L</div>
                    </div>
                  </div>
                </q-card>

                <!-- Indicadores de rastreabilidade -->
                <q-separator class="dashed-separator" />
                <div class="column q-gutter-y-xs text-caption text-grey-7">
                  <div class="row items-center no-wrap">
                    <q-icon name="explore" color="positive" size="14px" class="q-mr-xs" />
                    <span>GPS Coleta: <b>{{ log.gpsCoordinates || '-26.8829, -53.0578' }}</b></span>
                  </div>
                  <div class="row items-center no-wrap">
                    <q-icon name="verified_user" color="positive" size="14px" class="q-mr-xs" />
                    <span class="ellipsis">{{ log.signatureCertificate || 'Assinado eletronicamente' }}</span>
                  </div>
                </div>
              </q-card-section>
            </q-card>
          </q-tab-panel>

          <!-- ABA 3: PERFIL DE CONFIANÇA E GOVERNANÇA -->
          <q-tab-panel name="profile" class="q-gutter-y-md">

            <!-- Camada 1 -->
            <q-card flat bordered>
              <q-card-section>
                <div class="row items-center q-gutter-sm q-mb-sm">
                  <q-icon name="verified_user" color="positive" size="20px" />
                  <div class="text-subtitle2 text-weight-bold text-uppercase">Camada 1 — Cadastro Verificado</div>
                </div>

                <q-list dense separator>
                  <q-item>
                    <q-item-section class="text-grey-7">Razão Social</q-item-section>
                    <q-item-section side class="text-weight-medium">{{ usuarioAtual?.name || 'Mesa Brasil Sesc' }}</q-item-section>
                  </q-item>
                  <q-item>
                    <q-item-section class="text-grey-7">CNPJ Ativo</q-item-section>
                    <q-item-section side class="text-weight-medium">{{ usuarioAtual?.cpfCnpj || '12.345.678/0001-90' }}</q-item-section>
                  </q-item>
                  <q-item>
                    <q-item-section class="text-grey-7">Situação Cadastral</q-item-section>
                    <q-item-section side>
                      <q-badge color="green-2" text-color="green-10" class="text-weight-bold text-uppercase">✓ Ativo e Homologado</q-badge>
                    </q-item-section>
                  </q-item>
                  <q-item>
                    <q-item-section class="text-grey-7">Foto do Documento</q-item-section>
                    <q-item-section side class="text-italic">Anexado (estatuto_social.pdf)</q-item-section>
                  </q-item>
                  <q-item>
                    <q-item-section class="text-grey-7">Selfie do Gestor</q-item-section>
                    <q-item-section side class="text-italic">Verificado via Biometria</q-item-section>
                  </q-item>
                </q-list>
              </q-card-section>
            </q-card>

            <!-- Camada 2 -->
            <q-card flat bordered>
              <q-card-section>
                <div class="row items-center justify-between q-mb-sm">
                  <div class="row items-center q-gutter-sm">
                    <q-icon name="star" color="warning" size="20px" />
                    <div class="text-subtitle2 text-weight-bold text-uppercase">Camada 2 — Reputação e Nota</div>
                  </div>
                  <span class="text-caption text-grey-7">Média atual</span>
                </div>

                <div class="text-caption text-grey-7 q-mb-md">
                  O Save All possui regras estritas de governança. Perfis com nota abaixo de <b>4.0</b> são suspensos automaticamente pelo algoritmo inteligente do aplicativo.
                </div>

                <q-card flat bordered class="q-pa-sm q-mb-md info-box">
                  <div class="row items-center justify-between">
                    <span class="text-caption text-grey-7">Sua reputação atual:</span>
                    <span :class="['text-subtitle1 text-weight-bold', entityRating < 4.0 ? 'text-negative' : 'text-warning']">
                      {{ entityRating.toFixed(1) }} ⭐
                    </span>
                  </div>
                  <q-linear-progress rounded size="8px" class="q-my-sm" :value="Math.min(1, entityRating / 5)" :color="entityRating < 4.0 ? 'negative' : 'positive'" />
                  <div class="row items-center justify-between text-caption text-grey-7">
                    <span>0</span>
                    <span class="text-negative text-weight-bold">4.0 (Limite de Corte)</span>
                    <span>5.0 (Excelente)</span>
                  </div>
                </q-card>
              </q-card-section>
            </q-card>
          </q-tab-panel>
        </q-tab-panels>
      </q-card>

      <!-- Rodapé: ESG acumulado -->
      <q-card flat bordered>
        <q-card-section>
          <div class="row items-center justify-between q-mb-sm">
            <span class="text-caption text-uppercase text-weight-bold text-grey-7">Total ESG Acumulado pela Entidade</span>
            <span class="text-caption text-grey-7 text-italic">Padrão FAO/ONU</span>
          </div>

          <div class="row q-col-gutter-sm text-center">
            <div class="col-4">
              <q-card flat class="q-pa-sm esg-box esg-box--positive">
                <div class="text-caption text-positive text-uppercase">Alimento Salvo</div>
                <div class="text-subtitle2 text-weight-bold text-positive">{{ esgTotals.weightKg }} kg</div>
              </q-card>
            </div>
            <div class="col-4">
              <q-card flat class="q-pa-sm esg-box esg-box--blue">
                <div class="text-caption text-blue text-uppercase">CO₂ Evitado</div>
                <div class="text-subtitle2 text-weight-bold text-blue">{{ esgTotals.co2Kg }} kg</div>
              </q-card>
            </div>
            <div class="col-4">
              <q-card flat class="q-pa-sm esg-box esg-box--info">
                <div class="text-caption text-info text-uppercase">Água Salva</div>
                <div class="text-subtitle2 text-weight-bold text-info">{{ esgTotals.waterL }} L</div>
              </q-card>
            </div>
          </div>
        </q-card-section>
      </q-card>
    </div>

    <!-- MODAL: RESPOSTA À CONSULTA (APP + WHATSAPP) -->
    <q-dialog v-model="showInquiryResponseModal">
      <q-card v-if="activeInquiryToRespond" class="dialog-card text-left">
        <q-card-section class="row items-center justify-between no-wrap">
          <div>
            <div class="text-subtitle2 text-weight-bold text-uppercase text-positive">Resposta à Consulta de Doação</div>
            <div class="text-caption text-grey-7">Lei nº 14.016/2020 — Retorno ao Estabelecimento</div>
          </div>
          <q-btn flat round dense icon="close" color="grey-7" @click="showInquiryResponseModal = false" />
        </q-card-section>
        <q-separator />

        <q-card-section class="q-gutter-y-md">
          <!-- Detalhes do item -->
          <q-card flat bordered class="q-pa-sm info-box">
            <div class="row items-start justify-between no-wrap">
              <span class="text-subtitle2 text-weight-bold">{{ activeInquiryToRespond.foodName }}</span>
              <q-badge color="green-2" text-color="green-10" class="text-weight-bold">{{ activeInquiryToRespond.weightEstimatedKg }} kg</q-badge>
            </div>
            <div class="text-caption text-grey-7">Doador: <strong>{{ activeInquiryToRespond.nomeLoja }}</strong></div>
            <div v-if="activeInquiryToRespond.storeAddress" class="text-caption text-grey-7">Endereço: {{ activeInquiryToRespond.storeAddress }}</div>
          </q-card>

          <!-- Escolha -->
          <div class="row q-col-gutter-sm">
            <div class="col-6">
              <q-btn
                :unelevated="entityResponseChoice === 'accept'"
                :outline="entityResponseChoice !== 'accept'"
                no-caps
                color="positive"
                label="✓ Podemos Receber"
                class="full-width text-weight-bold"
                @click="entityResponseChoice = 'accept'"
              />
            </div>
            <div class="col-6">
              <q-btn
                :unelevated="entityResponseChoice === 'reject'"
                :outline="entityResponseChoice !== 'reject'"
                no-caps
                color="negative"
                label="✕ Indisponível"
                class="full-width text-weight-bold"
                @click="entityResponseChoice = 'reject'"
              />
            </div>
          </div>

          <!-- Formulário de aceite -->
          <div v-if="entityResponseChoice === 'accept'" class="q-gutter-y-sm">
            <q-input v-model="entityRespName" outlined dense color="positive" label="Nome do Responsável *" placeholder="Ex: Clara Silva (Coord. Triagem)" />
            <q-input v-model="entityRespPickupTime" outlined dense color="positive" label="Horário Previsto para Coleta" placeholder="Ex: Hoje às 17:30" />
            <q-input v-model="entityRespNotes" outlined dense color="positive" label="Observações (Opcional)" placeholder="Ex: Temos caixas térmicas e equipe disponível." />
          </div>

          <!-- Formulário de recusa -->
          <div v-else class="q-gutter-y-sm">
            <q-select
              v-model="entityRespRejectionReason"
              :options="rejectionReasonOptions"
              outlined
              dense
              color="negative"
              label="Motivo da Indisponibilidade"
            />
            <q-input v-model="entityRespNotes" outlined dense color="negative" label="Mensagem Adicional" placeholder="Ex: Amanhã pela manhã teremos espaço disponível..." />
          </div>
        </q-card-section>

        <q-card-actions align="right" class="q-px-md q-pb-md">
          <q-btn flat no-caps color="grey-7" label="Voltar" @click="showInquiryResponseModal = false" />
          <q-btn
            unelevated
            no-caps
            :color="entityResponseChoice === 'accept' ? 'positive' : 'negative'"
            :label="entityResponseChoice === 'accept' ? '✓ Confirmar Aceite' : '✕ Enviar Recusa'"
            class="text-weight-bold"
            @click="handleConfirmInquiryResponse"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- MODAL: ASSINATURA -->
    <q-dialog v-model="showSignModal">
      <q-card class="dialog-card text-left">
        <q-card-section class="row items-center justify-between no-wrap">
          <div class="text-subtitle2 text-weight-bold text-uppercase">Auditoria Digital — Fechamento do Ciclo</div>
          <q-btn flat round dense icon="close" color="grey-7" @click="showSignModal = false" />
        </q-card-section>
        <q-separator />

        <q-card-section class="q-gutter-y-md">
          <q-card v-if="activePendingItem" flat bordered class="q-pa-sm info-box">
            <div class="text-caption text-uppercase text-weight-bold text-grey-7">Lote e Recipiente:</div>
            <div class="text-subtitle2 text-weight-bold">{{ activePendingItem.foodName }}</div>
            <div class="text-caption text-grey-7">Peso estimado: {{ activePendingItem.weightEstimatedKg }} kg • Origem: {{ activePendingItem.nomeLoja }}</div>
          </q-card>

          <div class="q-gutter-y-sm">
            <div class="text-caption text-uppercase text-weight-bold text-grey-7">Tipo de Assinatura Auditoria</div>
            <div class="row q-col-gutter-sm">
              <div class="col-6">
                <q-btn
                  :unelevated="signatureTypeChoice === 'digital'"
                  :outline="signatureTypeChoice !== 'digital'"
                  no-caps
                  dense
                  color="positive"
                  label="🔒 Token Criptográfico"
                  class="full-width text-weight-bold"
                  @click="signatureTypeChoice = 'digital'"
                />
              </div>
              <div class="col-6">
                <q-btn
                  :unelevated="signatureTypeChoice === 'drawn'"
                  :outline="signatureTypeChoice !== 'drawn'"
                  no-caps
                  dense
                  color="positive"
                  label="✍️ Desenho Manual"
                  class="full-width text-weight-bold"
                  @click="signatureTypeChoice = 'drawn'"
                />
              </div>
            </div>

            <!-- Seleção do token -->
            <q-input
              v-if="signatureTypeChoice === 'digital'"
              v-model="certificateKey"
              outlined
              dense
              color="positive"
              label="Certificado Homologado Save All (Layer 3)"
            >
              <template #prepend>
                <q-icon name="lock" color="positive" size="16px" />
              </template>
            </q-input>

            <q-card v-else flat bordered class="q-pa-sm signature-box">
              <BlocoAssinatura label="Assine com o dedo ou mouse" @save="handleSignatureSave" @clear="handleSignatureClear" />
            </q-card>

            <div class="row items-center no-wrap text-caption text-grey-7">
              <q-icon name="explore" color="positive" size="16px" class="q-mr-xs" />
              <span>Coleta registrada via GPS em: <b class="text-positive">{{ gpsCoordinates || 'obtendo localização...' }}</b></span>
            </div>
          </div>
        </q-card-section>

        <q-card-actions align="right" class="q-px-md q-pb-md">
          <q-btn flat no-caps color="grey-7" label="Cancelar" @click="showSignModal = false" />
          <q-btn unelevated no-caps color="positive" label="✓ Assinar & Fechar" class="text-weight-bold" @click="handleConfirmReceipt" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<style scoped lang="scss">
.painel-entidade {
  &__container {
    width: 100%;
  }

  &__header {
    border-radius: 16px;
  }
}

.name-line {
  max-width: 150px;
}

.suspended-banner {
  animation: pulse-suspended 2s ease-in-out infinite;
}

@keyframes pulse-suspended {
  50% {
    opacity: 0.75;
  }
}

.empty-state {
  border: 1px dashed rgba(148, 163, 184, 0.6);
  border-radius: 16px;
}

.empty-text {
  max-width: 320px;
}

.item-card {
  border-radius: 16px;
}

.info-box {
  border-radius: 12px;
  background: rgba(148, 163, 184, 0.08);
}

.dialog-card {
  width: 100%;
  max-width: 384px;
  border-radius: 20px;
}

.public-link {
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
}

.esg-box {
  border-radius: 12px;

  &--positive {
    background: rgba(16, 185, 129, 0.1);
  }

  &--blue {
    background: rgba(59, 130, 246, 0.1);
  }

  &--info {
    background: rgba(14, 165, 233, 0.1);
  }
}

.signature-box {
  min-height: 80px;
  justify-content: center;
}

.signature-svg {
  width: 128px;
  height: 40px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.5);
}
</style>