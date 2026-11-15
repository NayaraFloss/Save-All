<script setup>
import { computed } from 'vue'
import { PONTOS_POR_REAL, VALOR_PONTO, BLOCO_REAIS, pontosPorBloco, centavosPorPonto, descontoDosPontos } from 'src/utils/regraPontos'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  saldo: { type: Number, default: 0 },
})
const emit = defineEmits(['update:modelValue'])

const aberto = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const moeda = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const centavos = (v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })

const exemplos = computed(() => [
  { compra: BLOCO_REAIS, pontos: pontosPorBloco() },
  { compra: BLOCO_REAIS * 4, pontos: pontosPorBloco() * 4 },
  { compra: BLOCO_REAIS * 10, pontos: pontosPorBloco() * 10 },
])
const equivalencias = computed(() => [100, 500, 1000].map((p) => ({ pontos: p, valor: descontoDosPontos(p) })))
const valorPontoTxt = 'R$ ' + VALOR_PONTO.toLocaleString('pt-BR', { minimumFractionDigits: 3 })
const retorno = computed(() => (PONTOS_POR_REAL * VALOR_PONTO * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 }))
</script>

<template>
  <q-dialog v-model="aberto">
    <q-card class="pontos-dialog">
      <q-card-section class="row items-center no-wrap">
        <q-avatar size="40px" color="positive" text-color="white" icon="military_tech" class="q-mr-md" />
        <div class="col">
          <div class="text-subtitle1 text-weight-bold">Programa de Pontos SaveAll</div>
          <div class="text-caption text-grey-6">Entenda como os pontos são acumulados e utilizados.</div>
        </div>
        <q-btn flat round dense icon="close" v-close-popup />
      </q-card-section>

      <q-separator />

      <q-card-section class="q-gutter-y-md scroll pontos-conteudo">
        <div>
          <div class="text-caption text-weight-bold text-uppercase text-grey-6 q-mb-xs">Seu saldo atual</div>
          <div class="text-h6 text-weight-bolder text-secondary">
            {{ saldo }} {{ saldo === 1 ? 'ponto' : 'pontos' }}
            <span class="text-caption text-grey-6 text-weight-regular">(equivalente a {{ moeda(descontoDosPontos(saldo)) }} em descontos)</span>
          </div>
        </div>

        <div>
          <div class="text-weight-bold q-mb-xs">1. Como acumular</div>
          <div class="text-body2">
            A cada <strong>{{ moeda(BLOCO_REAIS) }}</strong> pagos em um pedido, o cliente acumula
            <strong>{{ pontosPorBloco() }} pontos</strong> ({{ PONTOS_POR_REAL }} pontos por real). O cálculo incide sobre o
            valor total efetivamente pago, e eventuais frações de ponto são desprezadas.
          </div>
          <q-markup-table flat bordered dense class="q-mt-sm">
            <thead>
              <tr>
                <th class="text-left">Valor pago</th>
                <th class="text-right">Pontos acumulados</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="e in exemplos" :key="e.compra">
                <td class="text-left">{{ moeda(e.compra) }}</td>
                <td class="text-right">{{ e.pontos }} pts</td>
              </tr>
            </tbody>
          </q-markup-table>
        </div>

        <div>
          <div class="text-weight-bold q-mb-xs">2. Quanto vale cada ponto</div>
          <div class="text-body2">
            Cada ponto equivale a <strong>{{ valorPontoTxt }}</strong>,
            isto é, <strong>{{ centavos(centavosPorPonto()) }} centavo</strong> (meio centavo). Os pontos podem ser
            utilizados como desconto na finalização do pedido.
          </div>
          <q-markup-table flat bordered dense class="q-mt-sm">
            <thead>
              <tr>
                <th class="text-left">Pontos utilizados</th>
                <th class="text-right">Desconto</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="q in equivalencias" :key="q.pontos">
                <td class="text-left">{{ q.pontos }} pts</td>
                <td class="text-right">{{ moeda(q.valor) }}</td>
              </tr>
            </tbody>
          </q-markup-table>
        </div>

        <div>
          <div class="text-weight-bold q-mb-xs">3. Resumo do cálculo</div>
          <div class="text-body2">
            <div>Pontos acumulados = valor pago (R$) × {{ PONTOS_POR_REAL }}</div>
            <div>Desconto (R$) = pontos utilizados × {{ valorPontoTxt }}</div>
            <div class="q-mt-xs">
              Dessa forma, cada compra devolve ao cliente aproximadamente <strong>{{ retorno }}%</strong> do valor pago, na forma de
              pontos.
            </div>
          </div>
        </div>

        <div class="text-caption text-grey-6">
          Novos clientes iniciam com saldo zerado. Os pontos são creditados após a realização de pedidos.
        </div>
      </q-card-section>

      <q-separator />

      <q-card-actions align="right">
        <q-btn flat no-caps color="primary" label="Entendi" v-close-popup />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style scoped lang="scss">
.pontos-dialog {
  width: 100%;
  max-width: 480px;
}
.pontos-conteudo {
  max-height: 60vh;
}
</style>
