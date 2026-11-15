<script setup>
import { ref, computed } from "vue";
import { FATORES_IMPACTO, FONTES_IMPACTO, co2FaoKgPorKg, aguaFaoLPorKg } from "../utils/fatoresImpacto";

const props = defineProps({
  // Peso total exibido na tela; usado só para o exemplo de cálculo (se vazio, usa 1 kg)
  pesoKg: { type: Number, default: 0 }
});

const aberto = ref(false);
const fmt = (n, casas = 1) =>
  Number(n).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

const pesoExemplo = computed(() => (props.pesoKg > 0 ? props.pesoKg : 1));
const co2Exemplo = computed(() => pesoExemplo.value * FATORES_IMPACTO.co2KgPorKg);
const aguaExemplo = computed(() => Math.round(pesoExemplo.value * FATORES_IMPACTO.aguaLPorKg));
</script>

<template>
  <span class="explicacao-impacto">
    <q-btn
      flat
      dense
      no-caps
      size="sm"
      color="grey-7"
      icon="info_outline"
      label="Como calculamos CO₂ e água?"
      class="text-weight-regular"
      type="button"
      @click="aberto = true"
    />

    <q-dialog v-model="aberto">
      <q-card class="explicacao-card">
        <q-card-section class="row items-center no-wrap q-pb-sm">
          <q-icon name="calculate" color="positive" size="sm" class="q-mr-sm" />
          <div class="text-subtitle1 text-weight-bold col">Como calculamos CO₂ e água</div>
          <q-btn flat round dense icon="close" color="grey-7" type="button" @click="aberto = false" />
        </q-card-section>

        <q-separator />

        <q-card-section class="column no-wrap q-gutter-y-md explicacao-scroll scroll">
          <div class="text-body2">
            Os valores são <strong>estimativas</strong> feitas a partir do peso do alimento (kg) registrado em cada
            venda, doação ou descarte, multiplicado por um fator médio global.
          </div>

          <!-- CO2 -->
          <div class="bloco">
            <div class="text-caption text-uppercase text-weight-bold text-positive">CO₂ evitado</div>
            <div class="formula">CO₂e (kg) = peso (kg) × {{ fmt(FATORES_IMPACTO.co2KgPorKg) }}</div>
            <div class="text-caption text-grey-7">
              Origem do fator: a FAO estima {{ fmt(FATORES_IMPACTO.fao.co2eGt) }} bilhões de toneladas de CO₂e por ano
              para {{ fmt(FATORES_IMPACTO.fao.alimentoDesperdicadoGt) }} bilhão de toneladas de alimento desperdiçado.
              {{ fmt(FATORES_IMPACTO.fao.co2eGt) }} ÷ {{ fmt(FATORES_IMPACTO.fao.alimentoDesperdicadoGt) }} ≈
              {{ fmt(co2FaoKgPorKg, 2) }} kg de CO₂e por kg, arredondado para {{ fmt(FATORES_IMPACTO.co2KgPorKg) }}.
            </div>
          </div>

          <!-- Água -->
          <div class="bloco">
            <div class="text-caption text-uppercase text-weight-bold text-info">Água preservada</div>
            <div class="formula">Água (L) = peso (kg) × {{ FATORES_IMPACTO.aguaLPorKg }}</div>
            <div class="text-caption text-grey-7">
              Origem: a FAO estima {{ FATORES_IMPACTO.fao.aguaAzulKm3 }} km³ de água azul (rios, lagos e aquíferos) por ano
              gastos com alimento desperdiçado. {{ FATORES_IMPACTO.fao.aguaAzulKm3 }} km³ ÷
              {{ fmt(FATORES_IMPACTO.fao.alimentoDesperdicadoGt) }} bilhão de t ≈ {{ Math.round(aguaFaoLPorKg) }} L por kg.
              A plataforma adota {{ FATORES_IMPACTO.aguaLPorKg }} L/kg, um valor mais conservador que essa média global.
            </div>
          </div>

          <!-- Exemplo -->
          <div class="bloco">
            <div class="text-caption text-uppercase text-weight-bold text-grey-7">
              Exemplo com {{ fmt(pesoExemplo, pesoExemplo % 1 === 0 ? 0 : 1) }} kg
              <span v-if="pesoKg > 0">(total desta tela)</span>
            </div>
            <div class="formula">
              {{ fmt(pesoExemplo, pesoExemplo % 1 === 0 ? 0 : 1) }} × {{ fmt(FATORES_IMPACTO.co2KgPorKg) }} =
              <strong>{{ fmt(co2Exemplo) }} kg CO₂e</strong>
            </div>
            <div class="formula">
              {{ fmt(pesoExemplo, pesoExemplo % 1 === 0 ? 0 : 1) }} × {{ FATORES_IMPACTO.aguaLPorKg }} =
              <strong>{{ fmt(aguaExemplo, 0) }} L de água</strong>
            </div>
          </div>

          <!-- Fontes -->
          <div class="bloco">
            <div class="text-caption text-uppercase text-weight-bold text-grey-7">Fonte que comprova o cálculo</div>
            <ul class="fontes q-pl-md q-my-xs">
              <li v-for="f in FONTES_IMPACTO" :key="f.url">
                <a :href="f.url" target="_blank" rel="noopener noreferrer">{{ f.titulo }}</a>
              </li>
            </ul>
            <div class="text-caption text-grey-7">
              Os números estão no resumo executivo do relatório (carbono, água e volume de alimento desperdiçado).
            </div>
          </div>

          <div class="text-caption text-grey-6">
            Limites: o fator é uma média global, sem distinguir o tipo de alimento (carnes pesam mais que pães, por
            exemplo) e sem contar emissões de mudança de uso da terra. Serve para dimensionar o impacto, não como
            medição individual.
          </div>
        </q-card-section>
      </q-card>
    </q-dialog>
  </span>
</template>

<style scoped lang="scss">
.explicacao-card {
  width: 100%;
  max-width: 560px;
}

.explicacao-scroll {
  max-height: 70vh;
}

.bloco {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.formula {
  font-family: monospace;
  font-size: 13px;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(128, 128, 128, 0.12);
}

.fontes {
  li {
    margin-bottom: 4px;
    font-size: 12px;
  }

  a {
    color: var(--q-primary);
    word-break: break-word;
  }
}
</style>