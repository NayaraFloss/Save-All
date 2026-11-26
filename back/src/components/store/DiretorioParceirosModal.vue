<script setup>
// Pesquisa e seleciona parceiros disponíveis para apoiar a destinação de alimentos.
import { ref, computed, onMounted } from "vue";
import { servicoDoacoes } from "../../services/servicoDoacoes";
import { useAppStore } from "../../stores/estadoApp";
// Entradas recebidas do componente pai que configuram os dados e opções desta tela.
const props = defineProps({ show: Boolean, modoEscuro: Boolean, initialTab: { type: String, default: "entidades" } });
// Eventos emitidos para o componente pai executar as ações fora desta interface.
const emit = defineEmits(["close", "select-partner"]);
const { triggerNotification } = useAppStore();
// Estado local reativo usado para acompanhar seleções, formulários e etapas da interface.
const activeTab = ref("social");
const searchQuery = ref("");
const filterStatus = ref("all");
const currentStoreCity = ref(props.storeCity || "Pinhalzinho");
const socialPartners = ref([]);
const disposalPartners = ref([]);
const selectedPartnerToReview = ref(null);
// Ações da tela validam a interação e encaminham as alterações ou eventos necessários.
const reloadData = () => {
  socialPartners.value = servicoDoacoes.getSocialPartners();
  disposalPartners.value = servicoDoacoes.getDisposalPartners();
};
onMounted(() => {
  reloadData();
  window.addEventListener("saveall_social_partners_updated", reloadData);
});
// Valores derivados das entradas e do estado para manter a apresentação sincronizada.
const proximitySocialList = computed(() => {
  let list = socialPartners.value;
  if (filterStatus.value === "pending") {
    list = list.filter((p) => p.validationStatus === "pending_review" || p.selectionStatus === "standby");
  } else if (filterStatus.value === "validated") {
    list = list.filter((p) => p.validationStatus === "validated");
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase();
    list = list.filter(
      (p) => p.name.toLowerCase().includes(q) || p.cnpj.includes(q) || p.city.toLowerCase().includes(q) || p.contactPerson.toLowerCase().includes(q)
    );
  }
  return list.map((p) => {
    const prox = servicoDoacoes.calculateProximity(currentStoreCity.value, p.city);
    return {
      ...p,
      distanceKm: prox.distanceKm,
      proximityLabel: prox.label,
      isSameCity: prox.isSameCity,
      badgeColor: prox.badgeColor
    };
  }).sort((a, b) => {
    if (a.validationStatus === "pending_review" && b.validationStatus !== "pending_review") return -1;
    if (b.validationStatus === "pending_review" && a.validationStatus !== "pending_review") return 1;
    return a.distanceKm - b.distanceKm;
  });
});
const filteredDisposal = computed(() => {
  if (!searchQuery.value.trim()) return disposalPartners.value;
  const q = searchQuery.value.toLowerCase();
  return disposalPartners.value.filter(
    (p) => p.name.toLowerCase().includes(q) || p.cnpj.includes(q) || p.environmentalLicense.toLowerCase().includes(q) || p.treatmentType.toLowerCase().includes(q) || p.city.toLowerCase().includes(q)
  );
});
const handleApproveHandpick = (partner) => {
  servicoDoacoes.approveSocialPartner(partner.id, "Selecionada e aprovada a dedo pelo estabelecimento");
  reloadData();
  triggerNotification(`Entidade "${partner.name}" selecionada e validada para receber doa\xE7\xF5es! \u2705`, "success");
  if (selectedPartnerToReview.value?.id === partner.id) {
    selectedPartnerToReview.value = null;
  }
};
const handleReject = (partner) => {
  const reason = prompt("Informe o motivo da n\xE3o sele\xE7\xE3o (ex: fora da \xE1rea de entrega, documenta\xE7\xE3o incompleta):");
  if (reason !== null) {
    servicoDoacoes.rejectSocialPartner(partner.id, reason || "N\xE3o aprovado pelo estabelecimento");
    reloadData();
    triggerNotification(`Cadastro de "${partner.name}" atualizado como n\xE3o selecionado.`, "info");
    if (selectedPartnerToReview.value?.id === partner.id) {
      selectedPartnerToReview.value = null;
    }
  }
};
const isEditingPartner = ref(false);
const editingType = ref("social");
const socialForm = ref({
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
  contactRole: "Coordenador(a)",
  acceptedCategories: ["Padaria", "Hortifr\xFAti", "Salgados"],
  hasRefrigeratedStorage: true,
  hasOwnTransport: true,
  operatingHours: "08:00 \xE0s 18:00",
  validationStatus: "validated",
  notes: "",
  active: true
});
const disposalForm = ref({
  name: "",
  cnpj: "",
  environmentalLicense: "",
  treatmentType: "COMPOSTAGEM",
  address: "",
  neighborhood: "",
  city: "Pinhalzinho",
  state: "SC",
  postalCode: "",
  whatsapp: "",
  email: "",
  contactPerson: "",
  dailyCapacityKg: 5e3,
  operatingHours: "07:30 \xE0s 17:30",
  validationStatus: "validated",
  isMunicipalUnit: true,
  municipalAuthority: "Prefeitura Municipal de Pinhalzinho",
  notes: "",
  active: true
});
const openNewSocial = () => {
  editingType.value = "social";
  socialForm.value = {
    name: "",
    cnpj: "",
    email: "",
    whatsapp: "",
    phone: "",
    address: "",
    neighborhood: "",
    city: currentStoreCity.value,
    state: "SC",
    postalCode: "",
    contactPerson: "",
    contactRole: "Coordenador(a)",
    acceptedCategories: ["Padaria", "Hortifr\xFAti", "Salgados"],
    hasRefrigeratedStorage: false,
    hasOwnTransport: false,
    operatingHours: "08:00 \xE0s 18:00",
    validationStatus: "validated",
    selectionStatus: "selected",
    notes: "",
    active: true
  };
  isEditingPartner.value = true;
};
const openEditSocial = (partner) => {
  editingType.value = "social";
  socialForm.value = { ...partner, acceptedCategories: [...partner.acceptedCategories] };
  isEditingPartner.value = true;
};
const openNewDisposal = () => {
  editingType.value = "disposal";
  disposalForm.value = {
    name: "",
    cnpj: "",
    environmentalLicense: "IMA/SC-2026-VAL",
    treatmentType: "COMPOSTAGEM",
    address: "",
    neighborhood: "",
    city: currentStoreCity.value,
    state: "SC",
    postalCode: "",
    whatsapp: "",
    email: "",
    contactPerson: "",
    dailyCapacityKg: 5e3,
    operatingHours: "07:30 \xE0s 17:30",
    validationStatus: "validated",
    isMunicipalUnit: true,
    municipalAuthority: `Prefeitura Municipal de ${currentStoreCity.value}`,
    notes: "",
    active: true
  };
  isEditingPartner.value = true;
};
const openEditDisposal = (partner) => {
  editingType.value = "disposal";
  disposalForm.value = { ...partner };
  isEditingPartner.value = true;
};
const savePartnerForm = () => {
  if (editingType.value === "social") {
    if (!socialForm.value.name?.trim()) {
      triggerNotification("Informe a Raz\xE3o Social ou Nome da Entidade.", "error");
      return;
    }
    servicoDoacoes.saveSocialPartner(socialForm.value);
    triggerNotification(`Cadastro de ${socialForm.value.name} salvo com sucesso! \u2705`, "success");
  } else {
    if (!disposalForm.value.name?.trim()) {
      triggerNotification("Informe o Nome da Unidade de Descarte.", "error");
      return;
    }
    servicoDoacoes.saveDisposalPartner(disposalForm.value);
    triggerNotification(`Cadastro de ${disposalForm.value.name} salvo com sucesso! \u{1F331}`, "success");
  }
  reloadData();
  isEditingPartner.value = false;
};
const handleDeleteSocial = (id, name) => {
  if (confirm(`Deseja remover o cadastro de "${name}"?`)) {
    servicoDoacoes.deleteSocialPartner(id);
    reloadData();
    triggerNotification(`Cadastro de "${name}" removido.`, "success");
  }
};
const handleDeleteDisposal = (id, name) => {
  if (confirm(`Deseja remover o destino de descarte "${name}"?`)) {
    servicoDoacoes.deleteDisposalPartner(id);
    reloadData();
    triggerNotification(`Destino "${name}" removido.`, "success");
  }
};
const cityOptions = [
  { label: "Pinhalzinho/SC", value: "Pinhalzinho" },
  { label: "Chapec\xF3/SC", value: "Chapec\xF3" },
  { label: "Saudades/SC", value: "Saudades" },
  { label: "Maravilha/SC", value: "Maravilha" },
  { label: "Nova Erechim/SC", value: "Nova Erechim" }
];
const statusOptions = [
  { label: "Todos os Status", value: "all" },
  { label: "\u23F3 Pendentes de Sele\xE7\xE3o", value: "pending" },
  { label: "\u2705 Aprovadas / Selecionadas", value: "validated" }
];
const treatmentOptions = [
  { label: "ATERRO SANIT\xC1RIO MUNICIPAL LICENCIADO", value: "ATERRO_SANITARIO" },
  { label: "COMPOSTAGEM ORG\xC2NICA P\xDABLICA", value: "COMPOSTAGEM" },
  { label: "BIODIGESTOR / BIOG\xC1S", value: "BIODIGESTOR" },
  { label: "PROCESSAMENTO P/ RA\xC7\xC3O ANIMAL", value: "RA\xC7\xC3O_ANIMAL" }
];
</script>

<template>
<!-- Interface principal: pesquisa e seleciona parceiros disponíveis para apoiar a destinação de alimentos. -->
  <q-dialog :model-value="true" @update:model-value="emit('close')">
    <q-card id="modal-diretorio-parceiros" class="dpm-card column no-wrap">
      <!-- HEADER -->
      <q-card-section class="dpm-header row items-center justify-between no-wrap">
        <div class="row items-center no-wrap">
          <q-avatar size="44px" color="positive" text-color="white" icon="domain" class="q-mr-md" />
          <div>
            <div class="row items-center q-gutter-x-sm">
              <div class="text-h6 text-weight-bold">Diretório &amp; Tabela de Proximidade</div>
              <q-chip dense outline color="positive" size="sm" class="text-weight-bold q-ma-none">
                Seleção a Dedo &amp; Proximidade
              </q-chip>
            </div>
            <div class="text-caption text-grey-6">
              Classificação por proximidade da sua cidade, verificação de assinaturas Gov.br e aterros disponibilizados pela prefeitura
            </div>
          </div>
        </div>
        <q-btn flat round dense icon="close" color="grey-7" @click="emit('close')" />
      </q-card-section>
      <q-separator />

      <!-- ABAS E CONTROLES -->
      <q-card-section class="row items-center justify-between q-gutter-sm">
        <div class="row items-center q-gutter-sm">
          <q-btn
            unelevated
            no-caps
            :color="activeTab === 'social' ? 'positive' : 'grey-3'"
            :text-color="activeTab === 'social' ? 'white' : 'grey-8'"
            icon="domain"
            class="text-weight-bold"
            :label="`Entidades Beneficiárias (${socialPartners.length})`"
            @click="activeTab = 'social'"
          />
          <q-btn
            unelevated
            no-caps
            :color="activeTab === 'disposal' ? 'teal' : 'grey-3'"
            :text-color="activeTab === 'disposal' ? 'white' : 'grey-8'"
            icon="eco"
            class="text-weight-bold"
            :label="`Aterro & Destinos da Prefeitura (${disposalPartners.length})`"
            @click="activeTab = 'disposal'"
          />
        </div>

        <div class="row items-center q-gutter-sm">
          <q-select
            v-if="activeTab === 'social'"
            v-model="currentStoreCity"
            :options="cityOptions"
            emit-value
            map-options
            outlined
            dense
            label="Base"
            class="dpm-select"
          >
            <template #prepend><q-icon name="place" color="positive" size="18px" /></template>
          </q-select>

          <q-select
            v-if="activeTab === 'social'"
            v-model="filterStatus"
            :options="statusOptions"
            emit-value
            map-options
            outlined
            dense
            class="dpm-select"
          />

          <q-input
            v-model="searchQuery"
            outlined
            dense
            clearable
            placeholder="Buscar por nome, cidade..."
            class="dpm-search"
          >
            <template #prepend><q-icon name="search" size="18px" /></template>
          </q-input>

          <q-btn
            v-if="activeTab === 'social'"
            unelevated
            no-caps
            color="positive"
            icon="add"
            label="Cadastrar Manualmente"
            class="text-weight-bold"
            @click="openNewSocial"
          />
          <q-btn
            v-else
            unelevated
            no-caps
            color="teal"
            icon="add"
            label="Nova Unidade Municipal"
            class="text-weight-bold"
            @click="openNewDisposal"
          />
        </div>
      </q-card-section>
      <q-separator />

      <!-- LISTA PRINCIPAL -->
      <q-card-section class="dpm-body col scroll q-gutter-y-md">
        <!-- ENTIDADES SOCIAIS (ORDENADAS POR PROXIMIDADE) -->
        <div v-if="activeTab === 'social'" class="q-gutter-y-sm">
          <q-banner dense rounded class="dpm-info text-caption">
            <template #avatar><q-icon name="navigation" color="positive" /></template>
            Tabela ordenada automaticamente pelos <strong>mais próximos de {{ currentStoreCity }}</strong>. Selecione a dedo para liberar notificações de doação.
            <template #action>
              <span class="text-weight-bold text-positive">{{ proximitySocialList.length }} entidades listadas</span>
            </template>
          </q-banner>

          <q-card
            v-for="partner in proximitySocialList"
            :key="partner.id"
            flat
            bordered
            class="partner-card"
            :class="{ 'partner-card--pending': partner.validationStatus === 'pending_review' }"
          >
            <q-card-section class="row items-center justify-between q-col-gutter-md">
              <div class="col-12 col-md">
                <!-- Nome, selos e proximidade -->
                <div class="row items-center q-gutter-sm">
                  <span class="text-subtitle1 text-weight-bold">{{ partner.name }}</span>

                  <q-badge
                    outline
                    class="q-pa-xs text-weight-bold"
                    :color="partner.isSameCity ? 'positive' : partner.distanceKm <= 15 ? 'teal' : partner.distanceKm <= 60 ? 'blue' : 'grey-7'"
                  >
                    <q-icon name="place" size="14px" class="q-mr-xs" />
                    {{ partner.proximityLabel }} ({{ partner.distanceKm }} km)
                  </q-badge>

                  <q-badge v-if="partner.validationStatus === 'validated'" outline color="positive" class="q-pa-xs">
                    <q-icon name="verified_user" size="14px" class="q-mr-xs" />
                    Selecionada &amp; Validada
                  </q-badge>
                  <q-badge
                    v-else-if="partner.validationStatus === 'pending_review'"
                    outline
                    color="warning"
                    text-color="orange-9"
                    class="q-pa-xs text-weight-bold dpm-pulse"
                  >
                    <q-icon name="schedule" size="14px" class="q-mr-xs" />
                    Pendente de Seleção (Recebida via Link)
                  </q-badge>
                  <q-badge v-else outline color="negative" class="q-pa-xs">Não Selecionada</q-badge>

                  <span class="text-caption font-mono text-grey-6">CNPJ: {{ partner.cnpj }}</span>
                </div>

                <!-- Endereço e contato -->
                <div class="row q-col-gutter-sm q-mt-xs text-caption">
                  <div class="col-12 col-md-6 row items-center no-wrap">
                    <q-icon name="place" color="positive" size="16px" class="q-mr-xs" />
                    <span>{{ partner.address }} - <strong>{{ partner.city }}/{{ partner.state }}</strong></span>
                  </div>
                  <div class="col-12 col-md-6 row items-center no-wrap">
                    <q-icon name="phone" color="positive" size="16px" class="q-mr-xs" />
                    <span>WhatsApp: <strong>{{ partner.whatsapp }}</strong> ({{ partner.contactPerson }} - {{ partner.contactRole }})</span>
                  </div>
                </div>

                <!-- Assinatura Gov.br -->
                <div v-if="partner.govSignatureFileName" class="dpm-sign row items-center justify-between q-pa-sm q-mt-sm text-caption">
                  <div class="row items-center no-wrap">
                    <q-icon name="task" color="positive" size="18px" class="q-mr-xs" />
                    <span>Termo Gov.br: <strong>{{ partner.govSignatureFileName }}</strong></span>
                    <span class="text-grey-6 font-mono q-ml-xs">({{ partner.govSignatureHash }})</span>
                  </div>
                  <span class="text-weight-bold text-positive row items-center">
                    <q-icon name="workspace_premium" size="16px" class="q-mr-xs" /> Assinado Digitalmente
                  </span>
                </div>

                <!-- Dias e horários -->
                <div class="row items-center q-gutter-sm q-mt-xs">
                  <q-chip dense square color="green-1" text-color="green-9" icon="schedule" class="q-ma-none">
                    Recebimento: <strong class="q-ml-xs">{{ partner.operatingHours || 'Segunda a Sexta, das 08:00 às 18:00' }}</strong>
                  </q-chip>
                  <q-chip dense square color="grey-3" text-color="grey-8" class="q-ma-none">Segmento: Padaria</q-chip>
                </div>
              </div>

              <!-- Ações -->
              <div class="col-12 col-md-auto column items-end q-gutter-y-xs">
                <div v-if="partner.validationStatus === 'pending_review'" class="row items-center q-gutter-x-xs">
                  <q-btn
                    unelevated
                    no-caps
                    dense
                    color="positive"
                    icon="how_to_reg"
                    label="Selecionar a Dedo"
                    class="q-px-sm text-weight-bold"
                    @click="handleApproveHandpick(partner)"
                  >
                    <q-tooltip>Aprovar e selecionar entidade a dedo</q-tooltip>
                  </q-btn>
                  <q-btn flat dense no-caps color="negative" icon="person_off" @click="handleReject(partner)">
                    <q-tooltip>Recusar cadastro</q-tooltip>
                  </q-btn>
                </div>

                <div class="row items-center q-gutter-x-xs">
                  <q-btn flat dense no-caps color="grey-8" icon="edit" label="Editar" class="q-px-sm" @click="openEditSocial(partner)">
                    <q-tooltip>Editar dados cadastrais</q-tooltip>
                  </q-btn>
                  <q-btn flat dense color="negative" icon="delete" @click="handleDeleteSocial(partner.id, partner.name)">
                    <q-tooltip>Remover entidade</q-tooltip>
                  </q-btn>
                </div>
              </div>
            </q-card-section>
          </q-card>
        </div>

        <!-- DESTINOS DE DESCARTE (ATERRO E COMPOSTAGEM MUNICIPAIS) -->
        <div v-else class="q-gutter-y-sm">
          <q-banner dense rounded class="dpm-info dpm-info--teal">
            <template #avatar><q-icon name="verified_user" color="teal" /></template>
            <div class="text-weight-bold text-teal">Unidades Oficiais de Descarte / Prefeitura Municipal:</div>
            <div class="text-caption">
              Os aterros sanitários e usinas de compostagem são disponibilizados oficialmente pelo município ou consórcio intermunicipal. Não necessitam de formulário de auto-cadastro.
            </div>
          </q-banner>

          <q-card v-for="partner in filteredDisposal" :key="partner.id" flat bordered class="partner-card partner-card--teal">
            <q-card-section class="row items-center justify-between q-col-gutter-md">
              <div class="col-12 col-md">
                <div class="row items-center q-gutter-sm">
                  <span class="text-subtitle1 text-weight-bold">{{ partner.name }}</span>

                  <q-badge v-if="partner.isMunicipalUnit" outline color="teal" class="q-pa-xs text-weight-bold">
                    <q-icon name="workspace_premium" size="14px" class="q-mr-xs" />
                    Convênio Municipal / Prefeitura
                  </q-badge>
                  <q-badge outline color="positive" class="q-pa-xs">
                    <q-icon name="task" size="14px" class="q-mr-xs" />
                    Licença: {{ partner.environmentalLicense }}
                  </q-badge>
                  <span class="text-caption font-mono text-grey-6">CNPJ: {{ partner.cnpj }}</span>
                </div>

                <div class="row q-col-gutter-sm q-mt-xs text-caption">
                  <div class="col-12 col-md-6 row items-center no-wrap">
                    <q-icon name="place" color="teal" size="16px" class="q-mr-xs" />
                    <span>{{ partner.address }} - {{ partner.city }}/{{ partner.state }}</span>
                  </div>
                  <div class="col-12 col-md-6 row items-center no-wrap">
                    <q-icon name="phone" color="teal" size="16px" class="q-mr-xs" />
                    <span>WhatsApp de Coleta: <strong>{{ partner.whatsapp }}</strong> ({{ partner.contactPerson }})</span>
                  </div>
                </div>

                <div class="row items-center q-gutter-md q-mt-xs text-caption">
                  <q-chip dense square color="green-1" text-color="green-9" class="q-ma-none text-weight-bold">
                    Tratamento: {{ partner.treatmentType }}
                  </q-chip>
                  <span class="text-grey-6">Capacidade: <strong>{{ partner.dailyCapacityKg.toLocaleString() }} kg/dia</strong></span>
                  <span v-if="partner.municipalAuthority" class="text-grey-6">
                    Órgão Gestor: <strong>{{ partner.municipalAuthority }}</strong>
                  </span>
                </div>
              </div>

              <div class="col-12 col-md-auto row items-center q-gutter-x-xs">
                <q-btn flat dense no-caps color="grey-8" icon="edit" label="Editar" class="q-px-sm" @click="openEditDisposal(partner)">
                  <q-tooltip>Editar dados cadastrais</q-tooltip>
                </q-btn>
                <q-btn flat dense color="negative" icon="delete" @click="handleDeleteDisposal(partner.id, partner.name)">
                  <q-tooltip>Remover destino</q-tooltip>
                </q-btn>
              </div>
            </q-card-section>
          </q-card>
        </div>
      </q-card-section>

      <!-- DIÁLOGO DE CADASTRO / EDIÇÃO -->
      <q-dialog v-model="isEditingPartner">
        <q-card class="dpm-edit-card column no-wrap">
          <q-card-section class="dpm-header row items-center justify-between no-wrap">
            <div class="row items-center no-wrap">
              <q-icon name="verified_user" color="positive" size="24px" class="q-mr-sm" />
              <div class="text-subtitle1 text-weight-bold">
                {{ editingType === 'social' ? 'Cadastro de Entidade Social Beneficiária' : 'Cadastro de Unidade Municipal de Descarte' }}
              </div>
            </div>
            <q-btn flat round dense icon="close" color="grey-7" @click="isEditingPartner = false" />
          </q-card-section>
          <q-separator />

          <!-- FORMULÁRIO -->
          <q-card-section class="col scroll">
            <!-- Entidade social -->
            <div v-if="editingType === 'social'" class="row q-col-gutter-md">
              <div class="col-12 col-sm-6">
                <q-input v-model="socialForm.name" outlined dense label="Razão Social / Nome da ONG *" placeholder="Ex: Mesa Brasil Sesc" />
              </div>
              <div class="col-12 col-sm-6">
                <q-input v-model="socialForm.cnpj" outlined dense label="CNPJ *" placeholder="00.000.000/0000-00" />
              </div>
              <div class="col-12 col-sm-8">
                <q-input v-model="socialForm.address" outlined dense label="Endereço de Entrega / Sede *" placeholder="Rua, número, bairro" />
              </div>
              <div class="col-12 col-sm-4">
                <q-input v-model="socialForm.city" outlined dense label="Cidade / UF" placeholder="Pinhalzinho/SC" />
              </div>
              <div class="col-12 col-sm-4">
                <q-input v-model="socialForm.whatsapp" outlined dense label="WhatsApp para Notificação *" placeholder="(49) 99999-9999" />
              </div>
              <div class="col-12 col-sm-4">
                <q-input v-model="socialForm.contactPerson" outlined dense label="Responsável pelo Recebimento" placeholder="Nome do Coordenador" />
              </div>
              <div class="col-12 col-sm-4">
                <q-input v-model="socialForm.email" type="email" outlined dense label="E-mail" placeholder="contato@entidade.org" />
              </div>
              <div class="col-12">
                <q-input
                  v-model="socialForm.operatingHours"
                  outlined
                  dense
                  label="Dias da Semana e Horários de Recebimento *"
                  placeholder="Ex: Segunda a Sexta, das 08:00 às 18:00"
                >
                  <template #prepend><q-icon name="schedule" color="positive" size="18px" /></template>
                </q-input>
              </div>
              <div class="col-12">
                <q-card flat bordered class="q-pa-sm">
                  <div class="text-caption text-weight-bold q-mb-xs">Segmento Habilitado:</div>
                  <q-chip dense color="green-1" text-color="green-9" class="text-weight-bold q-ma-none">
                    🥖 Padaria &amp; Panificação
                  </q-chip>
                </q-card>
              </div>
            </div>

            <!-- Unidade de descarte -->
            <div v-else class="row q-col-gutter-md">
              <div class="col-12 col-sm-6">
                <q-input v-model="disposalForm.name" outlined dense label="Nome do Aterro / Usina *" placeholder="Ex: Aterro Sanitário Municipal de Pinhalzinho" />
              </div>
              <div class="col-12 col-sm-6">
                <q-input v-model="disposalForm.cnpj" outlined dense label="CNPJ / Órgão Responsável *" placeholder="00.000.000/0000-00" />
              </div>
              <div class="col-12 col-sm-6">
                <q-input
                  v-model="disposalForm.environmentalLicense"
                  outlined
                  dense
                  class="font-mono"
                  label="Licença Ambiental (IMA / Órgão Competente) *"
                  placeholder="IMA/SC-2024-00918"
                />
              </div>
              <div class="col-12 col-sm-6">
                <q-select
                  v-model="disposalForm.treatmentType"
                  :options="treatmentOptions"
                  emit-value
                  map-options
                  outlined
                  dense
                  label="Tipo de Processamento Biológico"
                />
              </div>
              <div class="col-12 col-sm-8">
                <q-input v-model="disposalForm.address" outlined dense label="Endereço da Unidade *" placeholder="Rodovia, Km, Zona Rural" />
              </div>
              <div class="col-12 col-sm-4">
                <q-input v-model.number="disposalForm.dailyCapacityKg" type="number" outlined dense label="Capacidade (kg/dia)" />
              </div>
              <div class="col-12 col-sm-6">
                <q-input v-model="disposalForm.contactPerson" outlined dense label="Responsável Técnico / Contato" placeholder="Eng. Ambiental / Fiscal da Prefeitura" />
              </div>
              <div class="col-12 col-sm-6">
                <q-input v-model="disposalForm.whatsapp" outlined dense label="WhatsApp de Coleta / Descarte" placeholder="(49) 99999-9999" />
              </div>
            </div>
          </q-card-section>

          <q-separator />
          <q-card-actions align="right" class="q-pa-md">
            <q-btn flat no-caps color="grey-7" label="Cancelar" @click="isEditingPartner = false" />
            <q-btn unelevated no-caps color="positive" label="Salvar Cadastro" class="text-weight-bold" @click="savePartnerForm" />
          </q-card-actions>
        </q-card>
      </q-dialog>
    </q-card>
  </q-dialog>
</template>

<style scoped lang="scss">
.dpm-card {
  width: 100%;
  max-width: 1024px;
  max-height: 92vh;
  border-radius: 16px;
  overflow: hidden;
}
.dpm-edit-card {
  width: 100%;
  max-width: 672px;
  max-height: 85vh;
  border-radius: 16px;
  overflow: hidden;
}
.dpm-header {
  background: #f8fafc;
}
.dpm-linkbar {
  background: rgba(76, 175, 80, 0.06);
}
.dpm-body {
  min-height: 160px;
}
.dpm-select {
  min-width: 190px;
}
.dpm-search {
  min-width: 220px;
}
.dpm-info {
  background: rgba(0, 0, 0, 0.04);
  &--teal {
    background: rgba(0, 150, 136, 0.1);
  }
}
.dpm-sign {
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.04);
}
.partner-card {
  border-radius: 12px;
  transition: border-color 0.2s;
  &:hover {
    border-color: var(--q-positive);
  }
  &--teal:hover {
    border-color: var(--q-secondary);
  }
  &--pending {
    background: rgba(255, 193, 7, 0.08);
    border-color: rgba(255, 152, 0, 0.45);
  }
}
.dpm-pulse {
  animation: dpm-pulse 1.6s ease-in-out infinite;
}
@keyframes dpm-pulse {
  50% {
    opacity: 0.55;
  }
}
.body--dark {
  .dpm-header {
    background: rgba(255, 255, 255, 0.04);
  }
  .dpm-info,
  .dpm-sign {
    background: rgba(255, 255, 255, 0.06);
  }
  .partner-card--pending {
    background: rgba(255, 193, 7, 0.1);
  }
}
</style>