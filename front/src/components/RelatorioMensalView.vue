<script setup>
import { ref, computed, onMounted, watch } from "vue";
import {
  servicoRelatorioMensal
} from "../services/servicoRelatorioMensal";
import { storeToRefs } from "pinia";
import ExplicacaoImpacto from "./ExplicacaoImpacto.vue";
import { CITIES } from "../utils/cidades";
import { useAppStore } from "../stores/estadoApp";
const props = defineProps({ mode: { type: String, default: "client" }, storeIdOrName: String, clienteId: String, nomeCliente: String, modoEscuro: { type: Boolean, default: false }, compact: { type: Boolean, default: false } });
const { orders, usuarioAtual } = storeToRefs(useAppStore());
const mesAtual = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};
// Na loja o resumo é acumulado; mês e categoria são escolhidos só ao baixar o PDF
const selectedMonthKey = ref(props.mode === "store" ? "all" : mesAtual());
const selectedStoreFilter = ref(props.storeIdOrName || "all");
// Master: o relat\u00f3rio \u00e9 filtrado por cidade (e n\u00e3o mais por loja)
const selectedCityFilter = ref("all");
const selectedTypeFilter = ref("all");
const searchQuery = ref("");
const availableMonths = computed(() => {
  return servicoRelatorioMensal.getAvailableMonths(props.mode);
});
const autoSelectClientMonth = () => {
  try {
    if (props.mode === "client") {
      const activeCid = props.clienteId || usuarioAtual.value?.id;
      const activeCname = props.nomeCliente || usuarioAtual.value?.name;
      const currentRep = servicoRelatorioMensal.getConsolidatedReport({
        monthKey: selectedMonthKey.value,
        clienteId: activeCid,
        nomeCliente: activeCname,
        mode: "client",
        type: "venda"
      });
      if (currentRep && currentRep.events && currentRep.events.length === 0) {
        const allRep = servicoRelatorioMensal.getConsolidatedReport({
          monthKey: "all",
          clienteId: activeCid,
          nomeCliente: activeCname,
          mode: "client",
          type: "venda"
        });
        if (allRep && allRep.events && allRep.events.length > 0) {
          selectedMonthKey.value = allRep.events[0].monthKey || "all";
        } else {
          selectedMonthKey.value = "all";
        }
      }
    }
  } catch (e) {
    console.warn("Error in autoSelectClientMonth:", e);
    selectedMonthKey.value = "all";
  }
};
onMounted(() => {
  autoSelectClientMonth();
});
watch(() => props.clienteId, () => {
  autoSelectClientMonth();
});
const reportData = computed(() => {
  try {
    void orders.value.length;
    const activeCid = props.clienteId || (props.mode === "client" ? usuarioAtual.value?.id : void 0);
    const activeCname = props.nomeCliente || (props.mode === "client" ? usuarioAtual.value?.name : void 0);
    return servicoRelatorioMensal.getConsolidatedReport({
      monthKey: selectedMonthKey.value,
      storeIdOrName: props.mode === "store" ? props.storeIdOrName : props.mode === "master" ? "all" : selectedStoreFilter.value,
      cityFilter: props.mode === "master" && selectedCityFilter.value !== "all" ? selectedCityFilter.value : void 0,
      clienteId: props.mode === "client" ? activeCid : void 0,
      nomeCliente: props.mode === "client" ? activeCname : void 0,
      type: props.mode === "client" ? "venda" : selectedTypeFilter.value !== "all" ? selectedTypeFilter.value : void 0,
      mode: props.mode
    });
  } catch (e) {
    console.warn("Error computing reportData:", e);
    return {
      monthKey: "all",
      monthLabel: "Todos os Per\xEDodos",
      totals: { totalWeightKg: 0, totalCo2AvoidedKg: 0, totalWaterSavedLitres: 0, totalFinancialValueRs: 0, salesCount: 0, salesWeightKg: 0, salesValueRs: 0, donationsCount: 0, donationsWeightKg: 0, donationsEstimatedValueRs: 0, disposalsCount: 0, disposalsWeightKg: 0, totalEventsCount: 0 },
      events: [],
      percentages: { salesPercent: 0, donationsPercent: 0, disposalsPercent: 0 }
    };
  }
});
const filteredEvents = computed(() => {
  let list = reportData.value.events;
  if (props.mode === "client") {
    list = list.filter((e) => e.type === "venda");
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim();
    list = list.filter(
      (e) => e.title.toLowerCase().includes(q) || e.nomeLoja.toLowerCase().includes(q) || e.destinationName && e.destinationName.toLowerCase().includes(q) || e.nomeCliente && e.nomeCliente.toLowerCase().includes(q) || e.notes && e.notes.toLowerCase().includes(q)
    );
  }
  return list;
});
const showPdfDialog = ref(false);
const pdfMonths = ref([mesAtual()]);
const pdfType = ref("all");
const pdfMonthOptions = computed(() =>
  availableMonths.value.map((m) => (m.key === "all" ? { ...m, label: "Todos os meses" } : m))
);
const onPdfMonthsChange = (val) => {
  const anterior = pdfMonths.value;
  if (val.includes("all") && !anterior.includes("all")) pdfMonths.value = ["all"];
  else if (val.length > 1 && val.includes("all")) pdfMonths.value = val.filter((k) => k !== "all");
  else pdfMonths.value = val.length ? val : ["all"];
};
// Período do PDF: por dia (intervalo de datas), por mês ou por ano
const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const pdfPeriodo = ref("mes");
const pdfPeriodoOpcoes = [
  { label: "Por dia", value: "dia", icon: "today" },
  { label: "Por mês", value: "mes", icon: "calendar_month" },
  { label: "Por ano", value: "ano", icon: "event_note" }
];
const pdfDiaInicio = ref(hojeIso());
const pdfDiaFim = ref(hojeIso());
const pdfErroDias = computed(() => {
  if (pdfPeriodo.value !== "dia") return "";
  if (!pdfDiaInicio.value || !pdfDiaFim.value) return "Informe as duas datas.";
  return pdfDiaInicio.value > pdfDiaFim.value ? "A data inicial deve ser antes da final." : "";
});
const pdfAnoOpcoes = computed(() => {
  const anos = new Set([String(new Date().getFullYear())]);
  availableMonths.value.forEach((m) => {
    if (m.key && m.key !== "all") anos.add(String(m.key).slice(0, 4));
  });
  return [...anos].sort().reverse().map((ano) => ({ label: ano, value: ano }));
});
const pdfAnos = ref([String(new Date().getFullYear())]);
const confirmarPdfLoja = () => {
  if (pdfErroDias.value) return;
  const keys = pdfMonths.value.filter((k) => k !== "all");
  const periodo =
    pdfPeriodo.value === "dia"
      ? { dataInicio: pdfDiaInicio.value, dataFim: pdfDiaFim.value }
      : pdfPeriodo.value === "ano"
        ? { anos: pdfAnos.value.length ? pdfAnos.value : void 0 }
        : { monthKeys: keys.length ? keys : void 0 };
  const relatorio = servicoRelatorioMensal.getConsolidatedReport({
    monthKey: "all",
    ...periodo,
    storeIdOrName: props.storeIdOrName,
    type: pdfType.value !== "all" ? pdfType.value : void 0,
    mode: "store"
  });
  servicoRelatorioMensal.downloadPdfReport(relatorio, "store", props.storeIdOrName || "Estabelecimento Parceiro");
  showPdfDialog.value = false;
};
const handleDownloadPdf = () => {
  if (props.mode === "store") {
    showPdfDialog.value = true;
    return;
  }
  const entityName = props.mode === "master" ? selectedCityFilter.value !== "all" ? `Cidade: ${selectedCityFilter.value}` : "SaveAll Master - Rede Consolidada" : props.mode === "store" ? props.storeIdOrName || "Estabelecimento Parceiro" : props.nomeCliente || usuarioAtual.value?.name || "Consumidor SaveAll";
  servicoRelatorioMensal.downloadPdfReport(reportData.value, props.mode, entityName);
};
const cityOptions = [
  { label: "\u{1F30E} Todas as Cidades (Consolidado da Rede)", value: "all" },
  ...CITIES.map((c) => ({ label: `\u{1F4CD} ${c}`, value: c }))
];
const typeOptions = [
  { label: "Todos os Eventos (Vendas, Doações e Descartes)", value: "all" },
  { label: "🛒 Apenas Vendas com Desconto", value: "venda" },
  { label: "🤝 Apenas Doações Sociais (Lei 14.016)", value: "doacao" },
  { label: "♻️ Apenas Descartes Ecológicos", value: "descarte" }
];
const eventTone = (event) => {
  if (props.mode === "client" || event.type === "venda") return "emerald";
  return event.type === "doacao" ? "sky" : "amber";
};
</script>

<template>
  <q-card flat bordered class="relatorio-mensal" :class="compact ? 'q-pa-sm' : 'q-pa-md'">
    <div class="column q-gutter-y-md">
      <!-- CABEÇALHO DO RELATÓRIO MENSAL -->
      <div class="row items-center justify-between q-col-gutter-sm">
        <div class="col-12 col-sm">
          <div class="row items-center q-gutter-sm">
            <q-badge color="green-1" text-color="green-9" class="font-mono text-weight-bold text-uppercase q-pa-xs">
              Relatório Mensal de Sustentabilidade
            </q-badge>
            <span v-if="mode === 'master'" class="text-caption text-weight-medium text-grey-7 row items-center">
              <q-icon name="location_on" size="14px" class="q-mr-xs" />
              {{ selectedCityFilter === 'all' ? 'Consolidado Todas as Cidades' : `Cidade: ${selectedCityFilter}` }}
            </span>
            <span v-else-if="mode === 'store'" class="text-caption text-weight-medium text-grey-7 row items-center">
              <q-icon name="business" size="14px" class="q-mr-xs" />
              {{ storeIdOrName || 'Sua Loja' }}
            </span>
            <span v-else class="text-caption text-weight-medium text-positive row items-center">
              <q-icon name="shopping_bag" size="14px" class="q-mr-xs" />
              Seus Resgates Pessoais
            </span>
          </div>

          <div class="text-subtitle1 text-weight-bold row items-center no-wrap q-mt-sm">
            <q-icon name="description" color="positive" size="22px" class="q-mr-sm" />
            <span>{{ mode === 'client' ? 'Relatório de Compras e Alimentos Resgatados' : 'Relatório Mensal de Destinação & Sustentabilidade' }}</span>
          </div>

          <div class="text-caption text-grey-6 q-mt-xs report-intro">
            <template v-if="mode === 'master'">
              Todo evento de venda, doação ou descarte alimenta este relatório em tempo real. Visualize o total de todas as lojas ou filtre por cidade.
            </template>
            <template v-else-if="mode === 'store'">
              Total consolidado do que seu estabelecimento evitou de desperdício através das vendas com desconto, doações para entidades sociais e descartes sustentáveis.
            </template>
            <template v-else>
              Extrato oficial exclusivo de todas as suas compras com desconto no mês, detalhando os alimentos que você resgatou e o impacto ambiental evitado (sem exibição de descartes ou doações operacionais).
            </template>
          </div>

          <!-- Lógica do cálculo de CO₂ e água (discreto) -->
          <ExplicacaoImpacto :peso-kg="Number(reportData.totals.totalWeightKg) || 0" class="q-mt-xs" />
        </div>

        <!-- BOTÃO DE DOWNLOAD PDF -->
        <div class="col-12 col-sm-auto no-print">
          <q-btn
            unelevated
            no-caps
            color="positive"
            icon="download"
            label="Baixar PDF"
            class="text-weight-bold"
            @click="handleDownloadPdf"
          />
        </div>
      </div>

      <!-- GRÁFICOS DE RESUMO (vindos da tela que usa o relatório) -->
      <template v-if="$slots.graficos">
        <q-separator />
        <div class="column q-gutter-y-xs">
          <div class="text-caption text-uppercase text-weight-bold text-grey-7">Resumo acumulado</div>
          <slot name="graficos" />
        </div>
      </template>

      <q-separator />

      <!-- CONTROLES & FILTROS (MÊS, ESTABELECIMENTO, TIPO) -->
      <div v-if="mode !== 'store'" class="row q-col-gutter-sm no-print">
        <div class="col-12 col-sm-6 col-md-4">
          <q-select
            v-model="selectedMonthKey"
            :options="availableMonths"
            option-value="key"
            option-label="label"
            emit-value
            map-options
            outlined
            dense
            label="Mês de Referência"
          >
            <template #prepend><q-icon name="calendar_month" color="positive" size="18px" /></template>
          </q-select>
        </div>

        <div v-if="mode === 'master'" class="col-12 col-sm-6 col-md-4">
          <q-select
            v-model="selectedCityFilter"
            :options="cityOptions"
            emit-value
            map-options
            outlined
            dense
            label="Filtrar por Cidade"
          >
            <template #prepend><q-icon name="location_on" color="primary" size="18px" /></template>
          </q-select>
        </div>

        <div v-if="mode !== 'client'" class="col-12 col-sm-6 col-md-4">
          <q-select
            v-model="selectedTypeFilter"
            :options="typeOptions"
            emit-value
            map-options
            outlined
            dense
            label="Pilar de Destinação"
          >
            <template #prepend><q-icon name="filter_alt" color="amber-8" size="18px" /></template>
          </q-select>
        </div>
      </div>

      <!-- CARDS DE MÉTRICAS PRINCIPAIS DE IMPACTO (não aparecem na visão da loja) -->
      <div v-if="mode !== 'store'" class="row q-col-gutter-sm">
        <div class="col-6 col-md-3">
          <div class="metric-card tone-emerald print-metric-card">
            <div class="row items-center justify-between no-wrap">
              <span class="metric-title font-mono">{{ mode === 'client' ? 'Alimento Resgatado' : 'Total Evitado / Destinado' }}</span>
              <q-icon name="emoji_events" size="18px" class="metric-icon" />
            </div>
            <div class="metric-value q-mt-sm">
              {{ reportData.totals.totalWeightKg }} <span class="text-caption text-weight-medium">kg</span>
            </div>
            <div class="text-caption text-grey-6">
              {{ mode === 'client' ? `${reportData.totals.salesCount} compras no período` : `${reportData.totals.totalEventsCount} eventos no período` }}
            </div>
          </div>
        </div>

        <div class="col-6 col-md-3">
          <div class="metric-card tone-sky print-metric-card">
            <div class="row items-center justify-between no-wrap">
              <span class="metric-title font-mono">CO₂ Retido fora do Aterro</span>
              <q-icon name="eco" size="18px" class="metric-icon" />
            </div>
            <div class="metric-value q-mt-sm">
              {{ reportData.totals.totalCo2AvoidedKg }} <span class="text-caption text-weight-medium">kg CO₂e</span>
            </div>
            <div class="text-caption text-grey-6">Fator 2.5 kg CO2 por kg alimento</div>
          </div>
        </div>

        <div class="col-6 col-md-3">
          <div class="metric-card tone-cyan print-metric-card">
            <div class="row items-center justify-between no-wrap">
              <span class="metric-title font-mono">Água Preservada</span>
              <q-icon name="water_drop" size="18px" class="metric-icon" />
            </div>
            <div class="metric-value q-mt-sm">
              {{ reportData.totals.totalWaterSavedLitres }} <span class="text-caption text-weight-medium">Litros</span>
            </div>
            <div class="text-caption text-grey-6">Pegada hídrica retida</div>
          </div>
        </div>

        <div class="col-6 col-md-3">
          <div class="metric-card tone-amber print-metric-card">
            <div class="row items-center justify-between no-wrap">
              <span class="metric-title font-mono">{{ mode === 'client' ? 'Economia em Compras' : 'Impacto Financeiro' }}</span>
              <q-icon name="trending_up" size="18px" class="metric-icon" />
            </div>
            <div class="metric-value q-mt-sm">
              R$ {{ (mode === 'client' ? reportData.totals.salesValueRs : reportData.totals.totalFinancialValueRs).toFixed(2) }}
            </div>
            <div class="text-caption text-grey-6">
              {{ mode === 'client' ? 'Total poupado com descontos' : 'Resgates e valor social' }}
            </div>
          </div>
        </div>
      </div>

      <!-- OS 3 PILARES (VENDAS, DOAÇÕES, DESCARTES) (só na visão master) -->
      <div v-if="mode === 'master'" class="column q-gutter-y-sm">
        <div class="row items-center justify-between q-col-gutter-xs">
          <div class="text-caption text-weight-bold text-uppercase text-grey-7 font-mono">
            Os 3 Pilares de Destinação (Vendas, Doações e Descartes)
          </div>
          <div class="text-caption text-grey-6">
            Aproveitamento: {{ reportData.percentages.salesPercent + reportData.percentages.donationsPercent }}% Salvos · {{ reportData.percentages.disposalsPercent }}% Compostados
          </div>
        </div>

        <!-- Barra proporcional de destinação -->
        <div class="row no-wrap pillars-bar">
          <div class="bar-segment bg-green-5" :style="{ width: `${reportData.percentages.salesPercent}%` }">
            <q-tooltip>{{ `Vendas com Desconto: ${reportData.percentages.salesPercent}%` }}</q-tooltip>
          </div>
          <div class="bar-segment bg-light-blue-5" :style="{ width: `${reportData.percentages.donationsPercent}%` }">
            <q-tooltip>{{ `Doações Sociais: ${reportData.percentages.donationsPercent}%` }}</q-tooltip>
          </div>
          <div class="bar-segment bg-amber-5" :style="{ width: `${reportData.percentages.disposalsPercent}%` }">
            <q-tooltip>{{ `Descartes Sustentáveis: ${reportData.percentages.disposalsPercent}%` }}</q-tooltip>
          </div>
        </div>

        <div class="row q-col-gutter-sm">
          <!-- 1. Vendas com Desconto -->
          <div class="col-12 col-sm-4">
            <div class="metric-card tone-emerald print-metric-card">
              <div class="row items-center justify-between">
                <span class="text-caption text-weight-bold metric-icon row items-center">
                  <q-icon name="shopping_bag" size="16px" class="q-mr-xs" />
                  1. Vendas com Desconto
                </span>
                <span class="text-caption font-mono text-weight-bold">{{ reportData.percentages.salesPercent }}%</span>
              </div>
              <div class="row items-baseline justify-between q-mt-sm">
                <span class="text-subtitle1 text-weight-bold">
                  {{ reportData.totals.salesWeightKg }} <span class="text-caption text-grey-6">kg</span>
                </span>
                <span class="text-caption font-mono text-weight-bold">R$ {{ reportData.totals.salesValueRs.toFixed(2) }}</span>
              </div>
              <div class="text-caption text-grey-6 q-mt-xs">
                {{ reportData.totals.salesCount }} pedidos resgatados por consumidores finais na plataforma.
              </div>
            </div>
          </div>

          <!-- 2. Doações Sociais -->
          <div class="col-12 col-sm-4">
            <div class="metric-card tone-sky print-metric-card">
              <div class="row items-center justify-between">
                <span class="text-caption text-weight-bold metric-icon row items-center">
                  <q-icon name="volunteer_activism" size="16px" class="q-mr-xs" />
                  2. Doações Sociais
                </span>
                <span class="text-caption font-mono text-weight-bold">{{ reportData.percentages.donationsPercent }}%</span>
              </div>
              <div class="row items-baseline justify-between q-mt-sm">
                <span class="text-subtitle1 text-weight-bold">
                  {{ reportData.totals.donationsWeightKg }} <span class="text-caption text-grey-6">kg</span>
                </span>
                <span class="text-caption font-mono text-weight-bold">Lei 14.016</span>
              </div>
              <div class="text-caption text-grey-6 q-mt-xs">
                {{ reportData.totals.donationsCount }} lotes doados para entidades sociais credenciadas com termo digital.
              </div>
            </div>
          </div>

          <!-- 3. Descartes Sustentáveis -->
          <div class="col-12 col-sm-4">
            <div class="metric-card tone-amber print-metric-card">
              <div class="row items-center justify-between">
                <span class="text-caption text-weight-bold metric-icon row items-center">
                  <q-icon name="recycling" size="16px" class="q-mr-xs" />
                  3. Descartes Ecológicos
                </span>
                <span class="text-caption font-mono text-weight-bold">{{ reportData.percentages.disposalsPercent }}%</span>
              </div>
              <div class="row items-baseline justify-between q-mt-sm">
                <span class="text-subtitle1 text-weight-bold">
                  {{ reportData.totals.disposalsWeightKg }} <span class="text-caption text-grey-6">kg</span>
                </span>
                <span class="text-caption font-mono text-weight-bold">Compostagem</span>
              </div>
              <div class="text-caption text-grey-6 q-mt-xs">
                {{ reportData.totals.disposalsCount }} descartes destinados para usinas de compostagem e biodigestores.
              </div>
            </div>
          </div>
        </div>
      </div>

      <q-separator v-if="mode !== 'store'" />

      <!-- EXTRATO ANALÍTICO DOS EVENTOS (na loja, só aparece no PDF) -->
      <div v-if="mode !== 'store'" class="column q-gutter-y-sm">
        <div class="row items-center justify-between q-col-gutter-sm">
          <div class="col-12 col-sm">
            <div class="text-subtitle2 text-weight-bold row items-center q-gutter-x-sm">
              <span>{{ mode === 'client' ? 'Histórico de Compras que Evitaram Desperdício' : 'Extrato de Eventos Auditados do Período' }}</span>
              <q-badge color="grey-3" text-color="grey-8" class="font-mono" :label="`${filteredEvents.length} registros`" />
            </div>
            <div v-if="mode !== 'client'" class="text-caption text-grey-6">
              Cada evento registrado alimenta automaticamente este relatório mensal.
            </div>
          </div>

          <!-- Busca rápida no extrato -->
          <div v-if="mode !== 'client'" class="col-12 col-sm-5 no-print">
            <q-input
              v-model="searchQuery"
              outlined
              dense
              clearable
              placeholder="Buscar por item, local, data..."
            >
              <template #prepend><q-icon name="search" size="18px" /></template>
            </q-input>
          </div>
        </div>

        <!-- LISTA DE EVENTOS -->
        <q-list v-if="filteredEvents.length > 0" class="events-list column q-gutter-y-sm">
          <q-item
            v-for="event in filteredEvents"
            :key="event.id"
            class="event-item"
          >
            <q-item-section avatar top>
              <q-avatar rounded size="32px" :class="`tone-${eventTone(event)} event-avatar`">
                <q-icon
                  :name="(mode === 'client' || event.type === 'venda') ? 'shopping_bag' : (event.type === 'doacao' ? 'volunteer_activism' : 'recycling')"
                  size="18px"
                />
              </q-avatar>
            </q-item-section>

            <q-item-section>
              <q-item-label>
                <q-badge
                  :class="`tone-${eventTone(event)} event-badge`"
                  class="font-mono text-uppercase text-weight-bold q-mr-sm"
                >
                  {{ mode === 'client' ? 'Compra c/ Desconto' : (event.type === 'venda' ? 'Venda c/ Desconto' : (event.type === 'doacao' ? 'Doação Social' : 'Descarte Ecológico')) }}
                </q-badge>
                <span class="text-caption text-grey-6 font-mono">{{ event.dateFormatted }}</span>
              </q-item-label>
              <q-item-label class="text-weight-bold q-mt-xs">{{ event.title }}</q-item-label>
              <q-item-label caption>
                <span class="text-weight-medium">{{ mode === 'client' ? 'Estabelecimento:' : 'Origem:' }} {{ event.nomeLoja }}</span>
                <span v-if="mode !== 'client' && event.destinationName"> · Destino: <strong>{{ event.destinationName }}</strong></span>
                <span v-if="event.notes"> · {{ event.notes }}</span>
              </q-item-label>
            </q-item-section>

            <!-- Dados numéricos de impacto -->
            <q-item-section side top class="text-right">
              <div class="text-caption text-weight-bold font-mono text-positive">{{ event.weightKg }} kg evitados</div>
              <div class="text-caption text-grey-6 font-mono">
                <span>{{ event.co2AvoidedKg }} kg CO₂</span>
                <span> · </span>
                <span>{{ event.waterSavedLitres }} L H₂O</span>
                <span v-if="event.valueRs && event.valueRs > 0"> · <strong>R$ {{ event.valueRs.toFixed(2) }}</strong></span>
              </div>
            </q-item-section>
          </q-item>
        </q-list>

        <!-- ESTADO VAZIO -->
        <div v-else class="empty-state text-center q-pa-lg">
          <q-icon name="description" color="positive" size="32px" class="opacity-40" />
          <div class="text-caption text-weight-medium q-mt-sm">
            {{ mode === 'client' ? 'Nenhuma compra com desconto encontrada para este mês.' : 'Nenhum evento encontrado para os filtros selecionados neste mês.' }}
          </div>
          <div class="text-caption text-grey-6 q-mt-xs empty-hint">
            {{ mode === 'client' ? 'Você pode selecionar "Todos os Meses" para ver todo o seu histórico consolidado de compras e alimentos salvos.' : 'Assim que uma venda, doação ou descarte for realizado, ele aparecerá aqui automaticamente no relatório.' }}
          </div>
          <q-btn
            v-if="selectedMonthKey !== 'all'"
            flat
            no-caps
            dense
            color="positive"
            icon-right="arrow_forward"
            class="q-mt-sm q-px-sm text-weight-bold"
            label="Ver Histórico Geral (Todos os Meses)"
            @click="selectedMonthKey = 'all'"
          />
        </div>
      </div>

      <!-- RODAPÉ OPCIONAL (ex.: certificados emitidos) -->
      <template v-if="$slots.rodape">
        <q-separator />
        <slot name="rodape" />
      </template>
    </div>

    <!-- ESCOLHA DO PERÍODO E CATEGORIA DO PDF (loja) -->
    <q-dialog v-model="showPdfDialog">
      <q-card class="pdf-dialog">
        <q-card-section class="q-pb-sm">
          <div class="text-subtitle2 text-weight-bold">Baixar PDF</div>
          <div class="text-caption text-grey-7">O extrato detalhado dos eventos aparece só no PDF.</div>
        </q-card-section>
        <q-card-section class="column no-wrap q-gutter-y-sm q-pt-none">
          <q-btn-toggle
            v-model="pdfPeriodo"
            :options="pdfPeriodoOpcoes"
            spread
            no-caps
            unelevated
            dense
            toggle-color="positive"
            color="grey-2"
            text-color="grey-8"
            class="pdf-periodo"
          />
          <div v-if="pdfPeriodo === 'dia'" class="row q-col-gutter-sm">
            <div class="col-6">
              <q-input v-model="pdfDiaInicio" type="date" outlined dense stack-label label="De" :max="hojeIso()" />
            </div>
            <div class="col-6">
              <q-input v-model="pdfDiaFim" type="date" outlined dense stack-label label="Até" :max="hojeIso()" />
            </div>
            <div v-if="pdfErroDias" class="col-12 text-caption text-negative">{{ pdfErroDias }}</div>
          </div>
          <q-select
            v-else-if="pdfPeriodo === 'ano'"
            v-model="pdfAnos"
            :options="pdfAnoOpcoes"
            emit-value
            map-options
            multiple
            use-chips
            outlined
            dense
            label="Anos"
            hint="Vazio = todos os anos"
          />
          <q-select
            v-else
            :model-value="pdfMonths"
            :options="pdfMonthOptions"
            option-value="key"
            option-label="label"
            emit-value
            map-options
            multiple
            use-chips
            outlined
            dense
            label="Meses"
            @update:model-value="onPdfMonthsChange"
          />
          <q-select
            v-model="pdfType"
            :options="typeOptions"
            emit-value
            map-options
            outlined
            dense
            label="Categoria"
          />
        </q-card-section>
        <q-card-actions align="right" class="q-pt-none">
          <q-btn flat no-caps dense color="grey-7" label="Cancelar" @click="showPdfDialog = false" />
          <q-btn unelevated no-caps dense color="positive" icon="download" label="Baixar" class="q-px-md" :disable="!!pdfErroDias" @click="confirmarPdfLoja" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-card>
</template>

<style scoped lang="scss">
.pdf-dialog {
  width: 100%;
  max-width: 400px;
}
.pdf-periodo {
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 8px;
  overflow: hidden;
}

.report-intro {
  max-width: 672px;
}

.metric-card {
  height: 100%;
  padding: 14px;
  border-radius: 12px;
  border: 1px solid var(--tone-border);
  background: var(--tone-bg);
}

.metric-title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--tone-fg);
}

.metric-icon {
  color: var(--tone-fg);
}

.metric-value {
  font-size: 22px;
  font-weight: 800;
  line-height: 1.2;
}

.tone-emerald {
  --tone-fg: #047857;
  --tone-bg: rgba(16, 185, 129, 0.1);
  --tone-border: rgba(16, 185, 129, 0.3);
}

.tone-sky {
  --tone-fg: #0369a1;
  --tone-bg: rgba(14, 165, 233, 0.1);
  --tone-border: rgba(14, 165, 233, 0.3);
}

.tone-cyan {
  --tone-fg: #0e7490;
  --tone-bg: rgba(6, 182, 212, 0.1);
  --tone-border: rgba(6, 182, 212, 0.3);
}

.tone-amber {
  --tone-fg: #b45309;
  --tone-bg: rgba(245, 158, 11, 0.1);
  --tone-border: rgba(245, 158, 11, 0.3);
}

.event-avatar,
.event-badge {
  background: var(--tone-bg);
  color: var(--tone-fg);
}

.event-badge {
  font-size: 9px;
}

.pillars-bar {
  height: 12px;
  overflow: hidden;
  border-radius: 6px;
  background: rgba(100, 116, 139, 0.2);
}

.bar-segment {
  height: 100%;
  transition: width 0.5s;
}

.events-list {
  max-height: 380px;
  overflow-y: auto;
}

.event-item {
  border-radius: 12px;
  border: 1px solid rgba(100, 116, 139, 0.25);
  background: rgba(100, 116, 139, 0.05);
}

.empty-state {
  border-radius: 12px;
  border: 1px dashed rgba(100, 116, 139, 0.4);
}

.empty-hint {
  max-width: 384px;
  margin-left: auto;
  margin-right: auto;
}

.opacity-40 {
  opacity: 0.4;
}

.body--dark {
  .tone-emerald {
    --tone-fg: #6ee7b7;
  }

  .tone-sky {
    --tone-fg: #7dd3fc;
  }

  .tone-cyan {
    --tone-fg: #67e8f9;
  }

  .tone-amber {
    --tone-fg: #fcd34d;
  }
}
</style>