<script setup>
import { computed } from "vue";
import { servicoImpressaoPedido } from "src/services/servicoImpressaoPedido";

const props = defineProps({ mostrar: Boolean, pedido: Object });
const emit = defineEmits(["fechar"]);

const formatarValor = (valor) => Number(valor || 0).toFixed(2).replace(".", ",");

const visao = computed(() => {
  if (!props.pedido) return null;
  return {
    ...servicoImpressaoPedido.normalizarPedidoCupom(props.pedido),
    dataTexto: new Date(props.pedido.date || Date.now()).toLocaleString("pt-BR"),
    emitidoEm: new Date().toLocaleString("pt-BR")
  };
});

const baixarPdf = () => {
  if (props.pedido) servicoImpressaoPedido.baixarPdfCupom(props.pedido);
};
const imprimir = () => window.print();
</script>

<template>
  <q-dialog
    :model-value="!!(mostrar && pedido)"
    @update:model-value="(v) => { if (!v) emit('fechar'); }"
  >
    <q-card v-if="pedido && visao" class="cupom-modal column no-wrap">
      <!-- Cabeçalho -->
      <q-card-section class="row items-center justify-between no-wrap q-py-sm no-print">
        <div class="row items-center no-wrap q-gutter-x-sm">
          <q-avatar color="green-1" text-color="positive" icon="receipt_long" size="40px" />
          <div>
            <div class="row items-center q-gutter-x-sm">
              <span class="text-subtitle2 text-weight-bold">Via do Pedido #{{ pedido.id }}</span>
              <q-badge color="orange-2" text-color="orange-10" label="SEM VALOR FISCAL" />
            </div>
            <div class="text-caption text-grey-7">Apenas para visualização ou download</div>
          </div>
        </div>
        <q-btn id="btn-close-cupom-modal" flat round dense icon="close" @click="emit('fechar')" />
      </q-card-section>
      <q-separator class="no-print" />

      <!-- Cupom -->
      <q-card-section class="col scroll cupom-area row justify-center">
        <div id="printable-cupom" class="cupom">
          <!-- Marca -->
          <div class="text-center">
            <svg class="cupom-logo" viewBox="0 0 64 64" fill="none" aria-label="Logo Save All" role="img">
              <path d="M14 30 H50 L45 52 H19 Z" fill="#66BB6A" />
              <rect x="10" y="24" width="44" height="6" rx="3" fill="#C8E6C9" />
              <polygon points="18,24 24,15 28,24" fill="#FFA726" />
              <circle cx="34" cy="20" r="6" fill="#EF5350" />
              <circle cx="44" cy="22" r="4" fill="#FFEE58" />
            </svg>
            <div class="cupom-brand">SAVE ALL</div>
            <div class="cupom-sub">Economia Circular</div>
            <div class="cupom-sub">Resgate Consciente de Alimentos</div>
          </div>

          <div class="cupom-dash" />

          <div class="text-center text-weight-bold">DOCUMENTO AUXILIAR DE VENDA</div>
          <div class="text-center cupom-sub">(modelo NFC-e · uso ilustrativo)</div>
          <div class="cupom-warning text-center q-mt-sm">
            <div class="text-weight-bold">SEM VALOR FISCAL</div>
            <div class="cupom-sub">Não é NFC-e oficial. Apenas para visualização / download.</div>
          </div>

          <div class="cupom-dash" />

          <div class="row justify-between text-weight-bold"><span>Pedido:</span><span>#{{ pedido.id }}</span></div>
          <div class="row justify-between"><span>Data:</span><span>{{ visao.dataTexto }}</span></div>
          <div class="q-mt-xs">Estabelecimento: {{ visao.nomeLoja }}</div>
          <div>Consumidor: {{ visao.nomeCliente }}</div>
          <div v-if="visao.endereco" class="cupom-sub">Entrega: {{ visao.endereco }}</div>

          <div class="cupom-dash" />

          <div class="text-weight-bold">ITEM DESCRIÇÃO</div>
          <div v-for="(item, indice) in visao.itens" :key="item.itemId || indice" class="q-mt-xs">
            <div>{{ String(indice + 1).padStart(2, '0') }} {{ item.name }}</div>
            <div class="row justify-between">
              <span>&nbsp;&nbsp;&nbsp;{{ item.quantity }} UN x {{ formatarValor(item.price) }}</span>
              <span>{{ formatarValor(item.price * item.quantity) }}</span>
            </div>
          </div>

          <div class="cupom-dash" />

          <div class="row justify-between"><span>QTD. TOTAL DE ITENS</span><span>{{ visao.quantidadeTotal }}</span></div>
          <div class="row justify-between"><span>VALOR DOS ITENS R$</span><span>{{ formatarValor(visao.subtotal) }}</span></div>
          <div v-if="visao.taxaEntrega > 0" class="row justify-between"><span>Frete / entrega R$</span><span>{{ formatarValor(visao.taxaEntrega) }}</span></div>
          <div v-if="visao.taxaExtra > 0" class="row justify-between"><span>Taxa de transação R$</span><span>{{ formatarValor(visao.taxaExtra) }}</span></div>
          <div v-if="visao.desconto > 0" class="row justify-between"><span>Desconto (pontos) R$</span><span>-{{ formatarValor(visao.desconto) }}</span></div>
          <div class="row justify-between cupom-total q-mt-sm"><span>VALOR A PAGAR R$</span><span>{{ formatarValor(visao.total) }}</span></div>

          <div class="cupom-dash" />

          <div class="row justify-between text-weight-bold"><span>FORMA DE PAGAMENTO</span><span>VALOR PAGO</span></div>
          <div class="row justify-between"><span>{{ visao.formaPagamento }}</span><span>{{ formatarValor(visao.total) }}</span></div>

          <div class="cupom-dash" />

          <div class="text-center cupom-sub">Tributos: não informado</div>
          <div class="text-center cupom-sub">Consulta de autenticidade: não se aplica</div>
          <div class="text-center text-weight-bold q-mt-sm">VIA DO CONSUMIDOR</div>
          <div class="text-center cupom-sub">Emitido em {{ visao.emitidoEm }}</div>
          <div class="text-center text-weight-bold cupom-thanks q-mt-sm">Obrigado por salvar alimentos!</div>
          <div class="text-center cupom-sub">saveall · economia circular</div>
        </div>
      </q-card-section>

      <q-separator class="no-print" />

      <!-- Ações -->
      <q-card-actions align="right" class="q-pa-md q-gutter-x-sm no-print">
        <q-btn id="btn-cupom-print" outline no-caps color="primary" icon="print" label="Imprimir" @click="imprimir" />
        <q-btn id="btn-cupom-download" unelevated no-caps color="positive" icon="download" label="Baixar PDF" @click="baixarPdf" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style scoped lang="scss">
.cupom-modal {
  width: 100%;
  max-width: 420px;
  max-height: 94vh;
}

.cupom-area {
  background: rgba(128, 128, 128, 0.18);
}

.cupom {
  width: 100%;
  max-width: 320px;
  background: #fff;
  color: #111;
  padding: 18px 16px;
  font-family: "Courier New", Courier, monospace;
  font-size: 12px;
  line-height: 1.35;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
}

.cupom-logo {
  width: 52px;
  height: 52px;
}

.cupom-brand {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: #2e7d32;
  line-height: 1.1;
}

.cupom-sub {
  font-size: 10px;
  color: #444;
}

.cupom-dash {
  border-top: 1px dashed #000;
  margin: 10px 0;
}

.cupom-warning {
  border: 1px solid #000;
  padding: 6px 4px;
}

.cupom-total {
  font-size: 15px;
  font-weight: 800;
}

.cupom-thanks {
  color: #2e7d32;
}

@media print {
  .no-print {
    display: none !important;
  }

  body * {
    visibility: hidden;
  }

  #printable-cupom,
  #printable-cupom * {
    visibility: visible;
  }

  #printable-cupom {
    position: absolute;
    left: 0;
    top: 0;
    width: 80mm !important;
    max-width: 80mm !important;
    padding: 4mm !important;
    box-shadow: none !important;
  }
}
</style>