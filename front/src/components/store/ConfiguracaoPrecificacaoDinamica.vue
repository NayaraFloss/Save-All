<script setup>
// Configura faixas de desconto por validade e permite avaliar seu impacto sobre o estoque.
import { ref, reactive, computed } from "vue";
import {
  CONFIG_PRECIFICACAO_PADRAO,
  LIMITES_PRECIFICACAO,
  calcularPrecificacaoDinamica,
  formatarDataBR,
} from "../../utils/precificacaoDinamica";
// Entradas recebidas do componente pai que configuram os dados e opções desta tela.
const props = defineProps({
  lojaId: String,
  modoEscuro: Boolean,
  storeFoods: { type: Array, default: () => [] },
  foods: { type: Array, default: () => [] },
  initialConfig: { type: Object, default: undefined }
});
// Eventos emitidos para o componente pai executar as ações fora desta interface.
const emit = defineEmits(["saved", "save-config", "trigger-disposal", "notification"]);
// Estado local reativo usado para acompanhar seleções, formulários e etapas da interface.
const descontoFaixa1 = ref(props.initialConfig?.descontoFaixa1 ?? CONFIG_PRECIFICACAO_PADRAO.descontoFaixa1);
const descontoFaixa2 = ref(props.initialConfig?.descontoFaixa2 ?? CONFIG_PRECIFICACAO_PADRAO.descontoFaixa2);
const descontoFaixa3 = ref(props.initialConfig?.descontoFaixa3 ?? CONFIG_PRECIFICACAO_PADRAO.descontoFaixa3);
const descontoProdutoDia = ref(props.initialConfig?.descontoProdutoDia ?? CONFIG_PRECIFICACAO_PADRAO.descontoProdutoDia);
// "Ver mais" de cada faixa (1, 2 e 3) abre/fecha a explicação de como ela funciona
const faixasAbertas = reactive({ 1: false, 2: false, 3: false });
// Ações da tela validam a interação e encaminham as alterações ou eventos necessários.
const alternarFaixa = (numero) => {
  faixasAbertas[numero] = !faixasAbertas[numero];
};
const isSaved = ref(false);
// Exemplo didático: produto de R$ 10,00 com o desconto escolhido no controle de cada faixa
const exemploPreco = (percentual) => (10 * (1 - Number(percentual) / 100)).toFixed(2).replace(".", ",");
// Valores derivados das entradas e do estado para manter a apresentação sincronizada.
const explicacoesFaixas = computed(() => ({
  1: {
    finalidade: "Estimular a venda com desconto moderado enquanto ainda há tempo hábil para o escoamento do produto.",
    quando: "Quando o produto atinge de 50% a 69% da validade consumida (dias decorridos ÷ prazo total de validade). Exemplo: em um produto com validade total de 10 dias, a faixa vigora do 5º ao 6º dia.",
    desconto: descontoFaixa1.value,
    preco: exemploPreco(descontoFaixa1.value),
    vitrine: "O item passa a ser exibido com prioridade na vitrine (os produtos mais próximos do vencimento aparecem primeiro) e a constar nos alertas de vencimento do painel da loja.",
    proxima: "Ao atingir 70% da validade consumida, o produto é reclassificado automaticamente para a Faixa 2 – Alerta."
  },
  2: {
    finalidade: "Intensificar o giro comercial na reta final da validade, ampliando o desconto para acelerar a venda.",
    quando: "Quando o produto atinge de 70% a 89% da validade consumida (dias decorridos ÷ prazo total de validade). Exemplo: em um produto com validade total de 10 dias, a faixa vigora do 7º ao 8º dia.",
    desconto: descontoFaixa2.value,
    preco: exemploPreco(descontoFaixa2.value),
    vitrine: "O item é exibido com prioridade ainda maior na vitrine e permanece nos alertas de vencimento do painel da loja.",
    proxima: "Ao atingir 90% da validade consumida, o produto é reclassificado automaticamente para a Faixa 3 – Crítico."
  },
  3: {
    finalidade: "Promover a liquidação de emergência, a fim de evitar a perda do produto por vencimento.",
    quando: "Quando o produto atinge de 90% a 99% da validade consumida (dias decorridos ÷ prazo total de validade). Exemplo: em um produto com validade total de 10 dias, a faixa vigora a partir do 9º dia, até o vencimento.",
    desconto: descontoFaixa3.value,
    preco: exemploPreco(descontoFaixa3.value),
    vitrine: "O item é exibido entre os primeiros da vitrine e recebe destaque nos alertas de vencimento do painel da loja, indicando a necessidade de ação imediata.",
    proxima: "Ao atingir 100% da validade consumida (produto vencido), o item é retirado da vitrine e encaminhado para doação ou descarte (Faixa 4 – Limite)."
  }
}));
const showSimulatorModal = ref(false);
const activeConfig = computed(() => ({
  ativo: true, // precificação sempre automática
  descontoFaixa1: Number(descontoFaixa1.value),
  descontoFaixa2: Number(descontoFaixa2.value),
  descontoFaixa3: Number(descontoFaixa3.value),
  descontoProdutoDia: Number(descontoProdutoDia.value)
}));
// Mantém o campo do Produto do Dia dentro do limite permitido
const ajustarDescontoProdutoDia = () => {
  const limite = LIMITES_PRECIFICACAO.produtoDia;
  const valorDigitado = descontoProdutoDia.value;
  const numero = valorDigitado === "" || valorDigitado == null ? NaN : Math.round(Number(valorDigitado));
  descontoProdutoDia.value = Number.isFinite(numero)
    ? Math.min(Math.max(numero, limite.min), limite.max)
    : CONFIG_PRECIFICACAO_PADRAO.descontoProdutoDia;
};
const getFaixaBadgeProps = (index) => {
  if (props.modoEscuro) {
    if (index === 4) return { color: "grey-8", textColor: "grey-3" };
    if (index === 3) return { color: "red-10", textColor: "red-3" };
    if (index === 2) return { color: "orange-10", textColor: "orange-3" };
    if (index === 1) return { color: "yellow-10", textColor: "yellow-3" };
    return { color: "green-10", textColor: "green-3" };
  }
  if (index === 4) return { color: "grey-3", textColor: "grey-10" };
  if (index === 3) return { color: "red-1", textColor: "red-10" };
  if (index === 2) return { color: "orange-1", textColor: "orange-10" };
  if (index === 1) return { color: "yellow-2", textColor: "yellow-10" };
  return { color: "green-1", textColor: "green-10" };
};
const getProgressColor = (pct) => {
  if (pct >= 100) return "grey-7";
  if (pct >= 90) return "negative";
  if (pct >= 70) return "orange";
  if (pct >= 50) return "yellow-8";
  return "positive";
};
const handleResetDefaults = () => {
  descontoFaixa1.value = CONFIG_PRECIFICACAO_PADRAO.descontoFaixa1;
  descontoFaixa2.value = CONFIG_PRECIFICACAO_PADRAO.descontoFaixa2;
  descontoFaixa3.value = CONFIG_PRECIFICACAO_PADRAO.descontoFaixa3;
  descontoProdutoDia.value = CONFIG_PRECIFICACAO_PADRAO.descontoProdutoDia;
  emit("notification", "Configura\xE7\xF5es restauradas para os padr\xF5es da plataforma!", "success");
};
const handleSave = () => {
  ajustarDescontoProdutoDia();
  emit("save-config", activeConfig.value);
  isSaved.value = true;
  setTimeout(() => {
    isSaved.value = false;
  }, 2500);
  emit("notification", "Regras de precifica\xE7\xE3o din\xE2mica salvas com sucesso!", "success");
};
const now = /* @__PURE__ */ new Date();
const defaultFab = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1e3).toISOString().substring(0, 10);
const defaultExp = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1e3).toISOString().substring(0, 10);
const simProductName = ref("P\xE3o Franc\xEAs Artesanal");
const simOriginalPrice = ref(10);
const simFabricationDate = ref(defaultFab);
const simExpirationDate = ref(defaultExp);
const applyPreset = (presetType) => {
  const current = /* @__PURE__ */ new Date();
  if (presetType === "example") {
    simProductName.value = "P\xE3o de Forma Especial";
    simOriginalPrice.value = 10;
    simFabricationDate.value = new Date(current.getTime() - 8 * 24 * 60 * 60 * 1e3).toISOString().substring(0, 10);
    simExpirationDate.value = new Date(current.getTime() + 2 * 24 * 60 * 60 * 1e3).toISOString().substring(0, 10);
  } else if (presetType === "short") {
    simProductName.value = "Sandu\xEDche Natural";
    simOriginalPrice.value = 18;
    simFabricationDate.value = new Date(current.getTime() - 2 * 24 * 60 * 60 * 1e3).toISOString().substring(0, 10);
    simExpirationDate.value = new Date(current.getTime() + 2 * 24 * 60 * 60 * 1e3).toISOString().substring(0, 10);
  } else if (presetType === "critical") {
    simProductName.value = "Bolo Decorado Morango";
    simOriginalPrice.value = 45;
    simFabricationDate.value = new Date(current.getTime() - 9.5 * 24 * 60 * 60 * 1e3).toISOString().substring(0, 10);
    simExpirationDate.value = new Date(current.getTime() + 0.5 * 24 * 60 * 60 * 1e3).toISOString().substring(0, 10);
  } else if (presetType === "expired") {
    simProductName.value = "Iogurte Natural de Frutas";
    simOriginalPrice.value = 8.5;
    simFabricationDate.value = new Date(current.getTime() - 10 * 24 * 60 * 60 * 1e3).toISOString().substring(0, 10);
    simExpirationDate.value = new Date(current.getTime() - 1 * 24 * 60 * 60 * 1e3).toISOString().substring(0, 10);
  }
};
const simResult = computed(() => {
  return calcularPrecificacaoDinamica(
    simFabricationDate.value,
    simExpirationDate.value,
    simOriginalPrice.value,
    activeConfig.value
  );
});
const myFoods = computed(() => {
  return props.foods.filter((f) => f.lojaId === props.lojaId);
});
const calculatedInventory = computed(() => {
  return myFoods.value.map((food) => {
    let fabDate = food.dataFabricacao;
    if (!fabDate) {
      const exp = new Date(food.dataValidade);
      fabDate = new Date(exp.getTime() - 5 * 24 * 60 * 60 * 1e3).toISOString().substring(0, 10);
    }
    const calc = calcularPrecificacaoDinamica(
      fabDate,
      food.dataValidade,
      food.precoOriginal,
      activeConfig.value
    );
    return {
      food,
      fabDate,
      calc
    };
  });
});
</script>

<template>
<!-- Interface principal: configura faixas de desconto por validade e permite avaliar seu impacto sobre o estoque. -->
  <div class="pricing-root column q-gutter-y-md">
    <!-- Cabeçalho: ocupa a largura toda (título à esquerda, controles à direita) -->
    <q-card flat bordered :dark="modoEscuro">
      <q-card-section class="row items-center justify-between q-col-gutter-md">
        <div class="col-12 col-md">
          <div class="row items-center q-gutter-sm q-mb-sm">
            <q-badge color="positive" outline class="text-weight-bold text-uppercase mono">
              ⚡ Governança 7.3 — ODS 12
            </q-badge>
            <q-badge color="warning" outline class="text-weight-bold text-uppercase mono">
              Precificação Inteligente
            </q-badge>
          </div>
          <div class="text-h5 text-weight-bold">Precificação Dinâmica por Validade</div>
          <div class="text-body2 text-grey-7 q-mt-xs">
            Ajuste automaticamente os descontos de seus produtos conforme a proximidade da data de vencimento, otimizando vendas e reduzindo desperdícios.
          </div>
        </div>

        <div class="col-12 col-md-auto row items-center no-wrap q-gutter-md">
          <q-btn
            unelevated
            no-caps
            color="positive"
            icon="science"
            label="Testar / Simular Regras"
            class="text-weight-bold mono"
            @click="showSimulatorModal = true"
          />
        </div>
      </q-card-section>
    </q-card>

    <!-- Quando cada desconto começa: linha do tempo da validade (0% a 100% consumido) -->
    <q-card flat bordered :dark="modoEscuro">
      <q-card-section>
        <div class="row items-center justify-between q-mb-sm">
          <div class="row items-center q-gutter-x-sm text-caption text-weight-bold text-uppercase mono">
            <q-icon name="calculate" size="18px" color="positive" />
            <span>Quando cada desconto começa</span>
          </div>
          <div class="text-caption text-grey-7 mono">% Consumido = (Dias decorridos ÷ Prazo total) × 100</div>
        </div>

        <div class="linha-tempo">
          <div class="trecho trecho-0" style="flex: 50">
            <b>0% – 49%</b><span>Preço cheio</span>
          </div>
          <div class="trecho trecho-1" style="flex: 20">
            <b>50% – 69%</b><span>-{{ descontoFaixa1 }}%</span>
          </div>
          <div class="trecho trecho-2" style="flex: 20">
            <b>70% – 89%</b><span>-{{ descontoFaixa2 }}%</span>
          </div>
          <div class="trecho trecho-3" style="flex: 10">
            <b>90% – 99%</b><span>-{{ descontoFaixa3 }}%</span>
          </div>
          <div class="trecho trecho-4" style="flex: 6">
            <b>100%</b><span>Vencido</span>
          </div>
        </div>

      </q-card-section>
    </q-card>

    <!-- Faixas -->
    <div class="column q-gutter-y-md">
      <div class="row items-center justify-between q-gutter-sm">
        <div class="row items-center q-gutter-x-sm text-caption text-weight-bold text-uppercase">
          <q-icon name="tune" size="18px" color="positive" />
          <span>Ajuste das Faixas de Desconto</span>
        </div>
        <q-btn
          outline
          dense
          no-caps
          size="sm"
          color="grey-7"
          icon="restart_alt"
          label="Restaurar Padrões"
          class="text-weight-bold mono"
          @click="handleResetDefaults"
        />
      </div>

      <div class="row q-col-gutter-md">
        <div class="col-12 col-md-4">
          <q-card flat bordered :dark="modoEscuro" class="full-height">
            <q-card-section class="column q-gutter-y-xs">
              <div class="faixa-regra mono">Começa com <b>50%</b> da validade consumida (vai até 69%)</div>
              <div class="text-caption text-weight-bold text-uppercase">Faixa 1 – Atenção</div>
              <div class="text-caption text-grey-7">Desconto inicial quando metade da validade expirou.</div>
            </q-card-section>
            <q-separator :dark="modoEscuro" />
            <q-card-section class="explicacao-faixa explicacao-faixa--1" :class="{ 'explicacao-faixa--escura': modoEscuro }">
              <div class="row items-center justify-between no-wrap">
                <div class="text-caption text-weight-bold text-uppercase">Como funciona a Faixa 1</div>
                <q-btn
                  id="btn-ver-mais-faixa1"
                  flat
                  dense
                  no-caps
                  size="sm"
                  color="amber-9"
                  class="text-weight-bold"
                  :label="faixasAbertas[1] ? 'Ver menos' : 'Ver mais'"
                  :icon-right="faixasAbertas[1] ? 'expand_less' : 'expand_more'"
                  @click="alternarFaixa(1)"
                />
              </div>
              <q-slide-transition>
                <div v-show="faixasAbertas[1]">
                  <ul class="explicacao-lista text-caption q-mt-xs">
                    <li><b>Finalidade:</b> {{ explicacoesFaixas[1].finalidade }}</li>
                    <li><b>Quando se aplica:</b> {{ explicacoesFaixas[1].quando }}</li>
                    <li>
                      <b>Efeito no preço:</b> o sistema aplica automaticamente desconto de
                      <b>{{ explicacoesFaixas[1].desconto }}%</b> sobre o preço cheio cadastrado. Exemplo: um produto de
                      R$ 10,00 passa a ser ofertado por R$ {{ explicacoesFaixas[1].preco }}. O desconto não é cumulativo
                      com o de outras faixas.
                    </li>
                    <li><b>Vitrine e alertas:</b> {{ explicacoesFaixas[1].vitrine }}</li>
                    <li><b>Próxima etapa:</b> {{ explicacoesFaixas[1].proxima }}</li>
                  </ul>
                </div>
              </q-slide-transition>
            </q-card-section>
            <q-separator :dark="modoEscuro" />
            <q-card-section class="column q-gutter-y-xs">
              <div class="row items-center justify-between mono">
                <span class="text-caption text-weight-bold text-uppercase text-grey-7">Desconto:</span>
                <span class="text-h6 text-weight-bold" :class="modoEscuro ? 'text-yellow-4' : 'text-amber-9'">{{ descontoFaixa1 }}%</span>
              </div>
              <q-slider
                v-model="descontoFaixa1"
                :min="LIMITES_PRECIFICACAO.faixa1.min"
                :max="LIMITES_PRECIFICACAO.faixa1.max"
                :step="1"
                color="amber-9"
                :dark="modoEscuro"
              />
              <div class="row items-center justify-between text-caption text-weight-bold text-grey-7 mono">
                <span>Min: 5%</span>
                <span :class="modoEscuro ? 'text-yellow-4' : 'text-amber-9'">Padrão: 10%</span>
                <span>Max: 20%</span>
              </div>
            </q-card-section>
          </q-card>
        </div>
        <div class="col-12 col-md-4">
          <q-card flat bordered :dark="modoEscuro" class="full-height">
            <q-card-section class="column q-gutter-y-xs">
              <div class="faixa-regra mono">Começa com <b>70%</b> da validade consumida (vai até 89%)</div>
              <div class="text-caption text-weight-bold text-uppercase">Faixa 2 – Alerta</div>
              <div class="text-caption text-grey-7">Acelera o giro comercial na reta final do produto.</div>
            </q-card-section>
            <q-separator :dark="modoEscuro" />
            <q-card-section class="explicacao-faixa explicacao-faixa--2" :class="{ 'explicacao-faixa--escura': modoEscuro }">
              <div class="row items-center justify-between no-wrap">
                <div class="text-caption text-weight-bold text-uppercase">Como funciona a Faixa 2</div>
                <q-btn
                  id="btn-ver-mais-faixa2"
                  flat
                  dense
                  no-caps
                  size="sm"
                  color="orange-9"
                  class="text-weight-bold"
                  :label="faixasAbertas[2] ? 'Ver menos' : 'Ver mais'"
                  :icon-right="faixasAbertas[2] ? 'expand_less' : 'expand_more'"
                  @click="alternarFaixa(2)"
                />
              </div>
              <q-slide-transition>
                <div v-show="faixasAbertas[2]">
                  <ul class="explicacao-lista text-caption q-mt-xs">
                    <li><b>Finalidade:</b> {{ explicacoesFaixas[2].finalidade }}</li>
                    <li><b>Quando se aplica:</b> {{ explicacoesFaixas[2].quando }}</li>
                    <li>
                      <b>Efeito no preço:</b> o sistema aplica automaticamente desconto de
                      <b>{{ explicacoesFaixas[2].desconto }}%</b> sobre o preço cheio cadastrado. Exemplo: um produto de
                      R$ 10,00 passa a ser ofertado por R$ {{ explicacoesFaixas[2].preco }}. O desconto não é cumulativo
                      com o de outras faixas.
                    </li>
                    <li><b>Vitrine e alertas:</b> {{ explicacoesFaixas[2].vitrine }}</li>
                    <li><b>Próxima etapa:</b> {{ explicacoesFaixas[2].proxima }}</li>
                  </ul>
                </div>
              </q-slide-transition>
            </q-card-section>
            <q-separator :dark="modoEscuro" />
            <q-card-section class="column q-gutter-y-xs">
              <div class="row items-center justify-between mono">
                <span class="text-caption text-weight-bold text-uppercase text-grey-7">Desconto:</span>
                <span class="text-h6 text-weight-bold" :class="modoEscuro ? 'text-orange-4' : 'text-orange-9'">{{ descontoFaixa2 }}%</span>
              </div>
              <q-slider
                v-model="descontoFaixa2"
                :min="LIMITES_PRECIFICACAO.faixa2.min"
                :max="LIMITES_PRECIFICACAO.faixa2.max"
                :step="1"
                color="orange-9"
                :dark="modoEscuro"
              />
              <div class="row items-center justify-between text-caption text-weight-bold text-grey-7 mono">
                <span>Min: 15%</span>
                <span :class="modoEscuro ? 'text-orange-4' : 'text-orange-9'">Padrão: 25%</span>
                <span>Max: 40%</span>
              </div>
            </q-card-section>
          </q-card>
        </div>
        <div class="col-12 col-md-4">
          <q-card flat bordered :dark="modoEscuro" class="full-height">
            <q-card-section class="column q-gutter-y-xs">
              <div class="faixa-regra mono">Começa com <b>90%</b> da validade consumida (vai até 99%)</div>
              <div class="text-caption text-weight-bold text-uppercase">Faixa 3 – Crítico</div>
              <div class="text-caption text-grey-7">Liquidação de emergência para resgate imediato.</div>
            </q-card-section>
            <q-separator :dark="modoEscuro" />
            <q-card-section class="explicacao-faixa explicacao-faixa--3" :class="{ 'explicacao-faixa--escura': modoEscuro }">
              <div class="row items-center justify-between no-wrap">
                <div class="text-caption text-weight-bold text-uppercase">Como funciona a Faixa 3</div>
                <q-btn
                  id="btn-ver-mais-faixa3"
                  flat
                  dense
                  no-caps
                  size="sm"
                  color="negative"
                  class="text-weight-bold"
                  :label="faixasAbertas[3] ? 'Ver menos' : 'Ver mais'"
                  :icon-right="faixasAbertas[3] ? 'expand_less' : 'expand_more'"
                  @click="alternarFaixa(3)"
                />
              </div>
              <q-slide-transition>
                <div v-show="faixasAbertas[3]">
                  <ul class="explicacao-lista text-caption q-mt-xs">
                    <li><b>Finalidade:</b> {{ explicacoesFaixas[3].finalidade }}</li>
                    <li><b>Quando se aplica:</b> {{ explicacoesFaixas[3].quando }}</li>
                    <li>
                      <b>Efeito no preço:</b> o sistema aplica automaticamente desconto de
                      <b>{{ explicacoesFaixas[3].desconto }}%</b> sobre o preço cheio cadastrado. Exemplo: um produto de
                      R$ 10,00 passa a ser ofertado por R$ {{ explicacoesFaixas[3].preco }}. O desconto não é cumulativo
                      com o de outras faixas.
                    </li>
                    <li><b>Vitrine e alertas:</b> {{ explicacoesFaixas[3].vitrine }}</li>
                    <li><b>Próxima etapa:</b> {{ explicacoesFaixas[3].proxima }}</li>
                  </ul>
                </div>
              </q-slide-transition>
            </q-card-section>
            <q-separator :dark="modoEscuro" />
            <q-card-section class="column q-gutter-y-xs">
              <div class="row items-center justify-between mono">
                <span class="text-caption text-weight-bold text-uppercase text-grey-7">Desconto:</span>
                <span class="text-h6 text-weight-bold" :class="modoEscuro ? 'text-red-4' : 'text-red-9'">{{ descontoFaixa3 }}%</span>
              </div>
              <q-slider
                v-model="descontoFaixa3"
                :min="LIMITES_PRECIFICACAO.faixa3.min"
                :max="LIMITES_PRECIFICACAO.faixa3.max"
                :step="1"
                color="negative"
                :dark="modoEscuro"
              />
              <div class="row items-center justify-between text-caption text-weight-bold text-grey-7 mono">
                <span>Min: 30%</span>
                <span :class="modoEscuro ? 'text-red-4' : 'text-red-9'">Padrão: 50%</span>
                <span>Max: 70%</span>
              </div>
            </q-card-section>
          </q-card>
        </div>
      </div>

      <!-- Faixas fixas e Produto do Dia: três cartões do mesmo tamanho, juntos e compactos -->
      <div class="row q-col-gutter-sm">
        <div class="col-12 col-md-4">
          <q-card flat bordered :dark="modoEscuro" class="full-height cartao-compacto">
            <q-card-section class="row items-center no-wrap q-gutter-x-sm q-pa-sm">
              <q-badge :color="getFaixaBadgeProps(0).color" :text-color="getFaixaBadgeProps(0).textColor" class="text-weight-bold mono selo-compacto">
                Até 49%
              </q-badge>
              <div class="col">
                <div class="titulo-compacto">Faixa 0 – Normal</div>
                <div class="obs-compacta text-grey-7">Até 49% da validade: preço cheio, sem desconto.</div>
              </div>
            </q-card-section>
          </q-card>
        </div>
        <div class="col-12 col-md-4">
          <q-card flat bordered :dark="modoEscuro" class="full-height cartao-compacto">
            <q-card-section class="row items-center no-wrap q-gutter-x-sm q-pa-sm">
              <q-badge :color="getFaixaBadgeProps(4).color" :text-color="getFaixaBadgeProps(4).textColor" class="text-weight-bold mono selo-compacto">
                100%
              </q-badge>
              <div class="col">
                <div class="titulo-compacto">Faixa 4 – Limite</div>
                <div class="obs-compacta text-grey-7">Vencido: sai da vitrine e vai para doação ou descarte.</div>
              </div>
            </q-card-section>
          </q-card>
        </div>
        <div class="col-12 col-md-4">
          <q-card flat bordered :dark="modoEscuro" class="full-height cartao-compacto cartao-produto-dia">
            <q-card-section class="row items-center no-wrap q-gutter-x-sm q-pa-sm">
              <q-badge color="negative" class="text-weight-bold mono selo-compacto">Mesmo dia</q-badge>
              <div class="col">
                <div class="titulo-compacto">Produto do Dia</div>
                <div class="obs-compacta text-grey-7">Feito e vence no mesmo dia.</div>
              </div>
              <q-input
                id="input-desconto-produto-dia"
                v-model.number="descontoProdutoDia"
                type="number"
                dense
                outlined
                suffix="%"
                :dark="modoEscuro"
                class="campo-produto-dia"
                input-class="text-weight-bold mono text-right"
                @blur="ajustarDescontoProdutoDia"
              />
            </q-card-section>
          </q-card>
        </div>
      </div>

      <!-- Salvar -->
      <div class="row justify-center q-pt-sm">
        <q-btn
          unelevated
          no-caps
          color="positive"
          icon="save"
          :icon-right="isSaved ? 'check' : undefined"
          :label="isSaved ? 'Configurações Salvas!' : 'Salvar Regras de Precificação'"
          class="save-btn text-weight-bold text-uppercase q-py-sm"
          @click="handleSave"
        />
      </div>
    </div>

    <!-- Impacto no estoque -->
    <q-card flat bordered :dark="modoEscuro">
      <q-card-section class="row items-center justify-between q-gutter-sm">
        <div>
          <div class="row items-center q-gutter-x-sm text-caption text-weight-bold text-uppercase">
            <q-icon name="sell" size="18px" color="positive" />
            <span>Impacto no Estoque Atual da Loja</span>
          </div>
          <div class="text-caption text-grey-7">Itens com cálculo de preço dinâmico aplicados.</div>
        </div>
        <q-badge outline color="grey-7" class="text-weight-bold mono q-pa-xs q-px-sm">
          {{ calculatedInventory.length }} item(ns)
        </q-badge>
      </q-card-section>

      <q-separator :dark="modoEscuro" />

      <q-card-section v-if="calculatedInventory.length === 0" class="text-center text-caption text-grey-6 text-italic q-py-lg">
        Nenhum item cadastrado para este estabelecimento.
      </q-card-section>

      <q-list v-else separator :dark="modoEscuro">
        <q-item
          v-for="item in calculatedInventory"
          :key="item.food.id"
          :class="['inventory-item', { 'inventory-item--expired': item.calc.vencido }]"
        >
          <q-item-section avatar>
            <q-avatar square size="44px" class="food-thumb">
              <img :src="item.food.image" :alt="item.food.name" />
            </q-avatar>
          </q-item-section>

          <q-item-section>
            <div class="row items-center q-gutter-x-sm">
              <span class="text-caption text-weight-bold">{{ item.food.name }}</span>
              <q-badge
                :color="getFaixaBadgeProps(item.calc.faixaIndex).color"
                :text-color="getFaixaBadgeProps(item.calc.faixaIndex).textColor"
                class="text-weight-bold mono"
              >
                {{ item.calc.faixaTag }}
              </q-badge>
            </div>
            <div class="text-caption text-grey-7 mono">
              Fab: {{ formatarDataBR(item.fabDate) }} · Val: {{ formatarDataBR(item.food.dataValidade) }}
            </div>
          </q-item-section>

          <q-item-section side>
            <div class="row items-center q-gutter-x-md">
              <div>
                <div class="text-caption text-weight-bold text-uppercase text-grey-7 mono">% Consumido</div>
                <div
                  class="text-caption text-weight-bold mono"
                  :class="item.calc.percentualConsumido >= 90 ? (modoEscuro ? 'text-red-4' : 'text-red-9') : (modoEscuro ? 'text-green-4' : 'text-green-9')"
                >
                  {{ item.calc.percentualConsumido }}%
                </div>
              </div>

              <div>
                <div class="text-caption text-weight-bold text-uppercase text-grey-7 mono">Preço Dinâmico</div>
                <div class="row items-baseline q-gutter-x-xs">
                  <span class="text-caption text-weight-bold mono" :class="modoEscuro ? 'text-amber-4' : 'text-amber-9'">
                    R$ {{ item.calc.precoComDesconto.toFixed(2) }}
                  </span>
                  <span class="text-caption text-grey-6 mono original-price">R$ {{ item.food.precoOriginal.toFixed(2) }}</span>
                </div>
              </div>

              <q-btn
                v-if="item.calc.vencido"
                outline
                dense
                no-caps
                size="sm"
                color="negative"
                icon="volunteer_activism"
                label="Doação / Descarte"
                class="text-weight-bold mono"
                @click="emit('trigger-disposal', item.food)"
              />
              <q-badge v-else outline color="positive" class="text-weight-bold mono">
                Desconto {{ item.calc.percentualDesconto }}%
              </q-badge>
            </div>
          </q-item-section>
        </q-item>
      </q-list>
    </q-card>

    <!-- Simulador -->
    <q-dialog v-model="showSimulatorModal">
      <q-card :dark="modoEscuro" class="simulator-card">
        <q-card-section class="row items-center no-wrap">
          <q-avatar size="40px" color="green-1" text-color="positive" icon="science" />
          <div class="col q-ml-sm">
            <div class="text-subtitle2 text-weight-bold text-uppercase">Simulador de Precificação</div>
            <div class="text-caption text-grey-7">Teste o cálculo dinâmico informando datas e valores</div>
          </div>
          <q-btn flat round dense icon="close" @click="showSimulatorModal = false" />
        </q-card-section>

        <q-separator :dark="modoEscuro" />

        <q-card-section class="column q-gutter-y-md">
          <div class="column q-gutter-y-xs">
            <div class="text-caption text-weight-bold text-uppercase text-grey-7 mono">Exemplos Prontos:</div>
            <div class="row items-center q-gutter-sm">
          <q-btn outline dense no-caps size="sm" color="amber" label="Pão 80%" class="text-weight-bold mono" @click="applyPreset('example')" />
          <q-btn outline dense no-caps size="sm" color="yellow-8" label="Sanduíche 50%" class="text-weight-bold mono" @click="applyPreset('short')" />
          <q-btn outline dense no-caps size="sm" color="negative" label="Bolo 95%" class="text-weight-bold mono" @click="applyPreset('critical')" />
          <q-btn outline dense no-caps size="sm" color="grey-7" label="Vencido 100%" class="text-weight-bold mono" @click="applyPreset('expired')" />
            </div>
          </div>

          <q-input v-model="simProductName" outlined dense :dark="modoEscuro" label="Nome do Produto" />

          <div class="row q-col-gutter-sm">
            <div class="col-12 col-sm-4">
              <q-input
                v-model.number="simOriginalPrice"
                type="number"
                step="0.5"
                min="0"
                outlined
                dense
                :dark="modoEscuro"
                label="Preço Original (R$)"
              />
            </div>
            <div class="col-12 col-sm-4">
              <q-input v-model="simFabricationDate" type="date" outlined dense :dark="modoEscuro" stack-label label="Data Fabricação" />
            </div>
            <div class="col-12 col-sm-4">
              <q-input v-model="simExpirationDate" type="date" outlined dense :dark="modoEscuro" stack-label label="Data Validade" />
            </div>
          </div>

          <!-- Resultado -->
          <q-card flat bordered :dark="modoEscuro">
            <q-card-section class="row items-center justify-between q-gutter-sm q-py-sm">
              <span class="text-caption text-weight-bold text-uppercase text-grey-7 mono">Resultado do Cálculo</span>
              <q-badge
                :color="getFaixaBadgeProps(simResult.faixaIndex).color"
                :text-color="getFaixaBadgeProps(simResult.faixaIndex).textColor"
                class="text-weight-bold mono q-pa-xs q-px-sm"
              >
                {{ simResult.faixaTag }}
              </q-badge>
            </q-card-section>

            <q-separator :dark="modoEscuro" />

            <q-card-section class="column q-gutter-y-sm">
              <div>
                <div class="row justify-between text-caption mono">
                  <span class="text-grey-7">Prazo Consumido:</span>
                  <span
                    class="text-weight-bold"
                    :class="simResult.percentualConsumido >= 90 ? (modoEscuro ? 'text-red-4' : 'text-red-9') : (modoEscuro ? 'text-green-4' : 'text-green-9')"
                  >
                    {{ simResult.percentualConsumido }}%
                  </span>
                </div>
                <q-linear-progress
                  rounded
                  size="10px"
                  class="q-mt-xs"
                  :value="Math.min(100, simResult.percentualConsumido) / 100"
                  :color="getProgressColor(simResult.percentualConsumido)"
                  :track-color="modoEscuro ? 'grey-9' : 'grey-3'"
                />
              </div>

              <div class="row q-col-gutter-sm">
                <div class="col-6">
                  <q-card flat bordered :dark="modoEscuro">
                    <q-card-section class="q-pa-sm">
                      <div class="text-caption text-weight-bold text-uppercase text-grey-7 mono">Desconto</div>
                      <div class="text-h6 text-weight-bold mono" :class="modoEscuro ? 'text-amber-4' : 'text-amber-9'">
                        -{{ simResult.percentualDesconto }}%
                      </div>
                    </q-card-section>
                  </q-card>
                </div>
                <div class="col-6">
                  <q-card flat bordered :dark="modoEscuro">
                    <q-card-section class="q-pa-sm">
                      <div class="text-caption text-weight-bold text-uppercase text-grey-7 mono">Preço Final</div>
                      <div class="row items-baseline q-gutter-x-xs">
                        <span class="text-h6 text-weight-bold mono" :class="modoEscuro ? 'text-green-4' : 'text-green-9'">
                          R$ {{ simResult.precoComDesconto.toFixed(2) }}
                        </span>
                        <span class="text-caption text-grey-6 mono original-price">R$ {{ simResult.precoOriginal.toFixed(2) }}</span>
                      </div>
                    </q-card-section>
                  </q-card>
                </div>
              </div>

              <q-banner
                dense
                rounded
                :class="simResult.vencido
                  ? (modoEscuro ? 'bg-red-10 text-red-3' : 'bg-red-1 text-red-10')
                  : (modoEscuro ? 'bg-green-10 text-green-3' : 'bg-green-1 text-green-10')"
              >
                <template #avatar>
                  <q-icon :name="simResult.vencido ? 'warning' : 'verified_user'" :color="simResult.vencido ? 'negative' : 'positive'" />
                </template>
                <span class="text-caption text-weight-bold mono">{{ simResult.textoStatus }}</span>
              </q-banner>
            </q-card-section>
          </q-card>
        </q-card-section>

        <q-card-actions align="right" class="q-pa-md">
          <q-btn unelevated no-caps color="grey-9" label="Fechar Simulador" class="text-weight-bold" @click="showSimulatorModal = false" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<style scoped lang="scss">
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.explicacao-faixa {
  background: rgba(255, 152, 0, 0.07);
  border-left: 3px solid #ef6c00;
}

.explicacao-faixa--1 {
  background: rgba(255, 193, 7, 0.08);
  border-left-color: #ffa000;
}

.explicacao-faixa--3 {
  background: rgba(244, 67, 54, 0.07);
  border-left-color: #c62828;
}

.explicacao-faixa--escura {
  background: rgba(255, 152, 0, 0.12);
}

.explicacao-lista {
  margin: 0;
  padding-left: 16px;
  line-height: 1.45;

  li + li {
    margin-top: 4px;
  }
}

.cartao-produto-dia {
  border-left: 4px solid var(--q-negative);
}

.cartao-compacto {
  min-height: 62px;
}

.titulo-compacto {
  font-size: 12px;
  font-weight: 700;
  line-height: 1.2;
}

.obs-compacta {
  font-size: 10.5px;
  line-height: 1.25;
}

.selo-compacto {
  font-size: 10px;
  padding: 4px 6px;
  white-space: nowrap;
}

.campo-produto-dia {
  width: 92px;
  flex: none;
}

.faixa-regra {
  display: inline-block;
  align-self: flex-start;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  background: rgba(33, 186, 69, 0.12);
  color: #1b7a34;
}
.linha-tempo {
  display: flex;
  width: 100%;
  border-radius: 10px;
  overflow: hidden;
  min-height: 64px;
}
.trecho {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 8px 4px;
  min-width: 0;
  text-align: center;
  font-size: 12px;
  color: #fff;
  b { font-size: 13px; white-space: nowrap; }
  span { font-weight: 600; }
}
.trecho-0 { background: #21ba45; }
.trecho-1 { background: #f2c037; color: #3d2f00; }
.trecho-2 { background: #fb8c00; }
.trecho-3 { background: #d32f2f; }
.trecho-4 { background: #616161; }
@media (max-width: 599px) {
  .trecho b { font-size: 10px; }
  .trecho { font-size: 10px; }
}
.save-btn {
  min-width: min(260px, 100%);
}
.food-thumb {
  border-radius: 12px;
  img {
    object-fit: cover;
  }
}
.inventory-item--expired {
  opacity: 0.8;
}
.original-price {
  text-decoration: line-through;
}
.simulator-card {
  width: 100%;
  max-width: 576px;
}
</style>