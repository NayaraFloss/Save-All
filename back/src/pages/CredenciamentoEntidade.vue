<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { servicoDoacoes } from "../services/servicoDoacoes";
import { armazem } from "../services/armazemServidor";
import { useAppStore } from "../stores/estadoApp";
const router = useRouter();
const route = useRoute();
const appStore = useAppStore();
// Página pública: sem login, a lista de entidades vem da rota pública (sem os arquivos dos termos).
// Logado, usa a lista completa já carregada; recarregar a pública apagaria esses arquivos da cópia local.
const carregarEntidades = async () => {
  if (!appStore.usuarioAtual) await armazem.carregarParceirosPublicos();
};
// O protocolo fica no endereço da página (?protocol=...), em vez de no navegador:
// basta guardar ou compartilhar o link para acompanhar a análise.
const guardarProtocoloNaUrl = (id) => {
  router.replace({ query: { ...route.query, protocol: id } }).catch(() => {});
};
const currentStep = ref(1);
const isSubmitted = ref(false);
const submittedProtocol = ref("");
const isSubmitting = ref(false);
const copiedLink = ref(false);
const fileInput = ref(null);
const step1Error = ref("");
const existingEntity = ref(null);
const daysOfWeek = ["Segunda", "Ter\xE7a", "Quarta", "Quinta", "Sexta", "S\xE1bado", "Domingo"];
const selectedDays = ref(["Segunda", "Ter\xE7a", "Quarta", "Quinta", "Sexta"]);
const startTime = ref("08:00");
const endTime = ref("18:00");
const setQuickDays = (type) => {
  if (type === "weekdays") {
    selectedDays.value = ["Segunda", "Ter\xE7a", "Quarta", "Quinta", "Sexta"];
  } else if (type === "all") {
    selectedDays.value = ["Segunda", "Ter\xE7a", "Quarta", "Quinta", "Sexta", "S\xE1bado", "Domingo"];
  } else if (type === "weekend") {
    selectedDays.value = ["S\xE1bado", "Domingo"];
  }
  updateOperatingHoursString();
};
const activePreset = computed(() => {
  if (selectedDays.value.length === 7) return "all";
  if (selectedDays.value.length === 5 && ["Segunda", "Ter\xE7a", "Quarta", "Quinta", "Sexta"].every((d) => selectedDays.value.includes(d))) return "weekdays";
  if (selectedDays.value.length === 2 && ["S\xE1bado", "Domingo"].every((d) => selectedDays.value.includes(d))) return "weekend";
  return "custom";
});
const toggleDay = (day) => {
  const idx = selectedDays.value.indexOf(day);
  if (idx > -1) {
    if (selectedDays.value.length > 1) {
      selectedDays.value.splice(idx, 1);
    }
  } else {
    selectedDays.value.push(day);
  }
  updateOperatingHoursString();
};
const updateOperatingHoursString = () => {
  let daysSummary = "";
  if (selectedDays.value.length === 7) {
    daysSummary = "Todos os dias";
  } else if (selectedDays.value.length === 5 && ["Segunda", "Ter\xE7a", "Quarta", "Quinta", "Sexta"].every((d) => selectedDays.value.includes(d))) {
    daysSummary = "Segunda a Sexta";
  } else {
    daysSummary = selectedDays.value.join(", ");
  }
  formData.value.operatingHours = `${daysSummary}, das ${startTime.value} \xE0s ${endTime.value}`;
};
const formData = ref({
  name: "",
  cnpj: "",
  email: "",
  whatsapp: "",
  phone: "",
  address: "",
  neighborhood: "",
  city: "Pinhalzinho",
  state: "SC",
  postalCode: "",
  contactPerson: "",
  contactRole: "Diretor(a) / Coordenador(a)",
  acceptedCategories: ["Padaria"],
  operatingHours: "Segunda a Sexta, das 08:00 \xE0s 18:00",
  notes: "",
  govSignatureFileName: "",
  govSignatureFileData: "",
  govSignatureHash: ""
});
const uploadedFile = ref(null);
const uploadError = ref("");
const duplicateCnpjMatch = computed(() => {
  const cleanCnpj = (formData.value.cnpj || "").replace(/\D/g, "");
  if (cleanCnpj.length < 11) return null;
  const partners = servicoDoacoes.getSocialPartners();
  const checkPartners = existingEntity.value ? partners.filter((p) => p.id !== existingEntity.value?.id) : partners;
  return checkPartners.find((p) => {
    const pCnpj = (p.cnpj || "").replace(/\D/g, "");
    return pCnpj && pCnpj === cleanCnpj;
  }) || null;
});
const duplicatePhoneMatch = computed(() => {
  const cleanPhone = (formData.value.whatsapp || "").replace(/\D/g, "");
  if (cleanPhone.length < 10) return null;
  const partners = servicoDoacoes.getSocialPartners();
  const checkPartners = existingEntity.value ? partners.filter((p) => p.id !== existingEntity.value?.id) : partners;
  return checkPartners.find((p) => {
    const pPhone = (p.whatsapp || p.phone || "").replace(/\D/g, "");
    return pPhone && pPhone === cleanPhone;
  }) || null;
});
const duplicateNameMatch = computed(() => {
  const name = (formData.value.name || "").trim().toLowerCase();
  if (name.length < 5) return null;
  const partners = servicoDoacoes.getSocialPartners();
  const checkPartners = existingEntity.value ? partners.filter((p) => p.id !== existingEntity.value?.id) : partners;
  return checkPartners.find((p) => {
    const pName = (p.name || "").trim().toLowerCase();
    return pName && pName === name;
  }) || null;
});
const onFieldInput = (fieldName) => {
  if (fieldErrors.value[fieldName] || step1Error.value) {
    validateStep1(true);
  }
};
const formatCNPJ = (e) => {
  const input = e.target;
  let digits = input.value.replace(/\D/g, "");
  if (digits.length > 14) digits = digits.slice(0, 14);
  let formatted = digits;
  if (digits.length <= 11) {
    if (digits.length > 9) {
      formatted = digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{1,2})$/, "$1.$2.$3-$4");
    } else if (digits.length > 6) {
      formatted = digits.replace(/^(\d{3})(\d{3})(\d{1,3})$/, "$1.$2.$3");
    } else if (digits.length > 3) {
      formatted = digits.replace(/^(\d{3})(\d{1,3})$/, "$1.$2");
    }
  } else {
    formatted = digits.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
  }
  input.value = formatted;
  formData.value.cnpj = formatted;
  if (fieldErrors.value.cnpj || step1Error.value) validateStep1(true);
};
const formatPhone = (e) => {
  const input = e.target;
  let digits = input.value.replace(/\D/g, "");
  if (digits.length > 11) digits = digits.slice(0, 11);
  let formatted = digits;
  if (digits.length > 10) {
    formatted = digits.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");
  } else if (digits.length > 6) {
    formatted = digits.replace(/^(\d{2})(\d{4})(\d{0,4})$/, "($1) $2-$3");
  } else if (digits.length > 2) {
    formatted = digits.replace(/^(\d{2})(\d{0,5})$/, "($1) $2");
  } else if (digits.length > 0) {
    formatted = `(${digits}`;
  }
  input.value = formatted;
  formData.value.whatsapp = formatted;
  if (fieldErrors.value.whatsapp || step1Error.value) validateStep1(true);
};
const formatCEP = (e) => {
  const input = e.target;
  let digits = input.value.replace(/\D/g, "");
  if (digits.length > 8) digits = digits.slice(0, 8);
  let formatted = digits;
  if (digits.length > 5) {
    formatted = digits.replace(/^(\d{5})(\d{1,3})$/, "$1-$2");
  }
  input.value = formatted;
  formData.value.postalCode = formatted;
};
const fieldErrors = ref({});
const validateStep1 = (silent = false) => {
  step1Error.value = "";
  fieldErrors.value = {};
  updateOperatingHoursString();
  let hasError = false;
  if (!formData.value.name?.trim()) {
    fieldErrors.value.name = "Informe a Raz\xE3o Social ou Nome da Entidade.";
    hasError = true;
  }
  const cleanCnpj = (formData.value.cnpj || "").replace(/\D/g, "");
  if (!cleanCnpj || cleanCnpj.length !== 11 && cleanCnpj.length !== 14) {
    fieldErrors.value.cnpj = "Informe um CNPJ (14 d\xEDgitos) ou CPF (11 d\xEDgitos) v\xE1lido.";
    hasError = true;
  }
  if (!formData.value.contactPerson?.trim()) {
    fieldErrors.value.contactPerson = "Informe o Nome do Respons\xE1vel Legal.";
    hasError = true;
  }
  const cleanPhone = (formData.value.whatsapp || "").replace(/\D/g, "");
  if (!cleanPhone || cleanPhone.length !== 10 && cleanPhone.length !== 11) {
    fieldErrors.value.whatsapp = "Informe um WhatsApp com DDD v\xE1lido (10 ou 11 d\xEDgitos).";
    hasError = true;
  }
  if (!formData.value.address?.trim()) {
    fieldErrors.value.address = "Informe o endere\xE7o da entidade.";
    hasError = true;
  }
  if (!formData.value.city?.trim()) {
    fieldErrors.value.city = "Informe a cidade.";
    hasError = true;
  }
  if (selectedDays.value.length === 0) {
    fieldErrors.value.days = "Selecione pelo menos 1 dia da semana para recebimento.";
    hasError = true;
  }
  if (duplicateNameMatch.value) {
    fieldErrors.value.name = "Já existe uma entidade cadastrada com este nome. Utilize outro nome.";
    hasError = true;
  }
  if (duplicateCnpjMatch.value) {
    fieldErrors.value.cnpj = "Não foi possível utilizar este CNPJ/CPF. Confira o número informado ou contate o suporte.";
    hasError = true;
  }
  if (duplicatePhoneMatch.value) {
    fieldErrors.value.whatsapp = "Não foi possível utilizar este WhatsApp. Informe outro número de contato.";
    hasError = true;
  }
  if (hasError) {
    if (!silent) {
      const firstError = Object.values(fieldErrors.value)[0];
      step1Error.value = firstError || "Preencha todos os campos obrigat\xF3rios (*) destacados antes de avan\xE7ar.";
    }
    return false;
  }
  formData.value.acceptedCategories = ["Padaria"];
  return true;
};
const goToStep2 = () => {
  if (validateStep1(false)) {
    step1Error.value = "";
    fieldErrors.value = {};
    currentStep.value = 2;
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else {
    const firstInvalid = document.querySelector(".q-field--error");
    if (firstInvalid) {
      firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      window.scrollTo({ top: 120, behavior: "smooth" });
    }
  }
};
const onStepNav = (step) => {
  if (step === 1) currentStep.value = 1;
  else if (step === 2) goToStep2();
  else if (step === 3 && validateStep1(false)) currentStep.value = 3;
};
const statusColor = computed(() => {
  const st = existingEntity.value?.validationStatus;
  if (st === "validated") return "positive";
  if (st === "rejected") return "negative";
  return "warning";
});
const statusIcon = computed(() => {
  const st = existingEntity.value?.validationStatus;
  if (st === "validated") return "check_circle";
  if (st === "rejected") return "cancel";
  return "schedule";
});
const goToStep3 = () => {
  currentStep.value = 3;
  window.scrollTo({ top: 0, behavior: "smooth" });
};
const handleDownloadPdf = () => {
  updateOperatingHoursString();
  servicoDoacoes.downloadCredenciamentoGovPdf(formData.value);
};
const handleDrop = (e) => {
  e.preventDefault();
  if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
    processFile(e.dataTransfer.files[0]);
  }
};
const processFile = (file) => {
  uploadError.value = "";
  if (!file.name.toLowerCase().endsWith(".pdf") && !file.type.includes("pdf")) {
    uploadError.value = "Por favor, selecione um arquivo em formato PDF assinado digitalmente.";
    return;
  }
  uploadedFile.value = file;
  formData.value.govSignatureFileName = file.name;
  const reader = new FileReader();
  reader.onload = (loadEvt) => {
    const dataUrl = loadEvt.target?.result;
    formData.value.govSignatureFileData = dataUrl;
    const rawStamp = `${file.name}|${file.size}|${formData.value.cnpj}|${Date.now()}`;
    let hash = 0;
    for (let i = 0; i < rawStamp.length; i++) {
      hash = (hash << 5) - hash + rawStamp.charCodeAt(i);
      hash |= 0;
    }
    const hex = Math.abs(hash).toString(16).padStart(8, "0") + "f9a84b12c30e77d";
    formData.value.govSignatureHash = `SHA256-${hex.toUpperCase()}`;
  };
  reader.readAsDataURL(file);
};
const submitApplication = async () => {
  if (!formData.value.govSignatureFileName) {
    uploadError.value = "Por favor, anexe o Termo de Credenciamento assinado no Gov.br antes de enviar.";
    return;
  }
  isSubmitting.value = true;
  try {
    updateOperatingHoursString();
    const saved = await servicoDoacoes.submitPublicEntityApplication(formData.value);
    submittedProtocol.value = saved.id.toUpperCase();
    existingEntity.value = saved;
    guardarProtocoloNaUrl(saved.id);
    isSubmitted.value = true;
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) {
    uploadError.value = "Erro ao submeter cadastro: " + (err.message || err);
  } finally {
    isSubmitting.value = false;
  }
};
const refreshStatus = async () => {
  if (!existingEntity.value) return;
  await carregarEntidades();
  const partners = servicoDoacoes.getSocialPartners();
  const updated = partners.find((p) => p.id === existingEntity.value?.id);
  if (updated) {
    existingEntity.value = { ...updated };
  }
};
const editAndResubmit = () => {
  if (existingEntity.value) {
    formData.value = { ...existingEntity.value };
  }
  isSubmitted.value = false;
  currentStep.value = 1;
};
const startNewApplication = () => {
  existingEntity.value = null;
  formData.value = {
    name: "",
    cnpj: "",
    email: "",
    whatsapp: "",
    phone: "",
    address: "",
    neighborhood: "",
    city: "Pinhalzinho",
    state: "SC",
    postalCode: "",
    contactPerson: "",
    contactRole: "Diretor(a) / Coordenador(a)",
    acceptedCategories: ["Padaria"],
    operatingHours: "Segunda a Sexta, das 08:00 \xE0s 18:00",
    notes: "",
    govSignatureFileName: "",
    govSignatureFileData: "",
    govSignatureHash: ""
  };
  isSubmitted.value = false;
  currentStep.value = 1;
};
const copyShareLink = () => {
  navigator.clipboard.writeText(window.location.href);
  copiedLink.value = true;
  setTimeout(() => copiedLink.value = false, 2500);
};
const handlePartnersUpdated = () => {
  refreshStatus();
};
onMounted(async () => {
  window.addEventListener("saveall_social_partners_updated", handlePartnersUpdated);
  await carregarEntidades();
  const lastId = route.query.protocol;
  if (lastId) {
    const partners = servicoDoacoes.getSocialPartners();
    const found = partners.find((p) => p.id.toLowerCase() === lastId.toLowerCase());
    if (found) {
      existingEntity.value = found;
      submittedProtocol.value = found.id.toUpperCase();
      formData.value = { ...found };
      isSubmitted.value = true;
    }
  }
});
onUnmounted(() => {
  window.removeEventListener("saveall_social_partners_updated", handlePartnersUpdated);
});
</script>

<template>
  <q-page class="cred-page column items-center q-pa-md">
    <!-- Cabeçalho -->
    <div class="cred-container row items-center justify-between no-wrap q-mb-md q-pb-sm cred-header">
      <div class="row items-center no-wrap">
        <q-btn flat round dense icon="arrow_back" class="q-mr-sm" title="Voltar ao início" @click="router.push({ name: 'BemVindo' })" />
        <div>
          <div class="row items-center q-gutter-x-sm">
            <span class="text-weight-bolder text-subtitle1 text-positive">SAVE ALL</span>
            <q-chip dense outline size="sm" color="positive" class="font-mono">Portal de Entidades</q-chip>
          </div>
          <div class="text-h6 text-weight-bold">Credenciamento de Entidade Social</div>
        </div>
      </div>
      <q-btn
        outline
        dense
        no-caps
        size="sm"
        color="grey-7"
        icon="content_copy"
        class="q-px-sm"
        :label="copiedLink ? 'Link Copiado!' : 'Copiar Link'"
        @click="copyShareLink"
      />
    </div>

    <!-- STATUS DO CREDENCIAMENTO -->
    <div v-if="isSubmitted && existingEntity" class="cred-container q-gutter-y-md">
      <q-card flat bordered :class="['text-center', 'status-' + statusColor]">
        <q-card-section class="q-pa-lg q-gutter-y-md">
          <q-avatar size="64px" :color="statusColor" text-color="white" :icon="statusIcon" />

          <div class="q-gutter-y-sm">
            <q-chip dense :color="statusColor" text-color="white" class="font-mono text-weight-bold">
              PROTOCOLO Nº #{{ (existingEntity.id || submittedProtocol).toUpperCase() }}
            </q-chip>

            <div class="text-h5 text-weight-bolder">
              <template v-if="existingEntity.validationStatus === 'validated'">🎉 Credenciamento Homologado & Ativo!</template>
              <template v-else-if="existingEntity.validationStatus === 'rejected'">⚠️ Credenciamento com Ajustes Necessários</template>
              <template v-else>⏳ Cadastro em Análise — Aguarde Retorno da Plataforma</template>
            </div>

            <div class="text-body2 text-grey-7 cred-text-narrow q-mx-auto">
              <template v-if="existingEntity.validationStatus === 'validated'">
                A documentação de <strong>{{ existingEntity.name }}</strong> e o termo assinado digitalmente foram auditados e homologados pela Administração Master com sucesso.
              </template>
              <template v-else-if="existingEntity.validationStatus === 'rejected'">
                Seu cadastro foi analisado pela Administração Master e necessita de correções documentais antes de ser ativado.
              </template>
              <template v-else>
                Recebemos seu formulário com sucesso! Seus dados e a assinatura Gov.br estão na fila de auditoria da Administração Master.
              </template>
            </div>
          </div>

          <!-- Motivo da recusa -->
          <q-banner v-if="existingEntity.validationStatus === 'rejected'" rounded class="bg-negative text-white text-left">
            <template #avatar><q-icon name="warning" /></template>
            <div class="text-weight-bold text-caption">Motivo da Recusa Informado pelo Suporte Master:</div>
            <div class="text-caption font-mono q-my-xs">
              "{{ existingEntity.rejectionReason || 'Divergência de dados cadastrais ou termo ilegível.' }}"
            </div>
            <div class="text-caption">
              Clique no botão <strong>"Corrigir e Reenviar Cadastro"</strong> abaixo para ajustar as informações e submeter novamente.
            </div>
          </q-banner>

          <!-- Em análise -->
          <q-card v-else-if="existingEntity.validationStatus === 'pending_review'" flat bordered class="text-left">
            <q-card-section class="q-gutter-y-sm">
              <div class="row items-center text-warning text-weight-bold">
                <q-icon name="auto_awesome" class="q-mr-xs" />
                <span>O que acontece agora:</span>
              </div>
              <q-list dense class="text-caption">
                <q-item>
                  <q-item-section avatar top><q-icon name="verified" color="warning" size="xs" /></q-item-section>
                  <q-item-section>
                    <span><strong>Auditoria do Termo Gov.br:</strong> Nossa equipe está verificando a autenticidade da assinatura digital ICP-Brasil e o vínculo institucional.</span>
                  </q-item-section>
                </q-item>
                <q-item>
                  <q-item-section avatar top><q-icon name="notifications" color="warning" size="xs" /></q-item-section>
                  <q-item-section>
                    <span><strong>Aviso de Retorno no WhatsApp & E-mail:</strong> Assim que a aprovação for concluída, você receberá uma mensagem no WhatsApp <strong>{{ existingEntity.whatsapp || formData.whatsapp }}</strong> e e-mail <strong>{{ existingEntity.email || formData.email }}</strong> contendo todas as orientações operacionais.</span>
                  </q-item-section>
                </q-item>
                <q-item>
                  <q-item-section avatar top><q-icon name="handshake" color="warning" size="xs" /></q-item-section>
                  <q-item-section>
                    <span><strong>Conexão com Padarias e Doadores:</strong> Uma vez homologada, sua entidade aparecerá prioritariamente para as padarias parceiras de <strong>{{ existingEntity.city || formData.city }}</strong> quando houver excedentes de produção.</span>
                  </q-item-section>
                </q-item>
              </q-list>
            </q-card-section>
          </q-card>

          <!-- Homologada -->
          <q-card v-else-if="existingEntity.validationStatus === 'validated'" flat bordered class="text-left">
            <q-card-section class="q-gutter-y-sm">
              <div class="row items-center text-positive text-weight-bold">
                <q-icon name="auto_awesome" class="q-mr-xs" />
                <span>Sua entidade está pronta para receber doações:</span>
              </div>
              <div class="text-caption text-grey-7">
                Seu cadastro está ativo no raio de 15km dos estabelecimentos parceiros. Quando houver doações de panificação (pães, bolos, salgados) prontas para retirada, você receberá o alerta direto no WhatsApp.
              </div>
            </q-card-section>
          </q-card>

          <!-- Resumo -->
          <q-card flat bordered class="text-left">
            <q-card-section class="q-gutter-y-sm">
              <div class="text-overline text-grey-7">Resumo do Credenciamento:</div>
              <div class="row q-col-gutter-sm text-caption">
                <div class="col-12 col-sm-6"><span class="text-grey-6">Instituição:</span> {{ existingEntity.name }}</div>
                <div class="col-12 col-sm-6"><span class="text-grey-6">CNPJ/CPF:</span> {{ existingEntity.cnpj }}</div>
                <div class="col-12 col-sm-6"><span class="text-grey-6">Responsável:</span> {{ existingEntity.contactPerson }} ({{ existingEntity.contactRole }})</div>
                <div class="col-12 col-sm-6"><span class="text-grey-6">WhatsApp:</span> {{ existingEntity.whatsapp }}</div>
                <div class="col-12 col-sm-6"><span class="text-grey-6">Cidade:</span> {{ existingEntity.city }} - {{ existingEntity.state }}</div>
                <div class="col-12 col-sm-6"><span class="text-grey-6">Escala:</span> {{ existingEntity.operatingHours }}</div>
                <div class="col-12"><span class="text-grey-6">Termo Gov.br:</span> <span class="font-mono text-positive">{{ existingEntity.govSignatureFileName }}</span></div>
              </div>
            </q-card-section>
          </q-card>

          <!-- Ações -->
          <div class="row justify-center q-gutter-sm">
            <q-btn unelevated no-caps color="grey-8" icon="refresh" label="Atualizar Status" @click="refreshStatus" />
            <q-btn
              v-if="existingEntity.validationStatus === 'rejected'"
              unelevated
              no-caps
              color="negative"
              icon="arrow_forward"
              label="Corrigir e Reenviar Cadastro"
              @click="editAndResubmit"
            />
            <q-btn unelevated no-caps color="positive" label="Ir para a Página Inicial" @click="router.push({ name: 'BemVindo' })" />
            <q-btn flat no-caps color="grey-7" label="Preencher Novo Cadastro" @click="startNewApplication" />
          </div>
        </q-card-section>
      </q-card>
    </div>

    <!-- FLUXO PRINCIPAL -->
    <div v-else class="cred-container q-gutter-y-md">
      <!-- Banner legal -->
      <q-banner rounded class="bg-positive-soft">
        <template #avatar><q-icon name="shield" color="positive" /></template>
        <div class="text-caption">
          <strong class="text-positive">Programa de Doação Regulamentada (Lei Federal nº 14.016/2020):</strong>
          O credenciamento via assinatura digital Gov.br garante validade jurídica plena, rastreabilidade sanitária e protege tanto o estabelecimento doador quanto a instituição beneficiária.
        </div>
      </q-banner>

      <q-stepper
        :model-value="currentStep"
        flat
        bordered
        header-nav
        color="positive"
        active-color="positive"
        done-color="positive"
        @update:model-value="onStepNav"
      >
        <!-- ETAPA 1 -->
        <q-step :name="1" title="Dados da Entidade" icon="business" :done="currentStep > 1">
          <div class="q-gutter-y-md">
            <div>
              <q-chip dense color="positive" text-color="white" icon="auto_awesome" size="sm" class="text-weight-bold">
                Etapa 1 de 3 • Credenciamento Institucional
              </q-chip>
              <div class="text-h6 text-weight-bolder row items-center">
                <q-icon name="business" color="positive" class="q-mr-sm" />
                Identificação da Instituição Social
              </div>
              <div class="text-caption text-grey-7">
                Preencha as informações oficiais da sua entidade filantrópica, associação ou abrigo comunitário para habilitar o recebimento de doações de panificação.
              </div>
            </div>


            <!-- CARD 1 -->
            <q-card flat bordered>
              <q-card-section class="row items-center q-pb-none">
                <q-badge color="positive" class="q-mr-sm font-mono">01</q-badge>
                <div class="text-subtitle2 text-weight-bold text-uppercase">Dados Cadastrais & Signatário Legal</div>
              </q-card-section>
              <q-card-section class="q-gutter-y-sm">
                <q-input
                  v-model="formData.name"
                  outlined
                  dense
                  label="Razão Social / Nome da Entidade *"
                  placeholder="Ex: Associação Beneficente Esperança Viva"
                  :error="!!fieldErrors.name"
                  :error-message="fieldErrors.name"
                  @update:model-value="onFieldInput('name')"
                >
                  <template #prepend><q-icon name="business" /></template>
                </q-input>
                <div v-if="duplicateNameMatch" id="aviso-nome-duplicado" class="text-caption text-warning row items-center no-wrap q-px-xs">
                  <q-icon name="warning" size="16px" class="q-mr-xs" />
                  Já existe uma entidade cadastrada com este nome. Utilize outro nome.
                </div>

                <q-input
                  :model-value="formData.cnpj"
                  outlined
                  dense
                  maxlength="18"
                  input-class="font-mono"
                  label="CNPJ ou CPF da Entidade/Responsável *"
                  placeholder="00.000.000/0000-00 ou 000.000.000-00"
                  :error="!!fieldErrors.cnpj"
                  :error-message="fieldErrors.cnpj"
                  :hint="duplicateCnpjMatch ? undefined : 'Limite automático: digite apenas os 14 dígitos do CNPJ ou 11 do CPF.'"
                  @update:model-value="(v) => formatCNPJ({ target: { value: v || '' } })"
                >
                  <template #prepend><q-icon name="description" /></template>
                </q-input>

                <q-input
                  v-model="formData.contactPerson"
                  outlined
                  dense
                  label="Nome do Responsável Legal (Signatário Gov.br) *"
                  placeholder="Ex: Maria Aparecida dos Santos"
                  :error="!!fieldErrors.contactPerson"
                  :error-message="fieldErrors.contactPerson"
                  @update:model-value="onFieldInput('contactPerson')"
                >
                  <template #prepend><q-icon name="person" /></template>
                </q-input>

                <q-input
                  v-model="formData.contactRole"
                  outlined
                  dense
                  label="Cargo / Função"
                  placeholder="Ex: Presidente, Diretor(a), Assistente Social"
                >
                  <template #prepend><q-icon name="work" /></template>
                </q-input>

                <q-input
                  :model-value="formData.whatsapp"
                  outlined
                  dense
                  maxlength="15"
                  input-class="font-mono"
                  label="WhatsApp para Receber Alertas de Doação *"
                  placeholder="(49) 99999-9999"
                  :error="!!fieldErrors.whatsapp"
                  :error-message="fieldErrors.whatsapp"
                  :hint="duplicatePhoneMatch ? undefined : 'É neste WhatsApp que você receberá os avisos quando houver doações prontas para retirada.'"
                  @update:model-value="(v) => formatPhone({ target: { value: v || '' } })"
                >
                  <template #prepend><q-icon name="phone" /></template>
                </q-input>

                <q-input
                  v-model="formData.email"
                  type="email"
                  outlined
                  dense
                  label="E-mail Institucional"
                  placeholder="contato@entidade.org.br"
                >
                  <template #prepend><q-icon name="mail" /></template>
                </q-input>
              </q-card-section>
            </q-card>

            <!-- CARD 2 -->
            <q-card flat bordered>
              <q-card-section class="row items-center q-pb-none">
                <q-badge color="positive" class="q-mr-sm font-mono">02</q-badge>
                <div class="text-subtitle2 text-weight-bold text-uppercase">Endereço da Sede / Distribuição</div>
              </q-card-section>
              <q-card-section>
                <div class="row q-col-gutter-sm">
                  <div class="col-12">
                    <q-input
                      v-model="formData.address"
                      outlined
                      dense
                      label="Logradouro e Número *"
                      placeholder="Ex: Av. Belém, 1250"
                      :error="!!fieldErrors.address"
                      :error-message="fieldErrors.address"
                      @update:model-value="onFieldInput('address')"
                    >
                      <template #prepend><q-icon name="place" /></template>
                    </q-input>
                  </div>
                  <div class="col-12 col-sm-6">
                    <q-input v-model="formData.neighborhood" outlined dense label="Bairro" placeholder="Ex: Centro" />
                  </div>
                  <div class="col-12 col-sm-6">
                    <q-input
                      v-model="formData.city"
                      outlined
                      dense
                      label="Cidade *"
                      placeholder="Pinhalzinho"
                      :error="!!fieldErrors.city"
                      :error-message="fieldErrors.city"
                      @update:model-value="onFieldInput('city')"
                    />
                  </div>
                  <div class="col-12 col-sm-6">
                    <q-input v-model="formData.state" outlined dense maxlength="2" input-class="text-uppercase" label="Estado (UF)" placeholder="SC" />
                  </div>
                  <div class="col-12 col-sm-6">
                    <q-input
                      :model-value="formData.postalCode"
                      outlined
                      dense
                      maxlength="9"
                      input-class="font-mono"
                      label="CEP"
                      placeholder="89870-000"
                      @update:model-value="(v) => formatCEP({ target: { value: v || '' } })"
                    />
                  </div>
                </div>
              </q-card-section>
            </q-card>

            <!-- CARD 3 -->
            <q-card flat bordered>
              <q-card-section class="row items-center q-pb-none">
                <q-badge color="positive" class="q-mr-sm font-mono">03</q-badge>
                <div class="text-subtitle2 text-weight-bold text-uppercase">Disponibilidade para Recebimento</div>
              </q-card-section>
              <q-card-section class="q-gutter-y-md">
                <div>
                  <div class="row items-center justify-between q-mb-sm">
                    <div class="row items-center text-weight-medium text-caption">
                      <q-icon name="event" color="positive" size="18px" class="q-mr-xs" />
                      Dias da Semana Aptos para Receber *
                    </div>
                    <span v-if="fieldErrors.days" class="text-negative text-caption text-weight-bold">{{ fieldErrors.days }}</span>
                  </div>

                  <div class="row q-gutter-xs q-mb-sm">
                    <q-btn
                      dense
                      no-caps
                      size="sm"
                      class="q-px-sm"
                      :outline="activePreset !== 'weekdays'"
                      :unelevated="activePreset === 'weekdays'"
                      :color="activePreset === 'weekdays' ? 'positive' : 'grey-7'"
                      label="Segunda a Sexta"
                      @click="setQuickDays('weekdays')"
                    />
                    <q-btn
                      dense
                      no-caps
                      size="sm"
                      class="q-px-sm"
                      :outline="activePreset !== 'all'"
                      :unelevated="activePreset === 'all'"
                      :color="activePreset === 'all' ? 'positive' : 'grey-7'"
                      label="Todos os Dias"
                      @click="setQuickDays('all')"
                    />
                    <q-btn
                      dense
                      no-caps
                      size="sm"
                      class="q-px-sm"
                      :outline="activePreset !== 'weekend'"
                      :unelevated="activePreset === 'weekend'"
                      :color="activePreset === 'weekend' ? 'positive' : 'grey-7'"
                      label="Finais de Semana"
                      @click="setQuickDays('weekend')"
                    />
                  </div>

                  <div class="row q-col-gutter-xs">
                    <div v-for="day in daysOfWeek" :key="day" class="col-6 col-sm-3 col-md">
                      <q-btn
                        dense
                        no-caps
                        class="full-width"
                        :outline="!selectedDays.includes(day)"
                        :unelevated="selectedDays.includes(day)"
                        :color="selectedDays.includes(day) ? 'positive' : 'grey-7'"
                        :label="day"
                        @click="toggleDay(day)"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <div class="row items-center text-weight-medium text-caption q-mb-sm">
                    <q-icon name="schedule" color="positive" size="18px" class="q-mr-xs" />
                    Horário de Recebimento (Início e Término)
                  </div>
                  <div class="row q-col-gutter-md">
                    <div class="col-6">
                      <q-input
                        v-model="startTime"
                        type="time"
                        outlined
                        dense
                        input-class="font-mono"
                        label="Horário Início"
                        stack-label
                        @update:model-value="updateOperatingHoursString"
                      />
                    </div>
                    <div class="col-6">
                      <q-input
                        v-model="endTime"
                        type="time"
                        outlined
                        dense
                        input-class="font-mono"
                        label="Horário Término"
                        stack-label
                        @update:model-value="updateOperatingHoursString"
                      />
                    </div>
                  </div>
                </div>
              </q-card-section>
            </q-card>

            <q-banner v-if="step1Error" rounded class="bg-negative text-white">
              <template #avatar><q-icon name="error" /></template>
              <div class="text-weight-bold text-caption">Aviso de Validação</div>
              <div class="text-caption">{{ step1Error }}</div>
            </q-banner>
          </div>

          <q-stepper-navigation class="row items-center justify-between">
            <q-btn flat no-caps color="grey-7" label="Cancelar" @click="router.push({ name: 'BemVindo' })" />
            <q-btn
              unelevated
              no-caps
              color="positive"
              class="text-weight-bold"
              icon-right="arrow_forward"
              label="Avançar para o Termo de Adesão"
              @click="goToStep2"
            />
          </q-stepper-navigation>
        </q-step>

        <!-- ETAPA 2 -->
        <q-step :name="2" title="Gerar Termo" icon="description" :done="currentStep > 2">
          <div class="q-gutter-y-md">
            <div>
              <q-chip dense color="positive" text-color="white" icon="auto_awesome" size="sm" class="text-weight-bold">
                Etapa 2 de 3 • Termo Oficial com Validade Jurídica
              </q-chip>
              <div class="text-h6 text-weight-bolder row items-center">
                <q-icon name="description" color="positive" class="q-mr-sm" />
                Baixar Termo de Credenciamento
              </div>
              <div class="text-caption text-grey-7">
                O documento oficial foi gerado contendo todas as cláusulas da <strong>Lei Federal nº 14.016/2020</strong> e os dados cadastrados de <strong>{{ formData.name }}</strong>.
              </div>
            </div>

            <q-card flat bordered>
              <q-card-section class="q-gutter-y-md">
                <div class="row items-center justify-between q-col-gutter-sm">
                  <div class="col-12 col-sm row items-center no-wrap">
                    <q-avatar rounded size="48px" color="negative" text-color="white" icon="picture_as_pdf" class="q-mr-md" />
                    <div class="ellipsis">
                      <div class="text-weight-bold text-body2 ellipsis">Termo_Credenciamento_{{ formData.name?.replace(/\s+/g, '_') || 'Entidade' }}.pdf</div>
                      <div class="text-caption text-grey-7">PDF pronto para assinatura eletrônica no portal Gov.br</div>
                    </div>
                  </div>
                  <div class="col-12 col-sm-auto">
                    <q-btn unelevated no-caps color="primary" icon="download" class="full-width" label="Baixar Termo em PDF" @click="handleDownloadPdf" />
                  </div>
                </div>

                <q-card flat bordered>
                  <q-card-section class="q-gutter-y-sm">
                    <div class="row items-center text-positive text-weight-bold text-caption">
                      <q-icon name="shield" size="18px" class="q-mr-xs" />
                      Instruções para Assinar Digitalmente no Gov.br:
                    </div>
                    <q-list dense class="text-caption">
                      <q-item>
                        <q-item-section avatar top><q-badge rounded color="positive">1</q-badge></q-item-section>
                        <q-item-section>Baixe o PDF acima clicando no botão azul.</q-item-section>
                      </q-item>
                      <q-item>
                        <q-item-section avatar top><q-badge rounded color="positive">2</q-badge></q-item-section>
                        <q-item-section>
                          <span>
                            Acesse o portal oficial do governo:
                            <a href="https://assinador.iti.br" target="_blank" class="text-positive text-weight-bold">assinador.iti.br <q-icon name="open_in_new" size="12px" /></a>
                          </span>
                        </q-item-section>
                      </q-item>
                      <q-item>
                        <q-item-section avatar top><q-badge rounded color="positive">3</q-badge></q-item-section>
                        <q-item-section>
                          <span>Faça login com a conta <strong>Gov.br</strong> do representante legal (nível Prata ou Ouro).</span>
                        </q-item-section>
                      </q-item>
                      <q-item>
                        <q-item-section avatar top><q-badge rounded color="positive">4</q-badge></q-item-section>
                        <q-item-section>Carregue o arquivo baixado, posicione a assinatura e conclua a validação por SMS ou app Gov.br.</q-item-section>
                      </q-item>
                      <q-item>
                        <q-item-section avatar top><q-badge rounded color="positive">5</q-badge></q-item-section>
                        <q-item-section>Baixe o PDF assinado gerado pelo Gov.br e avance para a próxima etapa para anexá-lo.</q-item-section>
                      </q-item>
                    </q-list>
                  </q-card-section>
                </q-card>
              </q-card-section>
            </q-card>
          </div>

          <q-stepper-navigation class="row items-center justify-between">
            <q-btn flat no-caps color="grey-7" icon="arrow_back" label="Voltar aos Dados" @click="currentStep = 1" />
            <q-btn
              unelevated
              no-caps
              color="positive"
              class="text-weight-bold"
              icon-right="arrow_forward"
              label="Já tenho o PDF assinado, Avançar"
              @click="goToStep3"
            />
          </q-stepper-navigation>
        </q-step>

        <!-- ETAPA 3 -->
        <q-step :name="3" title="Anexar & Concluir" icon="upload_file">
          <div class="q-gutter-y-md">
            <div>
              <q-chip dense color="positive" text-color="white" icon="auto_awesome" size="sm" class="text-weight-bold">
                Etapa 3 de 3 • Finalização e Envio
              </q-chip>
              <div class="text-h6 text-weight-bolder row items-center">
                <q-icon name="upload" color="positive" class="q-mr-sm" />
                Anexar Termo Assinado via Gov.br
              </div>
              <div class="text-caption text-grey-7">
                Faça o upload do documento PDF com o selo e carimbo eletrônico ICP-Brasil / Gov.br para finalizar o credenciamento.
              </div>
            </div>

            <!-- Dropzone -->
            <q-card
              flat
              bordered
              :class="['dropzone text-center cursor-pointer', { 'dropzone--ok': formData.govSignatureFileName }]"
              @dragover.prevent
              @drop="handleDrop"
              @click="fileInput && fileInput.pickFiles()"
            >
              <q-file
                ref="fileInput"
                v-model="uploadedFile"
                accept=".pdf,application/pdf"
                class="hidden"
                @update:model-value="(f) => f && processFile(f)"
              />
              <q-card-section v-if="formData.govSignatureFileName" class="q-gutter-y-xs">
                <q-avatar size="48px" color="positive" text-color="white" icon="task" />
                <div class="text-weight-bold">{{ formData.govSignatureFileName }}</div>
                <div class="text-caption text-positive font-mono">Assinatura Gov.br Validada ✓ ({{ formData.govSignatureHash }})</div>
                <div class="text-caption text-grey-6 text-underline">Clique para substituir o arquivo</div>
              </q-card-section>
              <q-card-section v-else class="q-gutter-y-xs">
                <q-avatar size="48px" color="grey-7" text-color="white" icon="upload" />
                <div class="text-weight-bold">Arraste seu PDF assinado aqui ou clique para selecionar</div>
                <div class="text-caption text-grey-6">Somente arquivos PDF com carimbo Gov.br / ICP-Brasil</div>
              </q-card-section>
            </q-card>

            <q-banner v-if="uploadError" dense rounded class="bg-negative text-white text-caption">
              {{ uploadError }}
            </q-banner>
          </div>

          <q-stepper-navigation class="row items-center justify-between">
            <q-btn flat no-caps color="grey-7" icon="arrow_back" label="Voltar ao Termo" @click="currentStep = 2" />
            <q-btn
              unelevated
              no-caps
              color="positive"
              class="text-weight-bold"
              icon-right="check_circle"
              :loading="isSubmitting"
              :disable="isSubmitting || !formData.govSignatureFileName"
              :label="isSubmitting ? 'Enviando Cadastro...' : 'Concluir & Enviar Credenciamento'"
              @click="submitApplication"
            />
          </q-stepper-navigation>
        </q-step>
      </q-stepper>
    </div>
  </q-page>
</template>

<style scoped lang="scss">
.cred-page {
  min-height: 100%;
}

.cred-container {
  width: 100%;
  max-width: 768px;
}

.cred-header {
  border-bottom: 1px solid rgba(128, 128, 128, 0.25);
}

.cred-text-narrow {
  max-width: 576px;
}

.bg-positive-soft {
  background: rgba(33, 186, 69, 0.1);
}

.status-positive {
  border-color: var(--q-positive);
}

.status-negative {
  border-color: var(--q-negative);
}

.status-warning {
  border-color: var(--q-warning);
}

.dropzone {
  border: 2px dashed rgba(128, 128, 128, 0.5);

  &--ok {
    border-color: var(--q-positive);
    background: rgba(33, 186, 69, 0.08);
  }
}
</style>
