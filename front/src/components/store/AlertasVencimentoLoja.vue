<script setup>
// Exibe alertas de validade e permite encaminhar itens vencidos para doação ou descarte.
import { computed, ref, watch } from "vue";
import { resumoEstoque } from "../../utils/lotesVencidos";
import { ordenarPorUrgenciaDeVencimento, calcularPrecificacaoDinamica } from "../../utils/precificacaoDinamica";

// Entradas recebidas do componente pai que configuram os dados e opções desta tela.
const props = defineProps({
  foods: { type: Array, default: () => [] },
  lojaId: { type: String, default: "" },
  modoEscuro: Boolean
});
// Eventos emitidos para o componente pai executar as ações fora desta interface.
const emit = defineEmits(["edit-item", "destinar-item", "destinar-itens"]);

// Itens ativos da loja, do mais perto de vencer para o mais longe.
const itens = computed(() =>
  ordenarPorUrgenciaDeVencimento(
    props.foods.filter((f) => f.lojaId === props.lojaId && f.status === "active")
  )
);
// Itens que venceram sem ser vendidos: precisam ir para doação ou descarte.
const vencidos = computed(() =>
  props.foods
    .filter((f) => f.lojaId === props.lojaId && f.status !== "sold_out" && !(Number(f.quantity) <= 0))
    .map((f) => ({
      ...f,
      calc: calcularPrecificacaoDinamica(f.dataFabricacao, f.dataValidade, Number(f.precoOriginal) || 0, {}),
      vencidasQtd: resumoEstoque(f).vencidas,
    }))
    // Entra na lista quem tem sacolas vencidas, mesmo que outros lotes do item ainda estejam bons
    .filter((f) => f.vencidasQtd > 0 || f.calc.vencido)
);
// Seleção de vários vencidos para doar ou descartar juntos
const selecionados = ref([]);
// Observa mudanças relevantes e sincroniza o estado local com os dados recebidos.
watch(vencidos, (lista) => {
  const ids = new Set(lista.map((i) => i.id));
  selecionados.value = selecionados.value.filter((id) => ids.has(id));
});
const todosSelecionados = computed({
  get: () => vencidos.value.length > 0 && selecionados.value.length === vencidos.value.length,
  set: (marcar) => (selecionados.value = marcar ? vencidos.value.map((i) => i.id) : []),
});
// Ações da tela validam a interação e encaminham as alterações ou eventos necessários.
const destinarSelecionados = () => {
  emit("destinar-itens", vencidos.value.filter((i) => selecionados.value.includes(i.id)));
};
const emAlerta = computed(() => itens.value.filter((i) => i.calc.faixaIndex >= 1));
const semAlerta = computed(() => itens.value.length - emAlerta.value.length);
const lista = computed(() => emAlerta.value.slice(0, 5));

const dinheiro = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const cor = (faixa) => (faixa >= 3 ? "negative" : faixa === 2 ? "warning" : "amber-8");
const prazo = (calc) => {
  const horas = calc.diasRestantes * 24;
  if (horas < 1) return "menos de 1 h";
  if (horas < 24) return `${Math.floor(horas)} h restantes`;
  return `${Math.ceil(calc.diasRestantes)} dia(s) restantes`;
};
</script>

<template>
<!-- Interface principal: exibe alertas de validade e permite encaminhar itens vencidos para doação ou descarte. -->
  <q-card flat bordered :dark="modoEscuro">
    <q-card-section class="q-pb-sm">
      <div class="row items-center justify-between no-wrap">
        <div>
          <div class="text-subtitle2 text-weight-bold text-uppercase">Atenção ao vencimento</div>
          <div class="text-caption text-grey-6">Os itens mais perto de vencer saem primeiro para os clientes</div>
        </div>
        <q-badge v-if="vencidos.length" color="negative" class="text-weight-bold">{{ vencidos.length }} vencido(s)</q-badge>
        <q-badge v-else-if="emAlerta.length" color="warning" text-color="black" class="text-weight-bold">{{ emAlerta.length }} em alerta</q-badge>
        <q-badge v-else color="positive" outline class="text-weight-bold">Tudo em dia</q-badge>
      </div>
    </q-card-section>

    <q-separator :dark="modoEscuro" />

    <!-- Vencidos e não vendidos: ir para doação ou descarte -->
    <q-banner v-if="vencidos.length" dense :class="modoEscuro ? 'bg-red-10 text-red-2' : 'bg-red-1 text-red-10'">
      <template #avatar><q-icon name="warning" color="negative" /></template>
      <div class="text-weight-bold">Venceram sem ser vendidos. Encaminhe para doação ou descarte.</div>
    </q-banner>
    <div v-if="vencidos.length > 1" class="row items-center justify-between q-px-md q-py-xs">
      <q-checkbox v-model="todosSelecionados" dense label="Selecionar todos" :dark="modoEscuro" />
      <q-btn
        unelevated
        dense
        no-caps
        size="sm"
        color="negative"
        icon="volunteer_activism"
        :label="`Doar / Descartar selecionados (${selecionados.length})`"
        :disable="!selecionados.length"
        class="text-weight-bold q-px-sm"
        @click="destinarSelecionados"
      />
    </div>
    <q-list v-if="vencidos.length" separator :dark="modoEscuro">
      <q-item v-for="item in vencidos" :key="item.id">
        <q-item-section v-if="vencidos.length > 1" side>
          <q-checkbox v-model="selecionados" :val="item.id" dense :dark="modoEscuro" />
        </q-item-section>
        <q-item-section avatar>
          <q-avatar square size="40px"><img :src="item.image" :alt="item.name" /></q-avatar>
        </q-item-section>
        <q-item-section>
          <q-item-label class="text-weight-bold">{{ item.name }}</q-item-label>
          <q-item-label caption>
            <template v-if="item.vencidasQtd > 0 && item.vencidasQtd < (Number(item.quantity) || 0)">
              {{ item.vencidasQtd }} un. vencida(s) · {{ (Number(item.quantity) || 0) - item.vencidasQtd }} un. ainda boas (ficam no estoque)
            </template>
            <template v-else>
              Venceu em {{ new Date(item.dataValidade + 'T12:00:00').toLocaleDateString('pt-BR') }} · {{ item.vencidasQtd || item.quantity || 1 }} un
            </template>
          </q-item-label>
        </q-item-section>
        <q-item-section side>
          <q-btn
            unelevated
            dense
            no-caps
            size="sm"
            color="negative"
            icon="volunteer_activism"
            label="Doar / Descartar"
            class="text-weight-bold"
            @click="emit('destinar-item', item)"
          />
        </q-item-section>
      </q-item>
    </q-list>
    <q-separator v-if="vencidos.length" :dark="modoEscuro" />

    <q-card-section v-if="!lista.length && !vencidos.length" class="text-center text-caption text-grey-6 q-py-md">
      {{ itens.length ? `Nenhum item em alerta. ${semAlerta} item(ns) com validade tranquila.` : 'Nenhum item publicado ainda.' }}
    </q-card-section>

    <q-list v-else separator :dark="modoEscuro">
      <q-item v-for="item in lista" :key="item.id" clickable v-ripple @click="emit('edit-item', item)">
        <q-item-section avatar>
          <q-avatar square size="40px"><img :src="item.image" :alt="item.name" /></q-avatar>
        </q-item-section>
        <q-item-section>
          <q-item-label class="text-weight-bold">{{ item.name }}</q-item-label>
          <q-item-label caption>{{ item.calc.faixaNome }} · {{ item.calc.percentualConsumido }}% do prazo · {{ prazo(item.calc) }}</q-item-label>
        </q-item-section>
        <q-item-section side>
          <q-badge :color="cor(item.calc.faixaIndex)" class="text-weight-bold">-{{ item.calc.percentualDesconto }}%</q-badge>
          <q-item-label caption class="q-mt-xs">{{ dinheiro(item.calc.precoComDesconto) }}</q-item-label>
        </q-item-section>
        <q-item-section side>
          <q-btn
            flat
            dense
            round
            size="sm"
            color="negative"
            icon="volunteer_activism"
            @click.stop="emit('destinar-item', item)"
          >
            <q-tooltip>Doar ou descartar antes de vencer</q-tooltip>
          </q-btn>
        </q-item-section>
      </q-item>
    </q-list>
  </q-card>
</template>
