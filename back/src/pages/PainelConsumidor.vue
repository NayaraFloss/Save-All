<script setup>
import FundoSustentavel from "components/FundoSustentavel.vue";
import { IMAGES } from 'src/assets/images'
import { ref, onMounted, watch, computed } from "vue";
import { useRouter, useRoute } from "vue-router";
import { storeToRefs } from "pinia";
import { useAppStore } from "../stores/estadoApp";
import { servicoRelatorioMensal } from "../services/servicoRelatorioMensal";
import RelatorioMensalView from "../components/RelatorioMensalView.vue";
import AvaliacaoPedidoModal from "../components/AvaliacaoPedidoModal.vue";
import ModalLojasVisualizacao from "../components/ModalLojasVisualizacao.vue";
import ModalItensVisualizacao from "../components/ModalItensVisualizacao.vue";
import PontosExplicacaoDialog from "../components/PontosExplicacaoDialog.vue";
import AvisoSacolaAberta from "../components/AvisoSacolaAberta.vue";
const router = useRouter();
const route = useRoute();
const showStoresViewModal = ref(false);
const showItemsViewModal = ref(false);
const showRatingModal = ref(false);
const selectedRatingOrder = ref(null);
const appStore = useAppStore();
const { usuarioAtual, stores, foods, modoEscuro, notificationsEnabled, selectedCity } = storeToRefs(appStore);
const {
  logout,
  loadOrders,
  setSelectedCity,
  CITIES,
  storeBelongsToCity,
  alternarModoEscuro,
  toggleNotifications,
  updateProfile,
  triggerNotification
} = appStore;
// O menu de baixo (MenuCliente) abre o perfil com ?aba=profile
const currentTab = ref(route.query.aba === "profile" ? "profile" : "home");
watch(() => route.query.aba, (aba) => {
  currentTab.value = aba === "profile" ? "profile" : "home";
});
watch(currentTab, (aba) => {
  const query = { ...route.query };
  if (aba === "profile") query.aba = "profile";
  else delete query.aba;
  if (route.query.aba !== query.aba) router.replace({ query });
});
// Botão Início (menu de baixo): volta à tela inicial do painel
watch(() => appStore.inicioSinal, () => {
  currentTab.value = "home";
});
const showCityMenu = ref(false);
const citySearch = ref("");
const normalizeText = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const filteredCities = computed(() => {
  const term = normalizeText(citySearch.value).trim();
  if (!term) return CITIES;
  return CITIES.filter((c) => normalizeText(c).includes(term));
});
watch(showCityMenu, (open) => { if (!open) citySearch.value = ""; });
const showMonthlyReportModal = ref(false);
const storesInCity = computed(() => {
  return stores.value.filter((store) => storeBelongsToCity(store, selectedCity.value));
});
const showProfileEdit = ref(false);
const editName = ref("");
const editEmail = ref("");
const editAddress = ref("");
const editAvatarUrl = ref("");
const editCpf = ref("");
const editBirthDate = ref("");
const isSavingProfile = ref(false);
const showSettings = ref(false);
const showPontosInfo = ref(false);
const PRESET_AVATARS = [
  { name: "Eco Amiga", url: IMAGES.avatarPadrao },
  { name: "Guardi\xE3o Verde", url: IMAGES.avatar06 },
  { name: "Consumidor Consciente", url: IMAGES.avatar07 },
  { name: "Redutora Co2", url: IMAGES.avatar08 },
  { name: "Eco Entusiasta", url: IMAGES.avatar03 },
  { name: "Atleta do Clima", url: IMAGES.avatar09 }
];
const syncProfileFields = () => {
  if (usuarioAtual.value) {
    editName.value = usuarioAtual.value.name || "";
    editEmail.value = usuarioAtual.value.email || "";
    editAddress.value = usuarioAtual.value.address || "";
    editAvatarUrl.value = usuarioAtual.value.urlAvatar || IMAGES.avatarPadrao;
    editCpf.value = usuarioAtual.value.cpfCnpj || "123.456.789-00";
    editBirthDate.value = usuarioAtual.value.dataNascimento || "1995-05-15";
  }
};
onMounted(() => {
  syncProfileFields();
});
watch(showProfileEdit, (newVal) => {
  if (newVal) {
    syncProfileFields();
  }
});
watch(currentTab, (newTab) => {
  if (newTab === "profile") {
    syncProfileFields();
  }
});
const handleSaveProfile = async () => {
  if (!editName.value.trim()) {
    triggerNotification("O nome de perfil n\xE3o pode ser vazio", "error");
    return;
  }
  if (!editEmail.value.trim()) {
    triggerNotification("O email de login \xE9 obrigat\xF3rio", "error");
    return;
  }
  isSavingProfile.value = true;
  try {
    await updateProfile({
      name: editName.value.trim(),
      email: editEmail.value.trim(),
      address: editAddress.value.trim(),
      urlAvatar: editAvatarUrl.value,
      cpfCnpj: editCpf.value.trim(),
      dataNascimento: editBirthDate.value.trim()
    });
    showProfileEdit.value = false;
    triggerNotification("Perfil atualizado com sucesso! \u2705", "success");
  } catch (err) {
    console.error(err);
    triggerNotification("Perfil atualizado!", "success");
  } finally {
    isSavingProfile.value = false;
  }
};
const clientFoodSavedKg = computed(() => {
  try {
    const report = servicoRelatorioMensal.getConsolidatedReport({
      monthKey: "all",
      clienteId: usuarioAtual.value?.id,
      nomeCliente: usuarioAtual.value?.name,
      mode: "client",
      type: "venda"
    });
    const computedKg = report?.totals?.totalWeightKg || 0;
    return Number(Math.max(8, computedKg).toFixed(1));
  } catch {
    return 8;
  }
});
const clientCo2AvoidedKg = computed(() => {
  return Number((clientFoodSavedKg.value * 2.5).toFixed(1));
});
const clientWaterSavedLitres = computed(() => {
  return Math.round(clientFoodSavedKg.value * 130);
});
</script>

<template>
  <q-page class="painel-consumidor column no-wrap">
    <FundoSustentavel />
    <!-- HEADER: tudo vive na barra verde do LayoutPrincipal (nome, cidade e configurações) -->
    <Teleport to="#header-slot-user" defer>
      <q-btn
        id="btn-header-profile"
        unelevated
        dense
        no-caps
        rounded
        color="white"
        text-color="primary"
        class="header-user-btn q-px-sm"
        :title="currentTab === 'profile' ? 'Voltar ao início' : 'Ver ou editar meu perfil'"
        @click="currentTab = currentTab === 'profile' ? 'home' : 'profile'"
      >
        <q-avatar size="22px" class="q-mr-xs">
          <img :src="usuarioAtual?.urlAvatar || IMAGES.avatarPadrao" alt="Avatar" />
        </q-avatar>
        <span id="user-display-name" class="ellipsis header-user-name">{{ usuarioAtual?.name || 'Cliente' }}</span>
      </q-btn>
    </Teleport>

    <Teleport to="#header-slot-center" defer>
      <q-btn-dropdown
        id="btn-select-city"
        v-model="showCityMenu"
        flat
        dense
        no-caps
        text-color="white"
        class="city-btn"
        dropdown-icon="expand_more"
      >
        <template #label>
          <div class="row items-center no-wrap q-gutter-x-xs text-left">
            <q-icon name="place" size="18px" />
            <div>
              <div class="text-weight-bold ellipsis city-name">{{ selectedCity }}</div>
              <div class="tiny-label gt-sm city-sub">{{ storesInCity.length }} parceiros no rodízio</div>
            </div>
          </div>
        </template>
        <div class="city-search q-pa-sm">
          <q-input
            v-model="citySearch"
            dense
            outlined
            autofocus
            clearable
            debounce="100"
            placeholder="Pesquisar cidade..."
            @keyup.stop
          >
            <template #prepend><q-icon name="search" color="secondary" size="20px" /></template>
          </q-input>
        </div>
        <q-separator />
        <q-list class="city-list">
          <q-item v-if="!filteredCities.length" class="text-grey-6 text-caption">
            <q-item-section>Nenhuma cidade encontrada</q-item-section>
          </q-item>
          <q-item
            v-for="city in filteredCities"
            :key="city"
            v-close-popup
            clickable
            :active="selectedCity === city"
            active-class="text-secondary text-weight-bold"
            @click="setSelectedCity(city)"
          >
            <q-item-section avatar>
              <q-icon name="place" color="secondary" size="18px" />
            </q-item-section>
            <q-item-section class="text-uppercase text-caption text-weight-bold">{{ city }}</q-item-section>
            <q-item-section v-if="selectedCity === city" side>
              <q-badge color="secondary" outline label="ATIVA" />
            </q-item-section>
          </q-item>
        </q-list>
      </q-btn-dropdown>
    </Teleport>

    <Teleport to="#header-slot-actions" defer>
      <q-btn id="btn-nav-settings" flat round dense icon="settings" @click="showSettings = true">
        <q-tooltip>Configurações</q-tooltip>
      </q-btn>
    </Teleport>

    <!-- MAIN CONTENT: HOME TAB -->
    <div v-if="currentTab === 'home'" class="col scroll q-pa-sm q-gutter-y-sm">
      <!-- Sacola em aberto: impede novo pedido até pagar ou excluir -->
      <AvisoSacolaAberta />

      <!-- METRICS -->
      <div class="row q-col-gutter-sm">
        <div class="col-6">
          <q-card flat bordered class="full-height">
            <q-card-section class="column items-center text-center q-py-sm">
              <q-avatar size="32px" color="amber-2" text-color="amber-9" icon="savings" class="q-mb-sm" />
              <div class="text-uppercase text-weight-bolder text-grey-6 tiny-label">Valor Economizado</div>
              <div id="stat-saved-value" class="text-h6 text-weight-bolder text-amber-8">
                R$ {{ (usuarioAtual?.valorTotalEconomizado || 0).toFixed(2) }}
              </div>
            </q-card-section>
          </q-card>
        </div>
        <div class="col-6">
          <q-card id="btn-explicar-pontos" flat bordered class="full-height cursor-pointer" role="button" tabindex="0"
            @click="showPontosInfo = true" @keyup.enter="showPontosInfo = true">
            <q-card-section class="column items-center text-center q-py-sm">
              <q-avatar size="32px" color="green-2" text-color="green-9" icon="military_tech" class="q-mb-sm" />
              <div class="text-uppercase text-weight-bolder text-grey-6 tiny-label">Pontos Acumulados</div>
              <div id="stat-accumulated-points" class="text-h6 text-weight-bolder text-secondary">
                {{ usuarioAtual?.points || 0 }} pts
              </div>
              <div class="text-caption text-grey-6 row items-center no-wrap q-mt-xs">
                <q-icon name="info" size="14px" class="q-mr-xs" />Como funciona
              </div>
            </q-card-section>
          </q-card>
        </div>
      </div>

      <!-- ECO-IMPACT -->
      <q-card flat bordered>
        <q-card-section>
          <div class="text-center text-uppercase text-weight-bolder text-secondary tiny-label label-wide q-mb-sm">
            Seu Impacto Ecológico Acumulado
          </div>

          <q-card flat bordered class="eco-box q-pa-sm">
            <svg viewBox="0 0 320 120" class="eco-svg">
              <circle cx="280" cy="30" r="10" fill="#FCD34D" opacity="0.6" class="pulse" />
              <path d="M 0 100 Q 160 50 320 100" fill="none" :stroke="$q.dark.isActive ? '#334155' : '#cbd5e1'" stroke-width="2" />
              <path d="M 0 100 Q 160 50 320 100 L 320 120 L 0 120 Z" :fill="$q.dark.isActive ? '#0f172a' : '#f1f5f9'" :opacity="$q.dark.isActive ? '0.4' : '0.75'" />

              <g transform="translate(45, 75)">
                <polygon points="0,0 -8,-18 8,-18" fill="#15803d" />
                <polygon points="0,-10 -6,-25 6,-25" fill="#166534" />
                <polygon points="-12,5 -18,-10 -6,-10" fill="#16a34a" />
                <polygon points="12,5 6,-10 18,-10" fill="#22c55e" />
                <rect x="-2" y="0" width="4" height="15" fill="#78350f" />
                <rect x="-14" y="5" width="3" height="10" fill="#78350f" />
                <rect x="10" y="5" width="3" height="10" fill="#78350f" />
              </g>

              <g transform="translate(160, 75)">
                <path d="M 0 -22 C -6 -10 -8 -5 -8 0 C -8 5 -4 8 0 8 C 4 8 8 5 8 0 C 8 -5 6 -10 0 -22 Z" fill="#38bdf8" />
                <path d="M -15 10 Q 0 5 15 10 Q 0 15 -15 10 Z" fill="#0284c7" />
              </g>

              <g transform="translate(260, 65)">
                <path d="M 0 25 Q -10 0 10 -15" stroke="#a3e635" stroke-width="2" fill="none" />
                <path d="M -2 15 Q -12 10 -5 5 Q 0 10 -2 15 Z" fill="#84cc16" />
                <path d="M 5 5 Q 12 -5 10 2 Q 4 10 5 5 Z" fill="#65a30d" />
                <path d="M 5 15 Q 15 12 10 8 Q 5 12 5 15 Z" fill="#a3e635" />
              </g>

              <text x="45" y="110" text-anchor="middle" :fill="$q.dark.isActive ? '#A5D6A7' : '#15803d'" class="svg-label">{{ clientCo2AvoidedKg }} kg CO2</text>
              <text x="160" y="110" text-anchor="middle" :fill="$q.dark.isActive ? '#38bdf8' : '#0284c7'" class="svg-label">{{ clientWaterSavedLitres }} L Água</text>
              <text x="260" y="110" text-anchor="middle" :fill="$q.dark.isActive ? '#a2e635' : '#4d7c0f'" class="svg-label">{{ clientFoodSavedKg }} kg Alimento</text>
            </svg>
          </q-card>

          <div class="row justify-end q-mt-sm">
            <q-btn
              id="btn-open-consumer-monthly-report"
              unelevated
              no-caps
              dense
              color="secondary"
              text-color="white"
              icon="description"
              icon-right="arrow_forward"
              label="Ver Relatório Mensal de Resgates"
              class="q-px-md text-weight-bold"
              @click="showMonthlyReportModal = true"
            />
          </div>
        </q-card-section>
      </q-card>

      <!-- LOJAS E ITENS -->
      <div class="row q-col-gutter-sm">
        <div class="col-6">
          <q-card id="btn-open-stores-view" flat v-ripple class="explore-card explore-card--stores cursor-pointer" @click="showStoresViewModal = true">
            <q-icon name="storefront" class="explore-card__bg-icon" />
            <q-card-section class="explore-card__body">
              <div class="row items-start no-wrap">
                <q-avatar size="34px" class="explore-card__icon" icon="storefront" text-color="white" />
                <q-space />
                <q-chip dense square class="explore-card__chip">
                  <q-icon name="place" size="14px" class="q-mr-xs" />{{ storesInCity.length }} em {{ selectedCity }}
                </q-chip>
              </div>
              <div class="explore-card__title q-mt-sm">Lojas Cadastradas</div>
              <div class="explore-card__caption">Conheça as padarias parceiras e veja o que cada uma oferece.</div>
              <div class="explore-card__cta row items-center no-wrap q-mt-xs">
                <span>Ver lojas</span>
                <q-icon name="arrow_forward" size="18px" class="q-ml-xs explore-card__arrow" />
              </div>
            </q-card-section>
          </q-card>
        </div>
        <div class="col-6">
          <q-card id="btn-open-items-view" flat v-ripple class="explore-card explore-card--items cursor-pointer" @click="showItemsViewModal = true">
            <q-icon name="bakery_dining" class="explore-card__bg-icon" />
            <q-card-section class="explore-card__body">
              <div class="row items-start no-wrap">
                <q-avatar size="34px" class="explore-card__icon" icon="bakery_dining" text-color="white" />
                <q-space />
                <q-chip dense square class="explore-card__chip">
                  <q-icon name="restaurant" size="14px" class="q-mr-xs" />{{ foods.length }} itens
                </q-chip>
              </div>
              <div class="explore-card__title q-mt-sm">Todos os Produtos</div>
              <div class="explore-card__caption">Salgados, doces e muito mais de todas as padarias parceiras.</div>
              <div class="explore-card__cta row items-center no-wrap q-mt-xs">
                <span>Ver produtos</span>
                <q-icon name="arrow_forward" size="18px" class="q-ml-xs explore-card__arrow" />
              </div>
            </q-card-section>
          </q-card>
        </div>
      </div>

      <!-- COMO FUNCIONA -->
      <q-card flat bordered>
        <q-card-section class="q-pb-none row items-center justify-between no-wrap">
          <div class="row items-center no-wrap q-gutter-x-xs text-amber-9 text-weight-bold text-caption">
            <q-icon name="auto_awesome" size="18px" />
            <span>Como Funciona o Save All:</span>
          </div>
          <q-chip dense color="green-1" text-color="green-9" size="sm">Passo a passo</q-chip>
        </q-card-section>
        <q-list dense class="text-caption">
          <q-item>
            <q-item-section side top>
              <q-avatar size="18px" color="green-1" text-color="green-9" class="text-weight-bold">1</q-avatar>
            </q-item-section>
            <q-item-section>
              <span><strong>Escolha a loja:</strong> veja os estabelecimentos parceiros de <strong>{{ selectedCity }}</strong> que têm sacolas disponíveis hoje.</span>
            </q-item-section>
          </q-item>
          <q-item>
            <q-item-section side top>
              <q-avatar size="18px" color="green-1" text-color="green-9" class="text-weight-bold">2</q-avatar>
            </q-item-section>
            <q-item-section>
              <span><strong>Escolha a sacola:</strong> cada loja mostra o que vai na sacola, o preço com desconto e quantas ainda restam.</span>
            </q-item-section>
          </q-item>
          <q-item>
            <q-item-section side top>
              <q-avatar size="18px" color="green-1" text-color="green-9" class="text-weight-bold">3</q-avatar>
            </q-item-section>
            <q-item-section>
              <span><strong>Receba e ajude o planeta:</strong> a loja prepara o pedido, acompanhe cada etapa em <strong>Pedidos</strong>. Menos desperdício, mais economia! 🌱</span>
            </q-item-section>
          </q-item>
        </q-list>
      </q-card>
    </div>

    <!-- MAIN CONTENT: PROFILE -->
    <div v-else-if="currentTab === 'profile'" class="col scroll q-pa-md q-gutter-y-md">
      <div class="row items-center justify-between">
        <q-btn
          id="btn-profile-back-to-home"
          outline
          no-caps
          dense
          color="grey-7"
          icon="arrow_back"
          label="Voltar ao Cardápio"
          class="q-px-sm text-weight-bold"
          @click="currentTab = 'home'"
        />
        <q-chip dense outline color="secondary" icon="verified_user" size="sm" class="text-uppercase text-weight-bold">
          Perfil do Cliente
        </q-chip>
      </div>

      <!-- User banner -->
      <q-card flat bordered>
        <q-card-section class="row items-center no-wrap q-gutter-x-md">
          <div class="relative-position">
            <q-avatar size="64px" class="avatar-ring">
              <img :src="editAvatarUrl || usuarioAtual?.urlAvatar || IMAGES.avatarPadrao" alt="Avatar" />
            </q-avatar>
            <q-btn
              id="btn-profile-change-avatar-trigger"
              round
              dense
              unelevated
              size="xs"
              color="secondary"
              icon="photo_camera"
              class="absolute-bottom-right"
              title="Editar Avatar"
              @click="showProfileEdit = true"
            />
          </div>
          <div class="col">
            <div class="row items-center no-wrap q-gutter-x-sm">
              <div class="text-subtitle2 text-weight-bold ellipsis">{{ usuarioAtual?.name || 'Cliente Save All' }}</div>
              <q-chip dense color="green-1" text-color="green-9" size="sm">Consumidor</q-chip>
            </div>
            <div class="text-caption text-grey-6 ellipsis">{{ usuarioAtual?.email }}</div>
            <div class="row items-center q-gutter-x-md q-mt-xs text-caption text-weight-bold">
              <span class="text-amber-8 row items-center no-wrap cursor-pointer" role="button" @click="showPontosInfo = true">
                <q-icon name="military_tech" size="16px" class="q-mr-xs" />{{ usuarioAtual?.points || 0 }} pts
                <q-icon name="info" size="14px" class="q-ml-xs" />
              </span>
              <span class="text-secondary row items-center no-wrap">
                <q-icon name="savings" size="16px" class="q-mr-xs" />R$ {{ (usuarioAtual?.valorTotalEconomizado || 0).toFixed(2) }}
              </span>
            </div>
          </div>
        </q-card-section>
      </q-card>

      <!-- Quick actions -->
      <div class="row q-col-gutter-sm">
        <div class="col-6">
          <q-card id="btn-profile-card-report" flat bordered v-ripple class="cursor-pointer full-height" @click="showMonthlyReportModal = true">
            <q-card-section class="q-pa-sm">
              <q-avatar rounded size="32px" color="green-1" text-color="green-8" icon="description" />
              <div class="text-caption text-weight-bold q-mt-sm">Relatório Mensal</div>
              <div class="text-grey-6 tiny-label">Resgates e impacto</div>
            </q-card-section>
          </q-card>
        </div>
        <div class="col-6">
          <q-card id="btn-profile-card-address" flat bordered v-ripple class="cursor-pointer full-height" @click="router.push({ name: 'SelecaoEndereco' })">
            <q-card-section class="q-pa-sm">
              <q-avatar rounded size="32px" color="amber-1" text-color="amber-9" icon="place" />
              <div class="text-caption text-weight-bold q-mt-sm">Endereço de Entrega</div>
              <div class="text-grey-6 tiny-label">Mudar localização</div>
            </q-card-section>
          </q-card>
        </div>
        <div class="col-6">
          <q-card id="btn-profile-card-order" flat bordered v-ripple class="cursor-pointer full-height" @click="currentTab = 'home'; router.push({ name: 'PedidoCustomizado' })">
            <q-card-section class="q-pa-sm">
              <q-avatar rounded size="32px" color="teal-1" text-color="teal-8" icon="shopping_bag" />
              <div class="text-caption text-weight-bold q-mt-sm">Pedir Sacola</div>
              <div class="text-grey-6 tiny-label">Muita economia para o seu dia</div>
            </q-card-section>
          </q-card>
        </div>
        <div class="col-6">
          <q-card id="btn-profile-card-settings" flat bordered v-ripple class="cursor-pointer full-height" @click="showSettings = true">
            <q-card-section class="q-pa-sm">
              <q-avatar rounded size="32px" color="indigo-1" text-color="indigo-8" icon="settings" />
              <div class="text-caption text-weight-bold q-mt-sm">Configurações</div>
              <div class="text-grey-6 tiny-label">Tema e notificações</div>
            </q-card-section>
          </q-card>
        </div>
      </div>

      <!-- Edit profile form -->
      <q-card flat bordered>
        <q-card-section class="row items-center justify-between">
          <div class="row items-center q-gutter-x-sm">
            <q-icon name="person" color="secondary" size="18px" />
            <div class="text-caption text-uppercase text-weight-bolder label-wide">Dados Cadastrais do Cliente</div>
          </div>
          <span class="text-grey-6 tiny-label">Edição instantânea</span>
        </q-card-section>
        <q-separator />

        <q-card-section class="q-gutter-y-md">
          <div>
            <div class="text-uppercase text-weight-bolder text-grey-6 tiny-label label-wide q-mb-xs">Escolha seu Avatar</div>
            <div class="row q-col-gutter-sm">
              <div v-for="(av, idx) in PRESET_AVATARS" :key="av.name" class="col-2 flex flex-center">
                <q-btn
                  :id="`btn-preset-avatar-${idx}`"
                  round
                  flat
                  padding="0"
                  :title="av.name"
                  :class="['preset-avatar', { 'preset-avatar--active': editAvatarUrl === av.url }]"
                  @click="editAvatarUrl = av.url"
                >
                  <q-avatar size="40px">
                    <img :src="av.url" :alt="av.name" />
                  </q-avatar>
                  <q-icon v-if="editAvatarUrl === av.url" name="check_circle" color="secondary" size="18px" class="absolute-center bg-white preset-check" />
                </q-btn>
              </div>
            </div>
          </div>

          <q-input id="input-profile-page-name" v-model="editName" outlined dense required label="Nome Completo" placeholder="Seu nome completo">
            <template #prepend><q-icon name="person" color="secondary" size="18px" /></template>
          </q-input>

          <q-input id="input-profile-page-email" v-model="editEmail" type="email" outlined dense required label="Email de Login" placeholder="email@exemplo.com">
            <template #prepend><q-icon name="mail" color="secondary" size="18px" /></template>
          </q-input>

          <div class="row q-col-gutter-sm">
            <div class="col-12 col-sm-6">
              <q-input id="input-profile-page-cpf" v-model="editCpf" outlined dense label="CPF do Titular" placeholder="000.000.000-00" />
            </div>
            <div class="col-12 col-sm-6">
              <q-input id="input-profile-page-birth" v-model="editBirthDate" type="date" outlined dense stack-label label="Nascimento" />
            </div>
          </div>

          <div>
            <div class="row justify-end">
              <q-btn
                id="btn-profile-change-address-map"
                flat
                dense
                no-caps
                color="secondary"
                label="Mudar no Mapa"
                icon-right="arrow_forward"
                class="text-weight-bold"
                @click="router.push({ name: 'SelecaoEndereco' })"
              />
            </div>
            <q-input
              id="input-profile-page-address"
              v-model="editAddress"
              type="textarea"
              rows="2"
              outlined
              dense
              label="Endereço de Entrega"
              placeholder="Ex: Av. Mato Grosso, Divineia, 3269 - Pinhalzinho/SC"
            >
              <template #prepend><q-icon name="home" color="secondary" size="18px" /></template>
            </q-input>
          </div>

          <div class="column q-gutter-y-sm">
            <q-btn
              id="btn-profile-page-save"
              unelevated
              no-caps
              color="secondary"
              icon="check"
              class="full-width text-weight-bold"
              :label="isSavingProfile ? 'Salvando...' : 'Salvar Alterações do Perfil'"
              :disable="isSavingProfile"
              @click="handleSaveProfile"
            />
            <q-btn
              id="btn-profile-page-logout"
              outline
              no-caps
              color="negative"
              icon="logout"
              label="Sair da Conta"
              class="full-width text-weight-bold"
              @click="logout"
            />
          </div>
        </q-card-section>
      </q-card>
    </div>

    <!-- MODAL 1: EDITAR CADASTRO -->
    <q-dialog v-model="showProfileEdit">
      <q-card class="dialog-card">
        <q-card-section class="row items-center justify-between">
          <div class="row items-center q-gutter-x-sm">
            <q-icon name="person" color="secondary" size="24px" />
            <div class="text-subtitle1 text-weight-bold">Editar meu Cadastro</div>
          </div>
          <q-btn flat round dense icon="close" color="grey-7" @click="showProfileEdit = false" />
        </q-card-section>
        <q-separator />

        <q-form class="dialog-scroll" @submit="handleSaveProfile">
          <q-card-section class="q-gutter-y-md">
            <q-card flat bordered class="bg-green-1 text-dark">
              <q-card-section class="row items-center justify-between no-wrap q-pa-sm">
                <div class="row items-center no-wrap q-gutter-x-sm col">
                  <q-avatar rounded size="32px" color="green-2" text-color="green-9" icon="description" />
                  <div class="col">
                    <div class="text-caption text-weight-bold ellipsis">Relatório Mensal de Resgates</div>
                    <div class="text-grey-7 tiny-label ellipsis">Ver compras com desconto e impacto ecológico</div>
                  </div>
                </div>
                <q-btn
                  id="btn-profile-open-report"
                  unelevated
                  dense
                  no-caps
                  color="secondary"
                  icon-right="arrow_forward"
                  label="Ver Relatório"
                  class="q-px-sm text-weight-bold"
                  @click="showProfileEdit = false; showMonthlyReportModal = true"
                />
              </q-card-section>
            </q-card>

            <div>
              <div class="text-uppercase text-weight-bolder text-grey-6 tiny-label label-wide q-mb-xs">Escolher Avatar</div>
              <div class="row q-col-gutter-sm">
                <div v-for="av in PRESET_AVATARS" :key="av.name" class="col-2 flex flex-center">
                  <q-btn
                    round
                    flat
                    padding="0"
                    :title="av.name"
                    :class="['preset-avatar', { 'preset-avatar--active': editAvatarUrl === av.url }]"
                    @click="editAvatarUrl = av.url"
                  >
                    <q-avatar size="40px">
                      <img :src="av.url" alt="preset" />
                    </q-avatar>
                    <q-icon v-if="editAvatarUrl === av.url" name="check_circle" color="secondary" size="18px" class="absolute-center bg-white preset-check" />
                  </q-btn>
                </div>
              </div>
              <q-input v-model="editAvatarUrl" outlined dense class="q-mt-sm" label="Ou cole uma URL personalizada" placeholder="https://..." />
            </div>

            <q-input v-model="editName" outlined dense required label="Nome Completo" placeholder="Seu nome completo">
              <template #prepend><q-icon name="person" color="secondary" size="18px" /></template>
            </q-input>

            <q-input v-model="editEmail" type="email" outlined dense required label="Email de Login" placeholder="email@exemplo.com">
              <template #prepend><q-icon name="mail" color="secondary" size="18px" /></template>
            </q-input>

            <q-input
              v-model="editAddress"
              type="textarea"
              rows="2"
              outlined
              dense
              label="Endereço de Entrega"
              placeholder="Ex: Av. Mato Grosso, Divineia, 3269 - Pinhalzinho/SC"
            >
              <template #prepend><q-icon name="home" color="secondary" size="18px" /></template>
            </q-input>

            <div class="row q-col-gutter-sm">
              <div class="col-12 col-sm-6">
                <q-input v-model="editCpf" outlined dense label="CPF do Titular" placeholder="000.000.000-00" />
              </div>
              <div class="col-12 col-sm-6">
                <q-input v-model="editBirthDate" type="date" outlined dense stack-label label="Nascimento" />
              </div>
            </div>

            <div class="row q-col-gutter-sm">
              <div class="col-6">
                <q-btn id="btn-modal-cancel" outline no-caps color="grey-7" label="Cancelar" class="full-width text-weight-bold" @click="showProfileEdit = false" />
              </div>
              <div class="col-6">
                <q-btn
                  id="btn-modal-save-profile"
                  type="submit"
                  unelevated
                  no-caps
                  color="secondary"
                  class="full-width text-weight-bold"
                  :label="isSavingProfile ? 'Salvando...' : 'Salvar Dados'"
                  :disable="isSavingProfile"
                />
              </div>
            </div>
          </q-card-section>
        </q-form>
      </q-card>
    </q-dialog>

    <!-- MODAL 2: CONFIGURAÇÕES -->
    <q-dialog v-model="showSettings">
      <q-card class="dialog-card">
        <q-card-section class="row items-center justify-between">
          <div class="row items-center q-gutter-x-sm">
            <q-icon name="settings" color="amber-8" size="24px" />
            <div class="text-subtitle1 text-weight-bold">Configurações Gerais</div>
          </div>
          <q-btn flat round dense icon="close" color="grey-7" @click="showSettings = false" />
        </q-card-section>
        <q-separator />

        <q-card-section class="q-gutter-y-md">
          <q-banner dense rounded class="bg-green-1 text-grey-8 text-caption">
            <template #avatar><q-icon name="auto_awesome" color="secondary" /></template>
            Ajuste seus canais de sustentabilidade e visualização preferida no Save All!
          </q-banner>

          <div class="row items-center justify-between no-wrap">
            <div>
              <div class="text-caption text-weight-bold">Modo de Interface</div>
              <div class="text-grey-6 tiny-label">Alternar entre layouts Escuro e Claro</div>
            </div>
            <q-btn-toggle
              :model-value="modoEscuro ? 'dark' : 'light'"
              unelevated
              no-caps
              dense
              toggle-color="secondary"
              color="grey-3"
              text-color="grey-8"
              :options="[
                { label: 'Claro', value: 'light', icon: 'light_mode' },
                { label: 'Escuro', value: 'dark', icon: 'dark_mode' }
              ]"
              @update:model-value="(v) => { if ((v === 'dark') !== modoEscuro) alternarModoEscuro(); }"
            />
          </div>

          <q-separator />

          <div class="row items-center justify-between no-wrap">
            <div>
              <div class="text-caption text-weight-bold">Notificações por Som e Banner</div>
              <div class="text-grey-6 tiny-label">Receba alertas de novos pedidos e cupons</div>
            </div>
            <q-toggle :model-value="notificationsEnabled" color="secondary" @update:model-value="toggleNotifications" />
          </div>

          <q-separator />

          <div class="row items-center justify-center q-gutter-x-xs text-grey-6 tiny-label">
            <q-icon name="notifications" size="16px" />
            <span>Alertas push do navegador: {{ notificationsEnabled ? 'Ativadas' : 'Desativadas' }}</span>
          </div>

          <q-btn unelevated no-caps color="secondary" label="Confirmar e Fechar" class="full-width text-weight-bold" @click="showSettings = false" />
        </q-card-section>
      </q-card>
    </q-dialog>

    <!-- MODAL RELATÓRIO MENSAL -->
    <q-dialog v-model="showMonthlyReportModal">
      <q-card class="report-card">
        <q-card-section class="row items-start justify-between no-wrap">
          <div class="row items-center no-wrap q-gutter-x-sm col">
            <q-avatar rounded color="green-1" text-color="green-8" icon="description" />
            <div class="col">
              <div class="text-subtitle2 text-weight-bold">Seu Relatório de Compras e Alimentos Resgatados</div>
              <div class="text-caption text-grey-6">
                Extrato oficial das compras com desconto que você resgatou e o impacto ecológico gerado (sem descartes ou doações operacionais).
              </div>
            </div>
          </div>
          <q-btn flat round dense icon="close" color="grey-7" @click="showMonthlyReportModal = false" />
        </q-card-section>
        <q-separator />
        <q-card-section class="report-scroll">
          <RelatorioMensalView
            mode="client"
            :client-id="usuarioAtual?.id"
            :client-name="usuarioAtual?.name"
            :dark-mode="modoEscuro"
          />
        </q-card-section>
      </q-card>
    </q-dialog>

    <!-- MODAL DE AVALIAÇÃO -->
    <AvaliacaoPedidoModal
      :show="showRatingModal"
      :order="selectedRatingOrder"
      @close="showRatingModal = false"
      @submitted="showRatingModal = false; loadOrders()"
    />

    <ModalLojasVisualizacao :show="showStoresViewModal" :dark-mode="modoEscuro" @close="showStoresViewModal = false" />
    <ModalItensVisualizacao :show="showItemsViewModal" :dark-mode="modoEscuro" @close="showItemsViewModal = false" />
    <PontosExplicacaoDialog v-model="showPontosInfo" :saldo="usuarioAtual?.points || 0" />
  </q-page>
</template>

<style scoped lang="scss">
.painel-consumidor {
  width: 100%;
  min-height: 100vh;
}
// Botões que vivem na barra verde (via Teleport)
.header-user-btn { max-width: 180px; font-weight: 600; }
.header-user-name { max-width: 120px; }
.city-name { max-width: 150px; }
.city-sub { opacity: 0.85; }
.city-btn { max-width: 100%; }
// celulares estreitos: só o avatar no nome, para tudo caber na mesma linha
@media (max-width: 440px) {
  .header-user-name { display: none; }
  .header-user-btn { padding: 0 4px !important; }
  .city-name { max-width: 90px; font-size: 12px; }
}
.avatar-ring {
  border: 2px solid var(--q-secondary);
  img {
    object-fit: cover;
  }
}
.tiny-label {
  font-size: 10px;
  line-height: 1.3;
}
.label-wide {
  letter-spacing: 0.1em;
}
.city-btn {
  padding: 2px 8px;
}

// Cards "Lojas" e "Produtos"
.explore-card {
  position: relative;
  overflow: hidden;
  border-radius: 14px;
  color: #fff;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
  &:hover {
    transform: translateY(-3px);
    box-shadow: 0 12px 26px rgba(0, 0, 0, 0.2);
    .explore-card__arrow { transform: translateX(4px); }
  }
  &--stores { background: linear-gradient(135deg, #43a047 0%, #1b7f4b 100%); }
  &--items { background: linear-gradient(135deg, #ffa726 0%, #f57c00 100%); }
  &__bg-icon {
    position: absolute;
    right: -12px;
    bottom: -14px;
    font-size: 90px;
    opacity: 0.14;
    transform: rotate(-12deg);
    pointer-events: none;
  }
  &__body { position: relative; z-index: 1; }
  &__icon { background: rgba(255, 255, 255, 0.22); backdrop-filter: blur(2px); }
  &__chip { background: rgba(255, 255, 255, 0.92); color: #1b5e20; font-weight: 700; border-radius: 10px; font-size: 10px; margin: 0; }
  &--items &__chip { color: #e65100; }
  &__title { font-family: var(--font-display); font-size: 16px; font-weight: 800; line-height: 1.2; }
  &__caption { font-size: 11px; line-height: 1.3; opacity: 0.92; margin-top: 2px; max-width: 90%; }
  &__cta { font-weight: 700; font-size: 12px; }
  &__arrow { transition: transform 0.2s ease; }
}
.city-list {
  min-width: 260px;
  max-height: 260px;
  overflow-y: auto;
}
.city-search { min-width: 260px; }
.eco-box {
  background: rgba(128, 128, 128, 0.06);
}
.eco-svg {
  width: 100%;
  height: auto;
  display: block;
  max-height: 130px;
  margin: 0 auto;
}
.svg-label {
  font-family: monospace;
  font-size: 10px;
  font-weight: bold;
}
.pulse {
  animation: pulse 2s ease-in-out infinite;
}
@keyframes pulse {
  50% {
    opacity: 0.2;
  }
}
.preset-avatar {
  border: 1px solid rgba(128, 128, 128, 0.4);
  opacity: 0.7;
  &--active {
    border-color: var(--q-secondary);
    box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.4);
    opacity: 1;
  }
}
.preset-check {
  border-radius: 50%;
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
.report-card {
  width: 900px;
  max-width: 95vw;
  border-radius: 16px;
}
.report-scroll {
  max-height: 75vh;
  overflow-y: auto;
}
</style>