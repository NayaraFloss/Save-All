<script setup>
import { ref, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { servicoDoacoes } from "../services/servicoDoacoes";
import { armazem } from "../services/armazemServidor";
import { storeToRefs } from "pinia";
import { useAppStore } from "../stores/estadoApp";
import BlocoAssinatura from "../components/store/BlocoAssinatura.vue";
const route = useRoute();
const router = useRouter();
const appStore = useAppStore();
const { modoEscuro } = storeToRefs(appStore);
const { alternarModoEscuro, triggerNotification } = appStore;
const offerId = ref("");
const offer = ref(null);
const loading = ref(true);
const notFound = ref(false);
const responseChoice = ref("accept");
const confirmedByName = ref("");
const recipientCpf = ref("");
const pickupTime = ref("");
const responseNotes = ref("");
const rejectionReason = ref("Capacidade m\xE1xima de armazenamento atingida hoje");
const legalConsentAccepted = ref(true);
const signatureImage = ref("");
const hasSignature = ref(false);
const isSubmitting = ref(false);
const submittedSuccess = ref(false);
const statusCardClass = () => {
  const status = offer.value?.status;
  if (status === "accepted") return modoEscuro.value ? "bg-green-10" : "bg-green-1";
  if (status === "rejected" || status === "cancelada") return modoEscuro.value ? "bg-red-10" : "bg-red-1";
  return "";
};
const handleSignatureSave = (base64) => {
  signatureImage.value = base64;
  hasSignature.value = !!base64;
};
const handleSignatureClear = () => {
  signatureImage.value = "";
  hasSignature.value = false;
};
const loadOffer = async () => {
  loading.value = true;
  notFound.value = false;
  const id = route.query.id || route.query.token || "";
  offerId.value = id;
  if (!id) {
    const all = servicoDoacoes.getDonationOffers();
    if (all.length > 0) {
      offer.value = all[0];
      offerId.value = all[0].id;
    } else {
      notFound.value = true;
    }
    loading.value = false;
    return;
  }
  // A entidade abre o link sem login: a consulta vem da rota pública pelo token do link.
  const found = servicoDoacoes.getDonationOfferById(id) || await armazem.buscarOfertaPublica(id);
  if (found) {
    offer.value = found;
    confirmedByName.value = found.confirmedBy || (found.recipientOrg ? `Respons\xE1vel (${found.recipientOrg})` : "");
    recipientCpf.value = found.signatureCpf || "";
    pickupTime.value = found.pickupEstimatedTime || "17:00";
    responseNotes.value = found.responseNote || "";
    if (found.signatureImage) {
      signatureImage.value = found.signatureImage;
      hasSignature.value = true;
    }
  } else {
    notFound.value = true;
  }
  loading.value = false;
};
onMounted(() => {
  loadOffer();
});
const presetRejectionReasons = [
  "Capacidade m\xE1xima de armazenamento/refrigera\xE7\xE3o atingida hoje",
  "Equipe de log\xEDstica/coleta indispon\xEDvel no hor\xE1rio sugerido",
  "Estoque suficiente do tipo de alimento no momento",
  "Fora da rota de atendimento priorit\xE1rio hoje",
  "Outro motivo operacional"
];
const handleDownloadPdf = () => {
  if (!offer.value) return;
  servicoDoacoes.downloadDonationPdf(offer.value);
  triggerNotification("Termo de Doa\xE7\xE3o (PDF) baixado com sucesso!", "success");
};
const handleSubmitResponse = async (status) => {
  if (!offer.value) return;
  if (status === "accepted") {
    if (!confirmedByName.value.trim()) {
      triggerNotification("Por favor, informe o nome do respons\xE1vel pelo recebimento.", "error");
      return;
    }
    if (!legalConsentAccepted.value) {
      triggerNotification("Por favor, aceite os termos legais de recebimento.", "warning");
      return;
    }
  }
  isSubmitting.value = true;
  try {
    const updated = await servicoDoacoes.updateDonationResponse(offer.value.token || offer.value.id, {
      status,
      confirmedBy: confirmedByName.value.trim() || void 0,
      pickupEstimatedTime: pickupTime.value || void 0,
      responseNote: responseNotes.value.trim() || void 0,
      rejectionReason: status === "rejected" ? rejectionReason.value : void 0,
      signatureImage: status === "accepted" ? signatureImage.value || void 0 : void 0,
      signatureCpf: status === "accepted" ? recipientCpf.value.trim() || void 0 : void 0
    });
    offer.value = updated;
    submittedSuccess.value = true;
    if (status === "accepted") {
      triggerNotification("Doa\xE7\xE3o confirmada e assinada com sucesso! O estabelecimento foi notificado.", "success");
    } else {
      triggerNotification("Resposta enviada ao estabelecimento informando a indisponibilidade.", "warning");
    }
  } catch (err) {
    triggerNotification(err.message || "Erro ao registrar resposta.", "error");
  } finally {
    isSubmitting.value = false;
  }
};
</script>

<template>
  <q-page :class="['confirmar-page column justify-between', { 'bg-dark text-white': modoEscuro, 'bg-grey-2': !modoEscuro }]">
    <!-- Barra superior -->
    <q-toolbar :class="['top-bar', modoEscuro ? 'bg-dark' : 'bg-white']">
      <div class="page-container row items-center justify-between full-width q-px-md">
        <div class="row items-center no-wrap q-gutter-x-sm">
          <q-avatar square size="36px" class="logo-box bg-green-1 text-positive">
            <q-icon name="favorite" size="20px" />
          </q-avatar>
          <div>
            <div class="row items-center q-gutter-x-xs text-subtitle2 text-weight-bold">
              <span>Save All</span>
              <q-badge color="positive" class="text-weight-bold text-uppercase mono">Portal Seguro</q-badge>
            </div>
            <div class="text-caption text-grey-6">
              Confirmação de Doação &amp; Assinatura Digital (Lei 14.016/2020)
            </div>
          </div>
        </div>

        <div class="row items-center q-gutter-x-sm">
          <q-btn
            flat
            round
            dense
            :color="modoEscuro ? 'amber' : 'grey-7'"
            :icon="modoEscuro ? 'light_mode' : 'dark_mode'"
            @click="alternarModoEscuro"
          >
            <q-tooltip>Alternar tema</q-tooltip>
          </q-btn>
          <q-btn
            outline
            dense
            no-caps
            :color="modoEscuro ? 'grey-5' : 'grey-8'"
            icon="arrow_back"
            label="Início"
            class="text-weight-bold"
            @click="router.push('/')"
          />
        </div>
      </div>
    </q-toolbar>

    <!-- Conteúdo principal -->
    <div class="page-container full-width q-mx-auto q-pa-md col">
      <!-- Carregando -->
      <div v-if="loading" class="column items-center text-center q-py-xl q-gutter-y-sm">
        <q-spinner color="positive" size="40px" :thickness="4" />
        <div class="text-caption text-grey-6 mono">Carregando dados da doação...</div>
      </div>

      <!-- Não encontrada -->
      <q-card v-else-if="notFound || !offer" flat bordered :dark="modoEscuro" class="dashed-card">
        <q-card-section class="column items-center text-center q-pa-xl q-gutter-y-sm">
          <q-icon name="error_outline" size="48px" color="warning" />
          <div class="text-subtitle1 text-weight-bold">Oferta de Doação Não Encontrada</div>
          <div class="text-caption text-grey-6 not-found-text">
            O link de confirmação informado é inválido, expirou ou a doação já foi finalizada.
          </div>
          <q-btn
            unelevated
            no-caps
            color="positive"
            label="Voltar ao Início"
            class="text-weight-bold q-mt-md"
            @click="router.push('/')"
          />
        </q-card-section>
      </q-card>

      <!-- Conteúdo da oferta -->
      <div v-else class="column q-gutter-y-md">
        <!-- Cartão de status -->
        <q-card flat bordered :dark="modoEscuro" :class="statusCardClass()">
          <q-card-section>
            <div class="row items-start justify-between no-wrap q-gutter-x-sm">
              <div class="col">
                <q-badge
                  rounded
                  class="text-weight-bold text-uppercase mono q-mb-sm q-pa-xs q-px-sm"
                  :color="['accepted', 'entregue', 'completed'].includes(offer.status) ? 'positive' : ['rejected', 'cancelada'].includes(offer.status) ? 'negative' : 'warning'"
                  :text-color="offer.status === 'pending_inquiry' ? 'dark' : 'white'"
                >
                  <q-icon
                    :name="offer.status === 'pending_inquiry' ? 'schedule' : ['accepted', 'entregue', 'completed'].includes(offer.status) ? 'check_circle' : 'cancel'"
                    size="14px"
                    class="q-mr-xs"
                  />
                  <span>
                    {{
                      offer.status === 'pending_inquiry' ? 'Aguardando Confirmação da Entidade' :
                      offer.status === 'accepted' ? 'Doação Confirmada & Assinada Digitalmente' :
                      offer.status === 'rejected' ? 'Doação Recusada (Indisponibilidade)' :
                      offer.status === 'cancelada' ? 'Consulta Cancelada pela Loja' :
                      offer.status === 'entregue' ? 'Doação Entregue' :
                      'Doação Finalizada'
                    }}
                  </span>
                </q-badge>

                <div class="text-h6 text-weight-bold">
                  Consulta de Disponibilidade para Doação
                </div>
                <div class="text-caption text-grey-6 q-mt-xs">
                  Destinada à entidade social:
                  <strong :class="modoEscuro ? 'text-green-4' : 'text-green-9'">{{ offer.recipientOrg }}</strong>
                </div>
              </div>

              <div class="text-right">
                <div class="text-caption text-grey-6 mono">Código #{{ offer.id }}</div>
                <div class="text-caption text-grey-6">{{ new Date(offer.criadoEm).toLocaleDateString('pt-BR') }}</div>
              </div>
            </div>

            <!-- Informações de resposta já registrada -->
            <div v-if="offer.status !== 'pending_inquiry'" class="response-info q-mt-md q-pt-sm column q-gutter-y-sm">
              <div v-if="['accepted', 'entregue', 'completed'].includes(offer.status)" class="column q-gutter-y-sm">
                <div class="row items-center q-gutter-x-xs text-positive text-weight-medium">
                  <q-icon name="check" size="18px" />
                  <span>
                    Confirmado e atestado por <strong>{{ offer.confirmedBy }}</strong>
                    <span v-if="offer.pickupEstimatedTime"> • Coleta prevista às {{ offer.pickupEstimatedTime }}</span>
                  </span>
                </div>

                <q-card v-if="offer.signatureImage" flat bordered :dark="modoEscuro" class="signature-card">
                  <q-card-section class="row items-center justify-between no-wrap q-pa-sm">
                    <div>
                      <div class="text-caption text-grey-6 text-uppercase mono">Assinatura Digital Gravada:</div>
                      <img :src="offer.signatureImage" alt="Assinatura" class="signature-img q-mt-xs" :class="{ 'signature-invert': modoEscuro }" />
                    </div>
                    <div class="text-right">
                      <div class="text-caption text-positive mono">Chave SHA-256:</div>
                      <div class="text-caption text-grey-6 mono ellipsis hash-text">
                        {{ offer.signatureHash || 'Validação Digital Ativa' }}
                      </div>
                    </div>
                  </q-card-section>
                </q-card>

                <div>
                  <q-btn
                    type="button"
                    unelevated
                    no-caps
                    color="positive"
                    icon="download"
                    label="Baixar Termo de Doação Assinado (PDF)"
                    class="text-weight-bold"
                    @click="handleDownloadPdf"
                  />
                </div>
              </div>

              <div v-if="offer.responseNote" class="text-caption text-grey-6 text-italic">
                "{{ offer.responseNote }}"
              </div>
              <div v-if="offer.status === 'cancelada'" class="row items-center q-gutter-x-xs text-negative text-weight-medium">
                <q-icon name="block" size="18px" />
                <span>A loja cancelou esta consulta: {{ offer.motivoCancelamento || 'o alimento será oferecido a outra entidade' }}.</span>
              </div>
              <div v-if="offer.status === 'rejected'" class="row items-center q-gutter-x-xs text-negative text-weight-medium">
                <q-icon name="close" size="18px" />
                <span>Motivo informado: {{ offer.rejectionReason || 'Indisponibilidade operacional' }}</span>
              </div>
            </div>
          </q-card-section>
        </q-card>

        <!-- Estabelecimento e alimentos -->
        <div class="row q-col-gutter-md">
          <div class="col-12 col-sm-6">
            <q-card flat bordered :dark="modoEscuro" class="full-height">
              <q-card-section class="row items-center q-gutter-x-sm q-py-sm">
                <q-icon name="storefront" size="20px" color="positive" />
                <div class="text-caption text-weight-bold text-uppercase">Estabelecimento Doador</div>
              </q-card-section>
              <q-separator :dark="modoEscuro" />
              <q-card-section class="column q-gutter-y-xs">
                <div class="text-subtitle2 text-weight-bold">{{ offer.nomeLoja }}</div>
                <div v-if="offer.storeCnpj" class="text-caption text-grey-6 mono">CNPJ: {{ offer.storeCnpj }}</div>
                <div v-if="offer.storeAddress" class="row items-start no-wrap q-gutter-x-xs text-caption">
                  <q-icon name="place" size="16px" color="positive" />
                  <span>{{ offer.storeAddress }}</span>
                </div>
                <div v-if="offer.storePhone" class="text-caption text-grey-6">Contato: {{ offer.storePhone }}</div>
              </q-card-section>
            </q-card>
          </div>

          <div class="col-12 col-sm-6">
            <q-card flat bordered :dark="modoEscuro" class="full-height">
              <q-card-section class="row items-center q-gutter-x-sm q-py-sm">
                <q-icon name="scale" size="20px" color="warning" />
                <div class="text-caption text-weight-bold text-uppercase">Alimentos Ofertados</div>
              </q-card-section>
              <q-separator :dark="modoEscuro" />
              <q-card-section class="column q-gutter-y-xs">
                <div class="row items-start justify-between no-wrap">
                  <div class="text-subtitle2 text-weight-bold text-positive">{{ offer.foodName }}</div>
                  <q-badge color="positive" outline class="text-weight-bold mono">
                    {{ offer.weightEstimatedKg }} kg
                  </q-badge>
                </div>
                <div class="row items-center q-gutter-x-sm text-caption text-grey-6">
                  <span>Categoria: <b>{{ offer.category }}</b></span>
                  <span>•</span>
                  <span>Qtd: <b>{{ offer.quantity }} un</b></span>
                </div>
                <div class="text-caption text-italic">{{ offer.description }}</div>
                <div v-if="offer.dataValidade" class="row items-center q-gutter-x-xs text-caption text-warning mono">
                  <q-icon name="event" size="14px" />
                  <span>Validade/Consumo: {{ new Date(offer.dataValidade).toLocaleDateString('pt-BR') }}</span>
                </div>
              </q-card-section>
            </q-card>
          </div>
        </div>

        <!-- Nota de conformidade -->
        <q-banner rounded :class="modoEscuro ? 'bg-green-10 text-white' : 'bg-green-1 text-grey-9'">
          <template #avatar>
            <q-icon name="verified_user" color="positive" />
          </template>
          <div class="text-caption">
            <strong class="text-positive text-uppercase block">Segurança Jurídica — Lei Federal nº 14.016/2020:</strong>
            A doação de excedentes de alimentos de supermercados, restaurantes e padarias é expressamente autorizada por lei e isenta o doador de responsabilidades civis e administrativas desde que entregue em condições adequadas de consumo e sem dolo.
          </div>
        </q-banner>

        <!-- Resposta e assinatura -->
        <q-card v-if="offer.status === 'pending_inquiry' || submittedSuccess" flat bordered :dark="modoEscuro">
          <q-card-section>
            <div class="text-subtitle2 text-weight-bold text-uppercase">
              {{ submittedSuccess ? 'Resposta e Assinatura Registradas!' : 'Confirmação e Assinatura da Doação' }}
            </div>
            <div class="text-caption text-grey-6">
              Sua resposta e assinatura digital serão gravadas e disponibilizadas imediatamente ao estabelecimento.
            </div>
          </q-card-section>

          <q-separator :dark="modoEscuro" />

          <!-- Sucesso após envio -->
          <q-card-section v-if="submittedSuccess" class="column items-center text-center q-py-lg q-gutter-y-sm">
            <q-avatar size="56px" color="green-1" text-color="positive">
              <q-icon name="check_circle" size="32px" />
            </q-avatar>
            <div class="text-subtitle1 text-weight-bold">
              {{ offer.status === 'accepted' ? 'Doação Confirmada & Assinada com Sucesso!' : 'Indisponibilidade Registrada' }}
            </div>
            <div class="text-caption text-grey-6 not-found-text">
              {{ offer.status === 'accepted'
                ? `O estabelecimento ${offer.nomeLoja} foi avisado em tempo real e já está separando o lote com o comprovante assinado.`
                : `O estabelecimento ${offer.nomeLoja} foi notificado para redirecionar o alimento para outra entidade ou destinação ecológica.`
              }}
            </div>

            <div v-if="offer.status === 'accepted'" class="row items-center justify-center q-gutter-sm q-pt-sm">
              <q-btn
                type="button"
                unelevated
                no-caps
                color="positive"
                icon="download"
                label="Baixar Termo Assinado (PDF)"
                class="text-weight-bold"
                @click="handleDownloadPdf"
              />
              <q-btn
                type="button"
                flat
                no-caps
                color="grey-6"
                label="Alterar dados"
                @click="submittedSuccess = false"
              />
            </div>
          </q-card-section>

          <!-- Formulário -->
          <q-card-section v-else class="column q-gutter-y-md">
            <!-- Escolha -->
            <div class="row q-col-gutter-sm">
              <div class="col-6">
                <q-btn
                  type="button"
                  no-caps
                  align="left"
                  class="full-width choice-btn"
                  :outline="responseChoice !== 'accept'"
                  :unelevated="responseChoice === 'accept'"
                  :color="responseChoice === 'accept' ? 'positive' : 'grey-6'"
                  icon="check"
                  @click="responseChoice = 'accept'"
                >
                  <div class="q-ml-sm text-left">
                    <div class="text-caption text-weight-bold text-uppercase">Sim, Aceitar Doação</div>
                    <div class="text-caption choice-sub">Confirmar e assinar</div>
                  </div>
                </q-btn>
              </div>
              <div class="col-6">
                <q-btn
                  type="button"
                  no-caps
                  align="left"
                  class="full-width choice-btn"
                  :outline="responseChoice !== 'reject'"
                  :unelevated="responseChoice === 'reject'"
                  :color="responseChoice === 'reject' ? 'negative' : 'grey-6'"
                  icon="close"
                  @click="responseChoice = 'reject'"
                >
                  <div class="q-ml-sm text-left">
                    <div class="text-caption text-weight-bold text-uppercase">Não Podemos Hoje</div>
                    <div class="text-caption choice-sub">Indisponibilidade</div>
                  </div>
                </q-btn>
              </div>
            </div>

            <!-- Campos: aceitar com assinatura -->
            <div v-if="responseChoice === 'accept'" class="column q-gutter-y-md">
              <div class="row q-col-gutter-sm">
                <div class="col-12 col-sm-6">
                  <q-input
                    v-model="confirmedByName"
                    outlined
                    dense
                    :dark="modoEscuro"
                    label="Nome do Responsável / Recebedor *"
                    placeholder="Ex: Clara Silva (Coordenadora)"
                  />
                </div>
                <div class="col-12 col-sm-6">
                  <q-input
                    v-model="recipientCpf"
                    outlined
                    dense
                    :dark="modoEscuro"
                    class="mono"
                    label="CPF ou RG do Responsável (Opcional)"
                    placeholder="Ex: 000.000.000-00"
                  />
                </div>
              </div>

              <div class="row q-col-gutter-sm">
                <div class="col-12 col-sm-6">
                  <q-input
                    v-model="pickupTime"
                    outlined
                    dense
                    :dark="modoEscuro"
                    class="mono"
                    label="Horário Estimado para Retirada"
                    placeholder="Ex: Hoje às 17:30"
                  />
                </div>
                <div class="col-12 col-sm-6">
                  <q-input
                    outlined
                    dense
                    :dark="modoEscuro"
                    label="Observações de Transporte"
                    placeholder="Ex: Carro com caixa térmica"
                  />
                </div>
              </div>

              <!-- Quadro de assinatura -->
              <div class="column q-gutter-y-xs">
                <div class="row items-center justify-between">
                  <div class="row items-center q-gutter-x-xs text-caption text-weight-bold text-uppercase text-grey-6">
                    <q-icon name="draw" size="16px" color="positive" />
                    <span>Assine Digitalmente no Quadro Abaixo (Dedo ou Mouse)</span>
                  </div>
                  <div class="row items-center q-gutter-x-xs text-caption text-positive mono">
                    <q-icon name="fingerprint" size="14px" />
                    <span>Validação Lei 14.016</span>
                  </div>
                </div>

                <q-card flat bordered :dark="modoEscuro" class="q-pa-sm">
                  <BlocoAssinatura
                    :dark-mode="modoEscuro"
                    label="Assine com o dedo ou mouse"
                    :initial-image="signatureImage"
                    @save="handleSignatureSave"
                    @clear="handleSignatureClear"
                  />
                </q-card>
              </div>

              <!-- Consentimento legal -->
              <q-card flat bordered :dark="modoEscuro" class="consent-card">
                <q-card-section class="q-pa-sm">
                  <q-checkbox v-model="legalConsentAccepted" color="positive" :dark="modoEscuro" dense class="items-start">
                    <span class="text-caption q-ml-sm">
                      Declaro que a entidade <strong>{{ offer.recipientOrg }}</strong> aceita a doação dos alimentos descritos em perfeitas condições para distribuição gratuita, nos termos da Lei Federal nº 14.016/2020.
                    </span>
                  </q-checkbox>
                </q-card-section>
              </q-card>

              <q-btn
                type="button"
                unelevated
                no-caps
                color="positive"
                icon="send"
                class="full-width text-weight-bold text-uppercase q-py-sm"
                :disabled="isSubmitting"
                :label="isSubmitting ? 'Gravando e Assinando...' : 'Confirmar & Assinar Doação Digitalmente'"
                @click="handleSubmitResponse('accepted')"
              />
            </div>

            <!-- Campos: recusar -->
            <div v-else class="column q-gutter-y-sm">
              <q-select
                v-model="rejectionReason"
                :options="presetRejectionReasons"
                outlined
                dense
                :dark="modoEscuro"
                label="Selecione o Motivo da Indisponibilidade"
              />

              <q-input
                v-model="responseNotes"
                type="textarea"
                rows="2"
                outlined
                dense
                :dark="modoEscuro"
                label="Mensagem Adicional para o Doador (Opcional)"
                placeholder="Ex: Agradecemos a oferta, mas hoje nosso espaço refrigerado está lotado. Amanhã podemos receber..."
              />

              <q-btn
                type="button"
                unelevated
                no-caps
                color="negative"
                icon="close"
                class="full-width text-weight-bold text-uppercase q-py-sm"
                :disabled="isSubmitting"
                :label="isSubmitting ? 'Enviando...' : 'Informar Indisponibilidade ao Estabelecimento'"
                @click="handleSubmitResponse('rejected')"
              />
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- Rodapé -->
    <div :class="['footer-bar q-py-md', modoEscuro ? 'bg-dark' : 'bg-white']">
      <div class="page-container row items-center justify-between q-mx-auto q-px-md q-gutter-y-xs text-caption text-grey-6">
        <span>Save All © 2026 — Gestão de Doações &amp; Excedentes Alimentares</span>
        <span class="text-positive mono">Rastreabilidade &amp; Validade Jurídica (Lei 14.016/2020)</span>
      </div>
    </div>
  </q-page>
</template>

<style scoped lang="scss">
.confirmar-page {
  min-height: 100vh;
  width: 100%;
  min-width: 0;
  overflow-x: hidden;
  overflow-wrap: anywhere;
}
.page-container {
  width: 100%;
  max-width: 672px;
}
.top-bar {
  position: sticky;
  top: 0;
  z-index: 10;
  border-bottom: 1px solid rgba(128, 128, 128, 0.25);
}
.footer-bar {
  border-top: 1px solid rgba(128, 128, 128, 0.25);
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.logo-box {
  border-radius: 12px;
}
.dashed-card {
  border-style: dashed;
}
.not-found-text {
  max-width: 420px;
}
.response-info {
  border-top: 1px dashed rgba(128, 128, 128, 0.4);
}
.signature-img {
  height: 40px;
  object-fit: contain;
  opacity: 0.9;
}
.signature-invert {
  filter: invert(1);
}
.hash-text {
  max-width: 120px;
}
.choice-btn {
  min-height: 56px;
  border-radius: 16px;
}
.choice-sub {
  opacity: 0.7;
}
.consent-card {
  border-color: rgba(33, 186, 69, 0.4);
}
</style>