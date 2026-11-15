<script setup>
import { useRouter, useRoute } from "vue-router";
import { IMAGES } from 'src/assets/images'
import { ref, computed, onMounted, watch } from "vue";
import { storeToRefs } from "pinia";
import { useAppStore } from "../stores/estadoApp";
import { armazem } from "../services/armazemServidor";
import PainelEsg from "../components/store/PainelEsg.vue";
import ConsultasDoacaoPainel from "../components/store/ConsultasDoacaoPainel.vue";
import FluxoPedidos from "../components/store/FluxoPedidos.vue";
import CatalogoPublicado from "../components/store/CatalogoPublicado.vue";
import BlocoAssinatura from "../components/store/BlocoAssinatura.vue";
import AssistenteDescarte from "../components/store/AssistenteDescarte.vue";
import ConfiguracaoPrecificacaoDinamica from "../components/store/ConfiguracaoPrecificacaoDinamica.vue";
import ConfiguracaoFrete from "../components/store/ConfiguracaoFrete.vue";
import { prepararImagemQuadrada } from "src/utils/imagens";
import RelatorioMensalView from "../components/RelatorioMensalView.vue";
import ResumoInicioLoja from "../components/store/ResumoInicioLoja.vue";
import MenuLoja from "../components/store/MenuLoja.vue";
import ContadoresLoja from "../components/store/ContadoresLoja.vue";
import AlertasVencimentoLoja from "../components/store/AlertasVencimentoLoja.vue";
import { servicoDoacoes } from "../services/servicoDoacoes";
import { CERTIFICADO_EXEMPLO } from "../utils/assinaturaDigital";
const router = useRouter();
const route = useRoute();
const appStore = useAppStore();
// Botão Início do cabeçalho: volta à primeira aba do painel
watch(() => appStore.inicioSinal, () => {
  currentStoreView.value = "dashboard";
});
const { usuarioAtual, foods, orders, modoEscuro } = storeToRefs(appStore);
const {
  updateFoodItem,
  removeFoodItem,
  setEditingFood,
  updateOrderStatus,
  updateProfile,
  loadOrders,
  triggerNotification,
  logout
} = appStore;
// Ao salvar ou voltar da edição de um item, a página chega com ?aba=published e reabre o catálogo
const ABAS_LOJA = ["dashboard", "donations", "orders", "published", "reports", "pricing", "quality"];
const abaDaRota = () => (ABAS_LOJA.includes(String(route.query.aba)) ? String(route.query.aba) : "dashboard");
const currentStoreView = ref(abaDaRota());
watch(() => route.query.aba, () => {
  if (route.query.aba) currentStoreView.value = abaDaRota();
});
const showStoreSettings = ref(false);
const showDeliveryConfig = ref(false);
const handleSaveDeliveryConfig = async (config) => {
  await updateProfile({ deliveryConfig: config });
};
const showStoreProfileEdit = ref(false);
const handleSavePricingConfig = (config) => {
  if (usuarioAtual.value) {
    const updatedUser = {
      ...usuarioAtual.value,
      configPrecificacaoDinamica: config
    };
    // Fica salvo no perfil da loja, no servidor
    updateProfile(updatedUser);
  }
};
const handleTriggerDisposalFromPricing = (food) => {
  selectedFoodToDispose.value = food;
  initialDisposalType.value = "donation";
  initialDisposalStep.value = 1;
  showDisposalWizard.value = true;
};
const ofertaDoacaoId = ref("");
const handleProceedDonationFromInquiry = (offer) => {
  selectedFoodToDispose.value = {
    id: offer.foodId || `food-${offer.id}`,
    name: offer.foodName,
    description: offer.description || "",
    category: offer.category || "Alimento"
  };
  ofertaDoacaoId.value = offer.id;
  initialDisposalType.value = "donation";
  initialDisposalStep.value = 2;
  showDisposalWizard.value = true;
  triggerNotification(`Carregando dados do termo de doa\xE7\xE3o para ${offer.recipientOrg}...`, "success");
};
// Consulta cancelada ou recusada: abre o assistente no passo 1 para escolher outra entidade
const handleDoarParaOutraEntidade = (offer) => {
  selectedFoodToDispose.value = {
    id: offer.foodId || `food-${offer.id}`,
    name: offer.foodName,
    description: offer.description || "",
    category: offer.category || "Alimento",
    quantity: offer.quantity
  };
  ofertaDoacaoId.value = "";
  initialDisposalType.value = "donation";
  initialDisposalStep.value = 1;
  showDisposalWizard.value = true;
  triggerNotification("Escolha a nova entidade para receber esta doa\xE7\xE3o.", "success");
};
const notificationsEnabled = ref(true);
const toggleNotifications = () => {
  notificationsEnabled.value = !notificationsEnabled.value;
};
const showDisposalWizard = ref(false);
const selectedFoodToDispose = ref(null);
const disposalLogs = ref([]);
const initialDisposalType = ref("donation");
const initialDisposalStep = ref(1);
const showWithdrawChoiceModal = ref(false);
const selectedFoodToWithdraw = ref(null);
const editStoreLogo = ref("");
// Foto da marca: envio de arquivo, remoção e campo opcional de URL
const entradaArquivoLogo = ref(null);
const carregandoLogo = ref(false);
const abrirSeletorLogo = () => entradaArquivoLogo.value?.click();
const aoEscolherLogo = async (evento) => {
  const arquivo = evento.target.files?.[0];
  evento.target.value = "";
  if (!arquivo) return;
  carregandoLogo.value = true;
  try {
    editStoreLogo.value = await prepararImagemQuadrada(arquivo);
    triggerNotification("Foto carregada! Clique em Salvar para aplicar \u00e0 sua loja.", "success");
  } catch (erro) {
    triggerNotification(erro.message, "error");
  } finally {
    carregandoLogo.value = false;
  }
};
const removerFotoMarca = () => {
  editStoreLogo.value = IMAGES.lojaItaipu;
};
// O campo de URL s\u00f3 mostra endere\u00e7os http(s); foto enviada ou modelo n\u00e3o aparecem como texto
const logoComoUrl = computed({
  get: () => (/^https?:\/\//i.test(editStoreLogo.value) ? editStoreLogo.value : ""),
  set: (valor) => {
    editStoreLogo.value = valor;
  }
});
const editStoreName = ref("");
const editStoreEmail = ref("");
const editStoreAddress = ref("");
const signatureType = ref("drawn");
const signatureImage = ref("");
const signatureCertificate = ref("");
const autoSignEnabled = ref(false);
const pfxFileName = ref("");
const pfxPassword = ref("");
const pfxFileData = ref("");
// Registros ESG de doação/descarte: carregados do servidor e salvos nele a cada alteração.
onMounted(() => {
  disposalLogs.value = armazem.colecao("esg_disposal_logs");
});
watch(disposalLogs, (newVal) => {
  armazem.salvarColecao("esg_disposal_logs", newVal);
}, { deep: true });
watch(usuarioAtual, (user) => {
  if (user) {
    editStoreLogo.value = user.urlAvatar || user.avatarUrl || "";
    editStoreName.value = user.name || "Caf\xE9 da Avenida";
    editStoreEmail.value = user.email || "comercial@cafeavenida.com";
    editStoreAddress.value = user.address || "Av. Pinheiro, Centro, 452 - Pinhalzinho/SC";
    signatureType.value = user.signatureType || "drawn";
    signatureImage.value = user.signatureImage || "";
    signatureCertificate.value = user.signatureCertificate || "";
    autoSignEnabled.value = user.autoSignEnabled !== void 0 ? user.autoSignEnabled : false;
    pfxFileName.value = user.pfxFileName || "";
    pfxPassword.value = user.pfxPassword || "";
    pfxFileData.value = user.pfxFileData || "";
  }
}, { immediate: true });
const loggedInStoreId = computed(() => {
  return usuarioAtual.value?.id.replace("user-", "") || "store-1";
});
const storeOrders = computed(() => {
  return orders.value;
});
const showDriverModal = ref(false);
const selectedOrderIdToDispatch = ref(null);
const selectedDriverId = ref("user-driver-1");
const selectedDriverType = ref("internal");
// Entregadores ativos vêm do servidor (GET /entregadores)
const getDriversList = () => armazem.colecao("entregadores").filter((u) => u.role === "driver");
const handleUpdateStatus = (orderId, currentStatus) => {
  if (currentStatus === "preparing") {
    selectedOrderIdToDispatch.value = orderId;
    selectedDriverType.value = "internal";
    const drivers = getDriversList();
    const defaultInternal = drivers.find((u) => u.driverType === "internal") || drivers[0];
    if (defaultInternal) {
      selectedDriverId.value = defaultInternal.id;
    }
    showDriverModal.value = true;
    return;
  }
  let nextStatus = "pending";
  if (currentStatus === "pending") nextStatus = "preparing";
  else if (currentStatus === "delivery") nextStatus = "delivered";
  updateOrderStatus(orderId, nextStatus);
  if (notificationsEnabled.value) {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      gain.gain.setValueAtTime(0.012, audioCtx.currentTime);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } catch {
      // sem ação
    }
  }
};
const handleConfirmDispatch = () => {
  if (!selectedOrderIdToDispatch.value) return;
  let driverId = "";
  let driverName = "";
  let driverType = selectedDriverType.value;
  if (driverType === "internal") {
    const found = getDriversList().find((u) => u.id === selectedDriverId.value);
    if (found) {
      driverId = found.id;
      driverName = found.name;
    } else {
      // Nenhum entregador cadastrado: a própria loja faz a entrega
      driverId = "";
      driverName = "Entregador da loja";
    }
  } else {
    driverId = "";
    driverName = "Compartilhado da Cidade";
  }
  updateOrderStatus(selectedOrderIdToDispatch.value, "delivery", {
    entregadorId: driverId,
    nomeEntregador: driverName,
    tipoEntregador: driverType
  });
  showDriverModal.value = false;
  selectedOrderIdToDispatch.value = null;
  triggerNotification("Pedido despachado! O entregador foi notificado.", "success");
};
const handleRefreshOrdersList = async () => {
  await loadOrders();
  triggerNotification("Os lotes e pedidos em tempo real foram sincronizados!", "success");
};
const handleTriggerAddItem = () => {
  setEditingFood(null);
  router.push({ name: 'AdicionarItemLoja' });
};
const handleEditAction = (food) => {
  setEditingFood(food);
  router.push({ name: 'AdicionarItemLoja' });
};
const handleInactivateAction = async (foodId) => {
  await updateFoodItem(foodId, { status: "inactive" });
};
const handlePublishAction = async (foodId) => {
  await updateFoodItem(foodId, { status: "active" });
};
const handleRemoveAction = async (foodId) => {
  const foodObj = foods.value.find((f) => f.id === foodId);
  if (!foodObj) return;
  selectedFoodToWithdraw.value = foodObj;
  showWithdrawChoiceModal.value = true;
};
const handleSelectWithdrawDestination = (type) => {
  initialDisposalType.value = type;
  initialDisposalStep.value = 2;
  selectedFoodToDispose.value = selectedFoodToWithdraw.value;
  showWithdrawChoiceModal.value = false;
  showDisposalWizard.value = true;
};
const handleDirectDelete = async () => {
  if (selectedFoodToWithdraw.value) {
    await removeFoodItem(selectedFoodToWithdraw.value.id);
  }
  showWithdrawChoiceModal.value = false;
  selectedFoodToWithdraw.value = null;
};
const handlePfxUpload = (event) => {
  const target = event.target;
  if (target.files && target.files[0]) {
    const file = target.files[0];
    pfxFileName.value = file.name;
    const reader = new FileReader();
    reader.onload = (e) => {
      pfxFileData.value = e.target?.result || "";
      signatureCertificate.value = `\u{1F512} Certificado A1 PFX: ${file.name} (Assinatura Digital Ativa)`;
    };
    reader.readAsDataURL(file);
  }
};
// Preenche um certificado digital de demonstração (só texto, sem validade jurídica)
const usarCertificadoExemplo = () => {
  signatureType.value = "digital";
  signatureCertificate.value = CERTIFICADO_EXEMPLO;
  autoSignEnabled.value = true;
};
const handleClearPfx = () => {
  pfxFileName.value = "";
  pfxFileData.value = "";
  pfxPassword.value = "";
  signatureCertificate.value = "";
};
const handleSaveStoreProfileChanges = async (e) => {
  e.preventDefault();
  await updateProfile({
    name: editStoreName.value,
    email: editStoreEmail.value,
    address: editStoreAddress.value,
    urlAvatar: editStoreLogo.value,
    signatureType: signatureType.value,
    signatureImage: signatureImage.value,
    signatureCertificate: signatureCertificate.value,
    autoSignEnabled: autoSignEnabled.value,
    pfxFileName: pfxFileName.value,
    pfxPassword: pfxPassword.value,
    pfxFileData: pfxFileData.value
  });
  showStoreProfileEdit.value = false;
};
const handleCompletedDisposal = async (log) => {
  disposalLogs.value.unshift(log);
  // Só tira do catálogo se o alimento for desta loja. Consultas de exemplo/antigas apontam para
  // alimentos de outros estabelecimentos, e o servidor recusa apagá-los ("pertence a outro estabelecimento").
  const alimento = foods.value.find((f) => f.id === log.foodId);
  const ehDestaLoja = alimento && String(alimento.lojaId) === String(loggedInStoreId.value);
  if (ehDestaLoja) await removeFoodItem(log.foodId);
};
const handleLogout = () => {
  logout();
};
// Selos do menu: pedidos esperando a loja e consultas de doação sem resposta.
const pedidosPendentes = computed(() => storeOrders.value.filter((o) => o.status === "pending").length);
const consultasPendentes = ref(0);
const atualizarConsultasPendentes = () => {
  try {
    consultasPendentes.value = servicoDoacoes.getDonationOffers().filter((o) => o.status === "pending_inquiry").length;
  } catch {
    consultasPendentes.value = 0;
  }
};
onMounted(atualizarConsultasPendentes);
watch(currentStoreView, atualizarConsultasPendentes);
</script>

<template>
  <q-page class="painel-loja">
    <!-- CORE CONTAINER FOR DESKTOP AND MOBILE BORDERS -->
    <div class="painel-container q-pa-md">

      <!-- HEADER: nome da loja e atalhos vivem na barra verde do LayoutPrincipal -->
      <Teleport to="#header-slot-user" defer>
        <q-btn
          id="btn-header-store"
          unelevated
          dense
          no-caps
          rounded
          color="white"
          text-color="primary"
          class="header-user-btn q-px-sm"
          title="Editar Loja"
          @click="showStoreProfileEdit = true"
        >
          <q-avatar size="22px" class="q-mr-xs">
            <img :src="usuarioAtual?.urlAvatar || usuarioAtual?.avatarUrl || IMAGES.lojaItaipu" alt="logo" referrerpolicy="no-referrer" />
          </q-avatar>
          <span class="ellipsis header-user-name">{{ usuarioAtual?.name || 'Estabelecimento' }}</span>
        </q-btn>
      </Teleport>

      <Teleport to="#header-slot-actions" defer>
        <q-btn flat round dense icon="settings" @click="showStoreSettings = true">
          <q-tooltip>Ajustes</q-tooltip>
        </q-btn>
      </Teleport>

      <!-- GENERAL CONTENT VIEW ROUTING WITH VUE EMITS -->
      <main class="painel-main">

        <!-- WARNING BANNER IF SUSPENDED OR COMPLAINTS EXCEEDED -->
        <q-banner
          v-if="usuarioAtual?.isSuspended || (usuarioAtual?.complaintsCount && usuarioAtual.complaintsCount > 5)"
          rounded
          class="bg-negative text-white q-mb-md"
        >
          <template #avatar>
            <q-icon name="warning" color="white" />
          </template>
          <div class="text-subtitle2 text-weight-bolder text-uppercase">
            ESTABELECIMENTO DESVINCULADO
          </div>
          <div class="text-caption q-mt-xs">
            Seu estabelecimento acumulou <strong>{{ usuarioAtual?.complaintsCount || 6 }} reclamações de 1 estrela</strong> (limite máximo: 5).
            Conforme a Lei nº 14.016/2020 e o regulamento de qualidade Save All, seu perfil foi desvinculado por segurança sanitária. Para contestar, fale com o administrador da plataforma.
          </div>
        </q-banner>

        <!-- REPUTATION & QUALITY GOVERNANCE CARD (Rule 5) -->
        <q-card v-if="currentStoreView === 'quality'" flat bordered class="q-mb-md">
          <q-card-section class="q-gutter-y-sm">
            <div class="row items-center justify-between">
              <div class="row items-center q-gutter-x-sm">
                <q-icon name="shield" color="warning" size="18px" />
                <div class="text-subtitle2 text-weight-bold text-uppercase">Governança de Qualidade (Lei 14.016)</div>
              </div>
              <q-badge color="warning" text-color="dark" class="text-weight-bold">
                Regra: Máx. 5 Reclamações
              </q-badge>
            </div>

            <div class="row q-col-gutter-sm">
              <div class="col-6">
                <q-card flat bordered>
                  <q-card-section class="q-pa-sm">
                    <div class="text-caption text-uppercase text-grey-6 text-weight-bold">Média de Avaliação</div>
                    <div class="row items-center q-gutter-x-xs q-mt-xs">
                      <q-icon name="star" color="warning" size="18px" />
                      <span class="text-subtitle2 text-weight-bolder text-warning">
                        {{ usuarioAtual?.rating?.toFixed(1) || '4.9' }} ★
                      </span>
                      <span class="text-caption text-grey-6">
                        ({{ usuarioAtual?.ratingCount || 12 }} avaliações)
                      </span>
                    </div>
                  </q-card-section>
                </q-card>
              </div>

              <div class="col-6">
                <q-card flat bordered>
                  <q-card-section class="q-pa-sm">
                    <div class="text-caption text-uppercase text-grey-6 text-weight-bold">Reclamações 1-Estrela</div>
                    <div class="row items-center q-gutter-x-xs q-mt-xs">
                      <span :class="['text-subtitle2 text-weight-bolder', (usuarioAtual?.complaintsCount || 0) > 3 ? 'text-negative' : 'text-positive']">
                        {{ usuarioAtual?.complaintsCount || 0 }} / 5
                      </span>
                      <span class="text-caption text-grey-6">
                        {{ (usuarioAtual?.complaintsCount || 0) > 5 ? 'EXCEDIDO' : 'Toleradas' }}
                      </span>
                    </div>
                  </q-card-section>
                </q-card>
              </div>
            </div>

            <!-- Progress Bar towards disqualification -->
            <div>
              <div class="row justify-between text-caption text-grey-6">
                <span>Margem de Segurança de Qualidade</span>
                <span>{{ Math.min(100, Math.round(((usuarioAtual?.complaintsCount || 0) / 5) * 100)) }}% do Limite</span>
              </div>
              <q-linear-progress
                rounded
                size="8px"
                class="q-mt-xs"
                :value="Math.min(100, Math.round(((usuarioAtual?.complaintsCount || 0) / 5) * 100)) / 100"
                :color="(usuarioAtual?.complaintsCount || 0) > 5 ? 'negative' : ((usuarioAtual?.complaintsCount || 0) > 3 ? 'warning' : 'positive')"
              />
            </div>

          </q-card-section>
        </q-card>

        <!-- Início: resumo com mini gráficos -->
        <div v-if="currentStoreView === 'dashboard'" class="column q-gutter-y-md">
          <!-- Contadores: pedidos novos, em andamento, concluídos e itens no catálogo -->
          <ContadoresLoja
            :orders="storeOrders"
            :foods="foods"
            :lojaId="loggedInStoreId"
            :modoEscuro="modoEscuro"
            @abrir="(destino) => (currentStoreView = destino)"
          />

          <!-- Ações rápidas -->
          <div class="row q-col-gutter-sm">
            <div class="col-6">
              <q-btn
                id="btn-store-add-food-quick"
                class="full-width text-weight-bold"
                color="primary"
                unelevated
                no-caps
                icon="add_circle"
                label="Novo Item"
                @click="handleTriggerAddItem"
              />
            </div>
            <div class="col-6">
              <q-btn
                class="full-width text-weight-bold"
                outline
                no-caps
                color="grey-7"
                icon="sync"
                label="Sincronizar Lotes"
                @click="handleRefreshOrdersList"
              />
            </div>
          </div>

          <!-- Resumo e alertas lado a lado no computador, empilhados no celular -->
          <div class="inicio-grid">
            <ResumoInicioLoja :orders="storeOrders" :disposals="disposalLogs" :modoEscuro="modoEscuro" />

            <!-- Itens perto do vencimento (saem primeiro para os clientes) -->
            <AlertasVencimentoLoja
              :foods="foods"
              :lojaId="loggedInStoreId"
              :modoEscuro="modoEscuro"
              @edit-item="handleEditAction"
              @destinar-item="handleTriggerDisposalFromPricing"
            />
          </div>
        </div>

        <!-- Doações: consultas às entidades (App + WhatsApp) -->
        <ConsultasDoacaoPainel
          v-else-if="currentStoreView === 'donations'"
          :modoEscuro="modoEscuro"
          @proceed-donation="handleProceedDonationFromInquiry"
          @doar-outra-entidade="handleDoarParaOutraEntidade"
        />

        <!-- View 2: Orders Processors (Pipeline) -->
        <FluxoPedidos
          v-else-if="currentStoreView === 'orders'"
          :modoEscuro="modoEscuro"
          :storeOrders="storeOrders"
          @update-status="handleUpdateStatus"
          @refresh-orders="handleRefreshOrdersList"
        />

        <!-- View 3: Catálogo de Itens Ofertados -->
        <CatalogoPublicado
          v-else-if="currentStoreView === 'published'"
          :modoEscuro="modoEscuro"
          :foods="foods"
          :lojaId="loggedInStoreId"
          @add-item-click="handleTriggerAddItem"
          @edit-item="handleEditAction"
          @inactivate-item="handleInactivateAction"
          @publish-item="handlePublishAction"
          @remove-item="handleRemoveAction"
          @destinar-item="handleTriggerDisposalFromPricing"
        />

        <!-- View 5: Relatório único (gráficos no topo, PDF com escolha de meses e categoria) -->
        <div v-else-if="currentStoreView === 'reports'">
          <RelatorioMensalView
            mode="store"
            :storeIdOrName="editStoreName || usuarioAtual?.name || ''"
            :modoEscuro="modoEscuro"
          >
            <template #graficos>
              <PainelEsg
                :modoEscuro="modoEscuro"
                :disposals="disposalLogs"
                parte="graficos"
              />
            </template>
            <template #rodape>
              <q-expansion-item
                dense
                expand-separator
                icon="workspace_premium"
                :label="`Certificados emitidos (${disposalLogs.length})`"
                header-class="text-weight-bold"
              >
                <PainelEsg
                  :modoEscuro="modoEscuro"
                  :disposals="disposalLogs"
                  parte="certificados"
                />
              </q-expansion-item>
            </template>
          </RelatorioMensalView>
        </div>

        <!-- View 6: Dynamic Pricing by Shelf Life (Rule 7.3) -->
        <ConfiguracaoPrecificacaoDinamica
          v-else-if="currentStoreView === 'pricing'"
          :modoEscuro="modoEscuro"
          :foods="foods"
          :lojaId="loggedInStoreId"
          :initialConfig="usuarioAtual?.configPrecificacaoDinamica"
          @save-config="handleSavePricingConfig"
          @trigger-disposal="handleTriggerDisposalFromPricing"
          @notification="(msg, type) => triggerNotification(msg, type)"
        />

      </main>

      <!-- MENU INFERIOR (formato padrão dos perfis, botões próprios da loja) -->
      <MenuLoja
        v-model="currentStoreView"
        :pedidos-pendentes="pedidosPendentes"
        :consultas-pendentes="consultasPendentes"
        @logout="handleLogout"
      />

      <!-- OVERLAYS AND MODALS -->

      <!-- A. EDIT STORE METADATA MODAL -->
      <q-dialog v-model="showStoreProfileEdit">
        <q-card class="dialog-card">
          <!-- Header -->
          <q-card-section class="row items-center justify-between">
            <div class="row items-center q-gutter-x-sm">
              <q-icon name="person" color="secondary" size="24px" />
              <div class="text-subtitle1 text-weight-bold">Editar Loja</div>
            </div>
            <q-btn flat round dense icon="close" color="grey-7" type="button" @click="showStoreProfileEdit = false" />
          </q-card-section>

          <q-separator />

          <!-- Scrollable Profile form -->
          <q-form class="dialog-scroll" @submit="handleSaveStoreProfileChanges">
            <q-card-section class="q-gutter-y-md">
              <!-- Foto da marca do estabelecimento -->
              <div class="q-gutter-y-sm">
                <div class="text-caption text-uppercase text-weight-bolder text-grey-7 label-wide">
                  Logomarca do Estabelecimento
                </div>
                <div class="text-caption text-grey-6">
                  Esta foto aparece ao lado do nome da sua loja para clientes e demais usuários.
                </div>

                <div class="row items-center no-wrap q-gutter-x-md">
                  <q-avatar square size="72px" class="foto-marca-preview">
                    <img :src="editStoreLogo || IMAGES.lojaItaipu" alt="Prévia da logomarca" />
                  </q-avatar>
                  <div class="column q-gutter-y-xs">
                    <q-btn
                      id="btn-enviar-foto-marca"
                      unelevated
                      no-caps
                      dense
                      color="secondary"
                      text-color="dark"
                      icon="add_photo_alternate"
                      label="Enviar foto da marca"
                      class="q-px-md text-weight-bold"
                      :loading="carregandoLogo"
                      type="button"
                      @click="abrirSeletorLogo"
                    />
                    <q-btn
                      id="btn-remover-foto-marca"
                      outline
                      no-caps
                      dense
                      color="grey-7"
                      icon="delete_outline"
                      label="Remover foto"
                      class="q-px-md"
                      type="button"
                      @click="removerFotoMarca"
                    />
                  </div>
                  <input
                    ref="entradaArquivoLogo"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    class="entrada-arquivo-oculta"
                    @change="aoEscolherLogo"
                  />
                </div>
                <div class="text-caption text-grey-6">PNG, JPG ou WEBP, até 5 MB. A imagem é ajustada automaticamente.</div>

                <q-input
                  v-model="logoComoUrl"
                  outlined
                  dense
                  label="Ou informe o endereço (URL) da imagem"
                  :rules="[() => !!editStoreLogo || 'Envie uma foto, escolha um modelo ou informe uma URL']"
                  hide-bottom-space
                />

                <div class="text-caption text-center text-uppercase text-grey-6">Presets Recomendados</div>
                <div class="row justify-center q-gutter-md">
                  <q-avatar
                    v-for="ps in [
                      { name: 'Padaria Clara', url: IMAGES.lojaItaipu },
                      { name: 'Cafeteria Verde', url: IMAGES.avatar10 },
                      { name: 'Confeitaria Zero-Waste', url: IMAGES.lojaBonissima }
                    ]"
                    :key="ps.name"
                    square
                    size="48px"
                    :class="['preset-avatar cursor-pointer', { 'preset-avatar--active': editStoreLogo === ps.url }]"
                    @click="editStoreLogo = ps.url"
                  >
                    <img :src="ps.url" alt="preset" />
                    <q-tooltip>{{ ps.name }}</q-tooltip>
                  </q-avatar>
                </div>
              </div>

              <q-input
                v-model="editStoreName"
                label="Nome Fantasia"
                outlined
                dense
                placeholder="Nome do estabelecimento"
                :rules="[(val) => !!val || 'Campo obrigatório']"
                hide-bottom-space
              />

              <!-- Store Email edit -->
              <q-input
                v-model="editStoreEmail"
                type="email"
                label="Email de Contato"
                outlined
                dense
                placeholder="email@ponto.com"
                :rules="[(val) => !!val || 'Campo obrigatório']"
                hide-bottom-space
              />

              <!-- Store address detail -->
              <q-input
                v-model="editStoreAddress"
                type="textarea"
                rows="2"
                autogrow
                label="Endereço Oficial (Pinhalzinho/SC)"
                outlined
                dense
                placeholder="Ex: Av. Pinade, 125, Centro"
                :rules="[(val) => !!val || 'Campo obrigatório']"
                hide-bottom-space
              />

              <!-- SEÇÃO: ASSINATURA CONFORMIDADE ESG FIXA -->
              <q-card flat bordered>
                <q-card-section class="q-gutter-y-md">
                  <div class="row items-center q-gutter-x-sm">
                    <span>✍️</span>
                    <div class="text-subtitle2 text-weight-bold text-uppercase text-secondary">
                      Assinatura de Ateste ESG Fixa
                    </div>
                  </div>
                  <q-separator />

                  <div>
                    <div class="text-caption text-uppercase text-weight-bolder text-grey-7 q-mb-xs">Formato de Assinatura</div>
                    <q-btn-toggle
                      v-model="signatureType"
                      class="full-width"
                      spread
                      no-caps
                      unelevated
                      toggle-color="secondary"
                      toggle-text-color="dark"
                      color="grey-4"
                      text-color="grey-8"
                      :options="[
                        { label: 'Dedo ou Mouse', value: 'drawn' },
                        { label: 'Certificado/CPF', value: 'digital' }
                      ]"
                    />
                  </div>

                  <!-- A. DRAWN SIGNATURE PAD -->
                  <div v-if="signatureType === 'drawn'" class="q-gutter-y-sm">
                    <BlocoAssinatura
                      :modoEscuro="modoEscuro"
                      label="Desenhe a Assinatura Executiva:"
                      :initialImage="signatureImage"
                      @save="(base64) => signatureImage = base64"
                      @clear="signatureImage = ''"
                    />
                    <div class="text-caption text-grey-6">Esta imagem de assinatura digitalizada será anexada automaticamente aos recibos e relatórios.</div>
                  </div>
                  <div v-else class="q-gutter-y-md">
                    <!-- PFX File Uploader -->
                    <q-card flat bordered class="pfx-box">
                      <q-card-section class="q-gutter-y-sm">
                        <div class="text-caption text-uppercase text-weight-bolder text-grey-7">
                          Anexar Certificado Digital A1 (.PFX)
                        </div>
                        <div v-if="pfxFileName" class="row items-center justify-between no-wrap">
                          <span class="text-caption text-positive ellipsis pfx-name">📋 {{ pfxFileName }}</span>
                          <q-btn flat dense no-caps color="negative" label="Deletar" type="button" @click="handleClearPfx" />
                        </div>
                        <div v-else class="pfx-drop text-center q-pa-md relative-position cursor-pointer">
                          <input
                            type="file"
                            accept=".pfx"
                            class="pfx-input"
                            @change="handlePfxUpload"
                          />
                          <span class="text-caption text-grey-6">Clique para anexar arquivo .pfx</span>
                        </div>

                        <!-- PFX Password -->
                        <q-input
                          v-if="pfxFileName"
                          v-model="pfxPassword"
                          type="password"
                          label="Senha do Certificado"
                          outlined
                          dense
                          placeholder="Senha do .pfx"
                        />
                      </q-card-section>
                    </q-card>

                    <div class="q-gutter-y-xs">
                      <q-input
                        v-model="signatureCertificate"
                        label="Chave do Certificado / Declarado (CPF/CNPJ)"
                        outlined
                        dense
                        placeholder="Ex: Certificado A1: 205.910.103/0001-90"
                      />
                      <div class="text-caption text-grey-6">Utiliza a autenticação digital por texto de conformidade (padrão de boa-fé ambiental e civil).</div>
                      <q-btn
                        flat
                        dense
                        no-caps
                        size="sm"
                        color="grey-7"
                        icon="verified"
                        label="Preencher com certificado de exemplo"
                        type="button"
                        @click="usarCertificadoExemplo"
                      />
                    </div>
                  </div>

                  <!-- AUTOMATION CHECKBOX OPTIONS -->
                  <q-separator />
                  <q-checkbox v-model="autoSignEnabled" color="secondary" dense class="items-start">
                    <div class="q-ml-sm">
                      <div class="text-caption text-weight-bold">Manter ativa para as próximas destinações</div>
                      <div class="text-caption text-grey-6">Assinar automaticamente os relatórios e recibos gerados.</div>
                    </div>
                  </q-checkbox>
                </q-card-section>
              </q-card>

              <!-- Action buttons -->
              <div class="row q-col-gutter-sm">
                <div class="col-6">
                  <q-btn
                    class="full-width"
                    outline
                    no-caps
                    color="grey-7"
                    label="Cancelar"
                    type="button"
                    @click="showStoreProfileEdit = false"
                  />
                </div>
                <div class="col-6">
                  <q-btn
                    class="full-width text-weight-bold"
                    unelevated
                    no-caps
                    color="secondary"
                    text-color="dark"
                    label="Confirmar"
                    type="submit"
                  />
                </div>
              </div>
            </q-card-section>
          </q-form>
        </q-card>
      </q-dialog>

      <!-- C. DRIVER ASSIGNMENT MODAL -->
      <q-dialog v-model="showDriverModal">
        <q-card class="dialog-card">
          <!-- Header -->
          <q-card-section class="row items-center justify-between">
            <div class="row items-center q-gutter-x-sm">
              <q-icon name="local_shipping" color="secondary" size="24px" />
              <div class="text-subtitle1 text-weight-bold">Despachar Pedido #{{ selectedOrderIdToDispatch?.replace('order-', '') }}</div>
            </div>
            <q-btn flat round dense icon="close" color="grey-7" type="button" @click="showDriverModal = false" />
          </q-card-section>

          <q-separator />

          <!-- Content -->
          <q-card-section class="q-gutter-y-md">
            <div class="text-caption text-grey-7">
              Escolha o modelo de entrega para este pedido. Você pode usar um entregador contratado próprio ou a rede de entregas compartilhadas da cidade.
            </div>

            <!-- Delivery Model Selection -->
            <div>
              <div class="text-caption text-uppercase text-weight-bold text-grey-7 q-mb-xs">Modelo de Entrega</div>
              <q-btn-toggle
                v-model="selectedDriverType"
                class="full-width"
                spread
                no-caps
                unelevated
                toggle-color="secondary"
                toggle-text-color="dark"
                color="grey-4"
                text-color="grey-8"
                :options="[
                  { label: '🛵 Próprio', value: 'internal' },
                  { label: '🏢 Compartilhado', value: 'shared' }
                ]"
              />
            </div>

            <!-- Driver Dropdown (if Internal/Contracted is selected) -->
            <q-select
              v-if="selectedDriverType === 'internal'"
              v-model="selectedDriverId"
              label="Selecione o Entregador da Loja"
              outlined
              dense
              emit-value
              map-options
              :options="[
                { label: 'Marcos Entregador (Próprio) - Ativo', value: 'user-driver-1' },
                ...getDriversList()
                  .filter((u) => u.id !== 'user-driver-1' && u.driverType === 'internal')
                  .map((d) => ({ label: d.name, value: d.id }))
              ]"
            />

            <q-banner v-else rounded class="bg-indigo-1 text-indigo-9">
              <div class="text-caption text-weight-bold text-uppercase">Fila Compartilhada por Cidade</div>
              <div class="text-caption">
                O pedido será publicado no painel de entregadores compartilhados da cidade. Qualquer motoboy credenciado poderá aceitar a rota no painel dele.
              </div>
            </q-banner>

            <!-- Action buttons -->
            <div class="row q-col-gutter-sm">
              <div class="col-6">
                <q-btn class="full-width" outline no-caps color="grey-7" label="Cancelar" @click="showDriverModal = false" />
              </div>
              <div class="col-6">
                <q-btn
                  class="full-width text-weight-bold"
                  unelevated
                  no-caps
                  color="secondary"
                  text-color="dark"
                  label="Confirmar Envio"
                  @click="handleConfirmDispatch"
                />
              </div>
            </div>
          </q-card-section>
        </q-card>
      </q-dialog>

      <!-- B. GENERAL SETTINGS PANEL MODAL -->
      <q-dialog v-model="showStoreSettings">
        <q-card class="dialog-card">
          <!-- Header -->
          <q-card-section class="row items-center justify-between">
            <div class="row items-center q-gutter-x-sm">
              <q-icon name="settings" color="secondary" size="24px" />
              <div class="text-subtitle1 text-weight-bold">Configurações</div>
            </div>
            <q-btn flat round dense icon="close" color="grey-7" type="button" @click="showStoreSettings = false" />
          </q-card-section>

          <q-separator />

          <!-- Options panel content -->
          <q-card-section class="q-gutter-y-md">
            <!-- Option 2: Alerts sound toggler -->
            <div class="row items-center justify-between no-wrap">
              <div>
                <div class="text-subtitle2 text-weight-bold text-uppercase">Notificações por Som</div>
                <div class="text-caption text-grey-6">Sinalizadores auditivos ao avançar lotes</div>
              </div>
              <q-toggle color="secondary" :model-value="notificationsEnabled" @update:model-value="toggleNotifications" />
            </div>

            <q-separator />

            <!-- Option 4: Delivery fees by neighborhood / CEP -->
            <div class="q-gutter-y-sm">
              <div>
                <div class="text-subtitle2 text-weight-bold text-uppercase text-warning">Taxas de Entrega</div>
                <div class="text-caption text-grey-6">
                  Defina o frete por bairro ou por CEP.
                  <span v-if="usuarioAtual?.deliveryConfig?.zones?.length">
                    ({{ usuarioAtual.deliveryConfig.zones.length }} região(ões) cadastrada(s))
                  </span>
                </div>
              </div>

              <q-btn
                id="btn-open-delivery-config"
                outline
                no-caps
                color="positive"
                class="full-width text-weight-bold"
                align="between"
                label="Configurar Taxas de Entrega"
                icon="local_shipping"
                icon-right="chevron_right"
                type="button"
                @click="showDeliveryConfig = true; showStoreSettings = false;"
              />
            </div>

            <q-btn
              class="full-width text-weight-bold"
              unelevated
              no-caps
              color="secondary"
              text-color="dark"
              label="Confirmar Configurações"
              type="button"
              @click="showStoreSettings = false"
            />
          </q-card-section>
        </q-card>
      </q-dialog>

      <ConfiguracaoFrete
        v-model="showDeliveryConfig"
        :config="usuarioAtual?.deliveryConfig"
        @save="handleSaveDeliveryConfig"
      />

      <!-- C. DISPOSAL FLOW COMPLIANCE WIZARD MODAL -->
      <AssistenteDescarte
        v-if="showDisposalWizard"
        :modoEscuro="modoEscuro"
        :foodToDispose="selectedFoodToDispose"
        :initialType="initialDisposalType"
        :initialStep="initialDisposalStep"
        :ofertaId="ofertaDoacaoId"
        @close="showDisposalWizard = false; selectedFoodToDispose = null; ofertaDoacaoId = '';"
        @completed="handleCompletedDisposal"
      />

      <!-- D. CUSTOM WITHDRAW DESTINATION CHOICE MODAL -->
      <q-dialog v-model="showWithdrawChoiceModal">
        <q-card class="dialog-card">
          <!-- Modal Header -->
          <q-card-section class="row items-center justify-between">
            <div class="row items-center q-gutter-x-sm">
              <q-icon name="delete" color="secondary" size="20px" />
              <div class="text-subtitle2 text-weight-bold text-uppercase">Retirar do Catálogo</div>
            </div>
            <q-btn
              flat
              round
              dense
              icon="close"
              color="grey-7"
              type="button"
              @click="showWithdrawChoiceModal = false; selectedFoodToWithdraw = null;"
            />
          </q-card-section>

          <q-separator />

          <!-- Content -->
          <q-card-section class="q-gutter-y-md">
            <q-banner rounded class="bg-amber-1 text-grey-9">
              <div class="text-caption text-uppercase text-weight-bolder text-warning">Item Selecionado</div>
              <div class="text-subtitle2 text-weight-bold">{{ selectedFoodToWithdraw?.name }}</div>
              <div class="text-caption text-grey-7">Como você deseja destinar este excedente?</div>
            </q-banner>

            <!-- Option 1: Doação -->
            <q-item clickable v-ripple class="withdraw-option rounded-borders" @click="handleSelectWithdrawDestination('donation')">
              <q-item-section avatar>
                <q-avatar color="info" text-color="white" icon="favorite" size="40px" />
              </q-item-section>
              <q-item-section>
                <q-item-label class="text-weight-bold">Enviar para Doação (ONG)</q-item-label>
                <q-item-label caption>Encaminhar kits para entidades sob isenção da Lei Federal 14.016/2020.</q-item-label>
              </q-item-section>
            </q-item>

            <!-- Option 2: Descarte -->
            <q-item clickable v-ripple class="withdraw-option rounded-borders" @click="handleSelectWithdrawDestination('discard')">
              <q-item-section avatar>
                <q-avatar color="secondary" text-color="white" icon="delete" size="40px" />
              </q-item-section>
              <q-item-section>
                <q-item-label class="text-weight-bold">Descarte Ecológico (ODS)</q-item-label>
                <q-item-label caption>Encaminhar para compostagem ou ração animal. Atende metas climáticas ODS.</q-item-label>
              </q-item-section>
            </q-item>

            <!-- Option 3: Excluir Permanentemente -->
            <q-btn
              class="full-width"
              outline
              no-caps
              color="negative"
              label="Apenas Excluir Sem Registrar ESG"
              type="button"
              @click="handleDirectDelete"
            />
          </q-card-section>
        </q-card>
      </q-dialog>

    </div>
  </q-page>
</template>

<style scoped lang="scss">
.painel-container {
  width: 100%;
}
.painel-main {
  padding-bottom: 110px;
}
.inicio-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  align-items: start;
}
@media (min-width: 1000px) {
  .inicio-grid {
    grid-template-columns: 1fr 1fr;
  }
}
.header-user-btn { max-width: 200px; font-weight: 600; }
.header-user-name { max-width: 140px; }
@media (max-width: 599px) {
  .header-user-name { display: none; }
  .header-user-btn { padding: 0 4px !important; }
}
.label-wide {
  letter-spacing: 0.1em;
}
.store-title {
  max-width: 170px;
}
.logo-avatar {
  border-radius: 12px;
  border: 1px solid rgba(128, 128, 128, 0.3);
  img {
    object-fit: cover;
  }
}
.dialog-card {
  width: 400px;
  max-width: 92vw;
  border-radius: 24px;
}
.dialog-scroll {
  max-height: 70vh;
  overflow-y: auto;
}
.preset-avatar {
  border-radius: 12px;
  border: 2px solid rgba(128, 128, 128, 0.3);
  img {
    object-fit: cover;
  }
  &--active {
    border-color: var(--q-secondary);
  }
}
.pfx-box {
  border-style: dashed;
}
.pfx-name {
  max-width: 180px;
}
.pfx-drop {
  border: 2px dashed rgba(128, 128, 128, 0.4);
  border-radius: 12px;
  &:hover {
    border-color: var(--q-secondary);
  }
}
.pfx-input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}
.withdraw-option {
  border: 1px solid rgba(128, 128, 128, 0.3);
}

.entrada-arquivo-oculta {
  display: none;
}

.foto-marca-preview {
  border: 1px solid rgba(128, 128, 128, 0.35);
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
  flex: none;
}
</style>