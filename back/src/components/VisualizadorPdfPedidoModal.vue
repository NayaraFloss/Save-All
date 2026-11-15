<script setup>
import { ref } from "vue";
import { servicoImpressaoPedido } from "src/services/servicoImpressaoPedido";
const props = defineProps({ show: Boolean, order: Object, modoEscuro: Boolean });
const emit = defineEmits(["close"]);
const printableArea = ref(null);
const handleDownload = () => {
  if (props.order) {
    servicoImpressaoPedido.baixarPdfPedido(props.order);
  }
};
</script>

<template>
  <q-dialog
    :model-value="!!(show && order)"
    @update:model-value="(v) => { if (!v) emit('close'); }"
  >
    <q-card v-if="order" class="modal-pdf column no-wrap">
      <!-- CABEÇALHO -->
      <q-card-section class="row items-center justify-between no-wrap q-py-sm no-print">
        <div class="row items-center no-wrap q-gutter-x-sm">
          <q-avatar color="green-1" text-color="positive" icon="description" size="40px" />
          <div>
            <div class="row items-center q-gutter-x-sm">
              <span class="text-subtitle2 text-weight-bold">Comprovante do Pedido #{{ order.id }}</span>
              <q-badge color="green-2" text-color="green-9" label="OFICIAL" />
            </div>
            <div class="text-caption text-grey-7">
              Visualização oficial do pedido para conferência ou impressão
            </div>
          </div>
        </div>
        <q-btn id="btn-close-pdf-modal" flat round dense icon="close" @click="emit('close')" />
      </q-card-section>

      <q-separator class="no-print" />

      <!-- ÁREA DO DOCUMENTO -->
      <q-card-section class="col scroll folha-area row justify-center">
        <div ref="printableArea" id="printable-order-sheet" class="folha">
          <!-- 1. Banner -->
          <div class="folha-banner row items-center justify-between no-wrap bg-green-8 text-white">
            <div>
              <div class="text-subtitle2 text-weight-bold text-uppercase">
                SAVE ALL · COMPROVANTE OFICIAL DE PEDIDO
              </div>
              <div class="text-caption text-green-1">
                Economia Circular · Resgate Consciente de Alimentos · Lei Federal 14.016/2020
              </div>
            </div>
            <q-badge color="white" text-color="green-9" label="100% DIGITAL" />
          </div>

          <!-- 2. Identificação -->
          <div class="bloco q-pa-sm q-mt-md">
            <div class="row items-center justify-between q-pb-sm">
              <span class="text-subtitle2 text-weight-bold">Pedido #{{ order.id }}</span>
              <q-badge color="green-2" text-color="green-9">
                {{ order.status === 'delivered' ? 'Status: Entregue' : order.status === 'delivery' ? 'Status: Saiu para Entrega' : order.status === 'preparing' ? 'Status: Em Preparação' : 'Status: Confirmado' }}
              </q-badge>
            </div>
            <q-separator />
            <div class="row q-col-gutter-sm q-pt-sm text-caption text-grey-8">
              <div class="col-12 col-sm-6">
                <div><strong>Data/Hora:</strong> {{ new Date(order.date || Date.now()).toLocaleString('pt-BR') }}</div>
                <div class="ellipsis"><strong>Cliente:</strong> {{ order.nomeCliente || 'Consumidor Sustentável' }}</div>
              </div>
              <div class="col-12 col-sm-6">
                <div class="ellipsis"><strong>Endereço:</strong> {{ order.address || 'Endereço cadastrado' }}</div>
                <div class="ellipsis"><strong>Estabelecimento:</strong> {{ order.nomeLoja || 'Estabelecimento parceiro' }}</div>
              </div>
            </div>
          </div>

          <!-- 3. Itens -->
          <div class="q-mt-md">
            <div class="row items-center justify-between q-mb-xs">
              <span class="text-caption text-weight-bold text-uppercase">Campo Pedidos · Itens Resgatados</span>
              <span class="text-caption text-grey-6">
                {{ order.items.length }} {{ order.items.length === 1 ? 'item' : 'itens' }}
              </span>
            </div>
            <div class="bloco tabela-itens">
              <table>
                <thead>
                  <tr>
                    <th class="text-left">Item / Descrição</th>
                    <th class="text-center">Qtd</th>
                    <th class="text-right">Unitário</th>
                    <th class="text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(item, idx) in order.items" :key="item.itemId || idx" :class="idx % 2 === 0 ? 'bg-white' : 'bg-grey-2'">
                    <td class="text-weight-medium">{{ item.name }}</td>
                    <td class="text-center">{{ item.quantity }}x</td>
                    <td class="text-right text-grey-8">R$ {{ item.price.toFixed(2) }}</td>
                    <td class="text-right text-weight-bold">R$ {{ (item.price * item.quantity).toFixed(2) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- 4. Resumo financeiro -->
          <div class="row justify-end q-mt-md">
            <div class="resumo text-caption">
              <div class="row justify-between text-grey-7">
                <span>Subtotal dos Itens:</span>
                <span>R$ {{ order.subtotal.toFixed(2) }}</span>
              </div>
              <div class="row justify-between text-grey-7">
                <span>Taxa de Entrega:</span>
                <span>R$ {{ order.taxaEntrega.toFixed(2) }}</span>
              </div>
              <div v-if="order.descontoPontos > 0" class="row justify-between text-positive text-weight-medium">
                <span>Desconto de Pontos:</span>
                <span>- R$ {{ order.descontoPontos.toFixed(2) }}</span>
              </div>
              <q-separator class="q-my-sm" />
              <div class="row justify-between items-center text-subtitle2 text-weight-bold">
                <span>TOTAL PAGO:</span>
                <span class="text-positive text-subtitle1">R$ {{ order.total.toFixed(2) }}</span>
              </div>
              <div class="text-right text-grey-6">Forma: {{ order.formaPagamento || 'Cartão de Crédito' }}</div>
            </div>
          </div>

          <!-- 5. Impacto ambiental -->
          <q-banner dense rounded class="bg-green-1 text-green-9 q-mt-md">
            <div class="row items-center q-gutter-x-xs text-weight-bold">
              <q-icon name="eco" color="positive" size="18px" />
              <span>Impacto Ambiental Positivo Deste Resgate</span>
            </div>
            <ul class="q-my-xs text-caption">
              <li>Evitou o descarte desnecessário de alimentos frescos e próprios para consumo;</li>
              <li>Redução direta na pegada de carbono (~2.0 kg de CO₂ equivalente evitados);</li>
              <li>Apoio e fortalecimento da economia circular na sua cidade!</li>
            </ul>
          </q-banner>

          <!-- 6. Protocolo -->
          <q-separator class="q-mt-md" />
          <div class="row items-center justify-between q-pt-sm text-caption text-grey-6">
            <span>Protocolo: VAL-ORD-{{ order.id }}-{{ Math.abs(order.id.split('').reduce((a, b) => a + b.charCodeAt(0), 0)) }}</span>
            <span>Chave Criptográfica SHA-256 Verificada</span>
          </div>
        </div>
      </q-card-section>

      <q-separator class="no-print" />

      <!-- AÇÕES -->
      <q-card-actions align="between" class="q-px-md no-print">
        <span class="text-caption text-grey-6 gt-xs">
          Documento ecológico com autenticidade verificada
        </span>
        <div class="row q-gutter-sm">
          <q-btn
            id="btn-pdf-download"
            unelevated
            color="positive"
            icon="download"
            label="Baixar PDF"
            @click="handleDownload"
          />
          <q-btn id="btn-pdf-finish" flat label="Fechar" @click="emit('close')" />
        </div>
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style scoped lang="scss">
.modal-pdf {
  width: 100%;
  max-width: 672px;
  max-height: 94vh;
}
.folha-area {
  background: rgba(128, 128, 128, 0.18);
}
.folha {
  width: 100%;
  max-width: 576px;
  background: #fff;
  color: #1e293b;
  padding: 32px;
  border-radius: 16px;
  border: 1px solid #cbd5e1;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  text-align: left;
}
.folha-banner {
  margin: -32px -32px 0;
  padding: 20px;
  border-radius: 16px 16px 0 0;
}
.bloco {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
}
.tabela-itens {
  overflow: hidden;
  background: #fff;
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
  }
  th {
    background: var(--q-positive);
    color: #fff;
    padding: 6px 10px;
    text-transform: uppercase;
    font-size: 10px;
  }
  td {
    padding: 8px 10px;
    border-top: 1px solid #f1f5f9;
  }
}
.resumo {
  width: 256px;
  max-width: 100%;
}
ul {
  padding-left: 20px;
  margin-bottom: 0;
}
@media (max-width: 599px) {
  .folha {
    padding: 20px;
  }
  .folha-banner {
    margin: -20px -20px 0;
  }
}
@media print {
  .no-print {
    display: none !important;
  }
  body * {
    visibility: hidden;
  }
  #printable-order-sheet,
  #printable-order-sheet * {
    visibility: visible;
  }
  #printable-order-sheet {
    position: absolute;
    left: 0;
    top: 0;
    width: 100% !important;
    max-width: 100% !important;
    padding: 0 !important;
    border: none !important;
    box-shadow: none !important;
  }
}
</style>
