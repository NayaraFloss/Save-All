<script setup>
import { ocultarSurpresa } from "../utils/pedidoSurpresa.js";
import FundoSustentavel from "components/FundoSustentavel.vue";
import { useRouter } from "vue-router";
import { ref, computed } from "vue";
import { useQuasar } from "quasar";
import { storeToRefs } from "pinia";
import { useAppStore } from "stores/estadoApp";
import VisualizadorPdfPedidoModal from "components/VisualizadorPdfPedidoModal.vue";
import { addressMatchesCity, getCityName } from "src/utils/cidades";
import { calculateDeliveryFee, extractCep, formatMoney } from "src/utils/frete";
import { servicoSorteio } from "src/services/servicoSorteio";
const router = useRouter();
const $q = useQuasar();
defineOptions({ name: "FinalizarPedidoPage" });
const appStore = useAppStore();
const { cart, orders, stores, cartStoreId, usuarioAtual, selectedCity, modoEscuro, enderecoEntrega } = storeToRefs(appStore);
const { getCartSubtotal, submitOrder, triggerNotification, clearCart, definirEnderecoEntrega } = appStore;
// Desiste deste pedido: tira os itens e volta para as lojas
const removerItensDoPedido = () => {
  const eraSurpresa = cart.value.length > 0 && cart.value.every((item) => item.surpresa);
  const lojaId = cartStoreId.value;
  clearCart();
  // Sacola surpresa não paga: a loja não "gasta" a vez dela no rodízio
  if (eraSurpresa && lojaId) servicoSorteio.devolverLojaAoRodizio(lojaId);
  triggerNotification("Itens removidos. Escolha uma loja para fazer outro pedido.", "success");
  router.push({ name: "ListaLojas" });
};
const paymentOptions = [
  { label: "Pix", value: "Pix", icon: "pix", caption: "Pagamento instantâneo" },
  { label: "Cartão de Crédito", value: "Cartão de Crédito", icon: "credit_card", caption: "Pague com seu cartão" },
  { label: "Cartão de Débito", value: "Cartão de Débito", icon: "credit_score", caption: "Débito na hora" },
  { label: "Dinheiro", value: "Dinheiro", icon: "payments", caption: "Pague na entrega" }
];
// Nenhuma forma vem marcada: é preciso escolher uma para finalizar o pedido
const formaPagamento = ref("");
const pointsInput = ref("0");
const discountValue = ref(0);
const showPointsModal = ref(false);
const showThankYouModal = ref(false);
const showPdfModal = ref(false);
const createdOrder = ref(null);
const confirmedPointsUsed = ref(0);
const confirmedDiscount = ref(0);
const isDesktop = computed(() => $q.screen.gt.sm);

// ---------- Endereço e frete ----------
// Endereço do cadastro = padrão; o cliente pode escolher outro (ou incluir um novo) só para este pedido
const enderecoCadastro = computed(() => usuarioAtual.value?.address || "");
const deliveryAddress = computed(() => enderecoEntrega.value?.full || enderecoCadastro.value);
const usandoCadastro = computed(() => !enderecoEntrega.value);
const orderCityName = computed(() => getCityName(selectedCity.value));
// O endereço de entrega precisa ser da mesma cidade em que o pedido foi feito
const addressOk = computed(() => !!deliveryAddress.value && addressMatchesCity(deliveryAddress.value, selectedCity.value));
// Dados estruturados só valem se ainda correspondem ao endereço salvo
const addressData = computed(() => {
  const escolhido = enderecoEntrega.value;
  if (escolhido) return escolhido.street ? escolhido : null;
  const d = usuarioAtual.value?.addressData;
  return d && d.full === deliveryAddress.value ? d : null;
});
// Opções de entrega: o endereço do cadastro (padrão) e os endereços já salvos
const opcoesEndereco = computed(() => {
  const lista = [];
  const vistos = new Set();
  const norm = (t) => String(t || "").trim().toLowerCase();
  const user = usuarioAtual.value;
  if (user?.address) {
    const estruturado = user.addressData?.full === user.address ? user.addressData : {};
    lista.push({ id: "cadastro", ...estruturado, full: user.address, rotulo: "Endere\xE7o do cadastro (padr\xE3o)", padrao: true });
    vistos.add(norm(user.address));
  }
  (user?.savedAddresses || []).forEach((a) => {
    if (!a?.full || vistos.has(norm(a.full))) return;
    vistos.add(norm(a.full));
    lista.push({ ...a, rotulo: "Endere\xE7o salvo", padrao: false });
  });
  return lista;
});
const opcaoSelecionada = (opcao) => (opcao.padrao ? usandoCadastro.value : enderecoEntrega.value?.full === opcao.full);
const escolherEndereco = (opcao) => {
  if (!addressMatchesCity(opcao.full, selectedCity.value)) {
    triggerNotification(`Seu pedido \xE9 em ${selectedCity.value}. Este endere\xE7o \xE9 de outra cidade.`, "warning");
    return;
  }
  definirEnderecoEntrega(opcao.padrao ? null : opcao);
};
const incluirEndereco = () => router.push({ name: "SelecaoEndereco", query: { origem: "checkout" } });
const cartStore = computed(() => (stores.value || []).find((s) => s.id === cartStoreId.value));
const feeInfo = computed(() =>
  calculateDeliveryFee(cartStore.value?.deliveryConfig, {
    cep: addressData.value?.cep || extractCep(deliveryAddress.value),
    neighborhood: addressData.value?.neighborhood || ""
  })
);
const taxaEntrega = computed(() => feeInfo.value.fee);

// Sacola surpresa: o cliente vê uma única linha; o conteúdo e a loja ficam em segredo até a entrega
const sacolaSurpresa = computed(() => cart.value.length > 0 && cart.value.every((item) => item.surpresa));
const totalUnidades = computed(() => cart.value.reduce((soma, item) => soma + item.quantity, 0));
const itensExibidos = computed(() =>
  sacolaSurpresa.value
    ? [{
        itemId: "sacola-surpresa",
        name: "Sacola Surpresa",
        quantity: 1,
        price: getCartSubtotal(),
        resumo: `${totalUnidades.value} ${totalUnidades.value === 1 ? "produto selecionado" : "produtos selecionados"} pelo parceiro sorteado`
      }]
    : cart.value
);
const subtotal = computed(() => getCartSubtotal());
// Sacola Surpresa montada com o máximo do dia (pedido acima do disponível)
const mostrarMaximoHoje = computed(() => !!appStore.sacolaMaxima && Math.abs(subtotal.value - appStore.sacolaMaxima.maximo) < 0.02);
const total = computed(() => {
  return Math.max(0, subtotal.value + taxaEntrega.value - confirmedDiscount.value);
});

// ---------- Pagamento ----------
const selectPayment = (value) => {
  formaPagamento.value = value;
};

const handlePointsChange = () => {
  const num = parseInt(pointsInput.value) || 0;
  discountValue.value = num * 5e-3;
};
const usarTodosPontos = () => {
  pointsInput.value = String(usuarioAtual.value?.points || 0);
  handlePointsChange();
};
const handleConfirmPointsRedempt = () => {
  const numPoints = parseInt(pointsInput.value) || 0;
  const maxAvailable = usuarioAtual.value?.points || 0;
  if (numPoints > maxAvailable) {
    triggerNotification(`Voc\xEA n\xE3o possui pontos suficientes. M\xE1ximo dispon\xEDvel: ${maxAvailable} pts`, "error");
    return;
  }
  confirmedPointsUsed.value = numPoints;
  confirmedDiscount.value = discountValue.value;
  showPointsModal.value = false;
  triggerNotification(`Desconto de R$ ${discountValue.value.toFixed(2)} ativado! \u2B50`, "success");
};
const handlePlaceOrder = async () => {
  if (!addressOk.value) {
    triggerNotification(`O endere\xE7o de entrega precisa ser de ${orderCityName.value}, a mesma cidade do pedido.`, "warning");
    return;
  }
  if (!formaPagamento.value) {
    triggerNotification("Selecione uma forma de pagamento para finalizar o pedido.", "warning");
    return;
  }
  try {
    const res = await submitOrder(formaPagamento.value, confirmedPointsUsed.value, confirmedDiscount.value, taxaEntrega.value);
    createdOrder.value = res || (orders.value.length > 0 ? orders.value[0] : null);
    showThankYouModal.value = true;
  } catch {
    // erro já tratado/notificado pela store
  }
};
const handleThankYouConfirm = (print) => {
  showThankYouModal.value = false;
  if (print) {
    if (!createdOrder.value && orders.value.length > 0) {
      createdOrder.value = orders.value[0];
    }
    showPdfModal.value = true;
  } else {
    router.push({ name: 'StatusPedido' });
  }
};
const handleClosePdfModal = () => {
  showPdfModal.value = false;
  router.push({ name: 'StatusPedido' });
};
</script>

<template>
  <q-page class="finalizar-page column no-wrap">
    <FundoSustentavel />
    <!-- Cabeçalho -->
    <q-toolbar class="finalizar-header">
      <q-btn
        id="btn-checkout-back"
        flat
        round
        dense
        icon="arrow_back"
        @click="router.back()"
      />
      <span class="q-ml-sm text-caption text-grey-6 text-uppercase text-weight-bold letter-wide font-display">Pedido</span>
      <q-space />
      <span class="text-caption text-uppercase text-weight-bold text-secondary letter-wide font-display">Finalizar Compra</span>
    </q-toolbar>
    <q-separator />

    <!-- Conteúdo -->
    <div class="col finalizar-scroll">
      <div class="finalizar-container">
        <!-- Nenhum item escolhido -->
        <q-card v-if="cart.length === 0" flat bordered class="q-pa-lg text-center q-gutter-y-sm">
          <q-icon name="storefront" size="48px" color="grey-5" />
          <div class="text-subtitle1 text-weight-bold">Nenhum item escolhido</div>
          <div class="text-caption text-grey-6">Escolha um estabelecimento e os itens que deseja pedir.</div>
          <q-btn unelevated no-caps color="primary" class="text-weight-bold" label="Ver lojas" @click="router.push({ name: 'ListaLojas' })" />
        </q-card>

        <div v-else class="row q-col-gutter-lg items-start">
          <!-- COLUNA PRINCIPAL -->
          <div class="col-12 col-md-7 q-gutter-y-md">
            <!-- Endereço de entrega -->
            <q-card flat bordered class="section-card" :class="{ 'address-card--error': !addressOk }">
              <q-card-section class="q-pa-md">
                <div class="section-title">
                  <q-icon name="place" color="primary" size="22px" />
                  <span>Entregar em</span>
                  <q-space />
                  <q-btn
                    id="btn-checkout-change-address"
                    no-caps
                    dense
                    rounded
                    size="md"
                    :color="addressOk ? 'primary' : 'negative'"
                    :outline="addressOk"
                    :unelevated="!addressOk"
                    class="text-weight-bold q-px-md"
                    icon="add_location_alt"
                    label="Incluir endereço"
                    @click="incluirEndereco"
                  />
                </div>

                <div v-if="addressData" class="address-lines">
                  <div class="text-subtitle1 text-weight-bold">
                    {{ addressData.street }}, {{ addressData.noNumber ? "S/N" : addressData.number }}
                    <span v-if="addressData.complement" class="text-grey-7 text-weight-regular"> · {{ addressData.complement }}</span>
                  </div>
                  <div class="text-body2 text-grey-7">
                    {{ addressData.neighborhood }} · CEP {{ addressData.cep }} · {{ addressData.city }}/{{ addressData.uf }}
                  </div>
                  <div v-if="addressData.reference" class="text-caption text-grey-6">Ref.: {{ addressData.reference }}</div>
                </div>
                <div v-else class="text-subtitle1 text-weight-medium address-lines">
                  {{ deliveryAddress || "Nenhum endereço informado" }}
                </div>

                <q-banner v-if="!addressOk" dense rounded class="address-warning bg-red-1 text-negative text-body2 q-mt-sm">
                  <template #avatar>
                    <q-icon name="warning" color="negative" size="22px" />
                  </template>
                  Seu pedido foi feito em <strong>{{ selectedCity }}</strong>, então o endereço de entrega
                  precisa ser de <strong>{{ orderCityName }}</strong>. Altere o endereço ou volte e escolha outra cidade.
                </q-banner>
                <div v-else class="row items-center no-wrap q-mt-sm text-body2 text-positive">
                  <q-icon name="check_circle" size="18px" class="q-mr-xs" />
                  Endereço dentro da cidade do pedido ({{ selectedCity }})
                </div>
                <q-badge
                  v-if="deliveryAddress"
                  :color="usandoCadastro ? 'green-1' : 'blue-1'"
                  :text-color="usandoCadastro ? 'positive' : 'primary'"
                  class="q-mt-sm text-weight-bold"
                >
                  {{ usandoCadastro ? "Endereço do cadastro (padrão)" : "Endereço escolhido para este pedido" }}
                </q-badge>

                <!-- Trocar para outro endereço já salvo, só para este pedido -->
                <q-list v-if="opcoesEndereco.length > 1" separator bordered class="rounded-borders q-mt-md">
                  <q-item
                    v-for="opcao in opcoesEndereco"
                    :key="opcao.id || opcao.full"
                    clickable
                    v-ripple
                    :class="{ 'opacity-60': !addressMatchesCity(opcao.full, selectedCity) }"
                    @click="escolherEndereco(opcao)"
                  >
                    <q-item-section avatar>
                      <q-icon :name="opcaoSelecionada(opcao) ? 'radio_button_checked' : 'radio_button_unchecked'" :color="opcaoSelecionada(opcao) ? 'positive' : 'grey-6'" />
                    </q-item-section>
                    <q-item-section>
                      <q-item-label class="text-weight-medium">
                        <template v-if="opcao.street">{{ opcao.street }}, {{ opcao.noNumber ? "S/N" : opcao.number }} · {{ opcao.neighborhood }}</template>
                        <template v-else>{{ opcao.full }}</template>
                      </q-item-label>
                      <q-item-label caption>{{ opcao.rotulo }}</q-item-label>
                      <q-item-label v-if="!addressMatchesCity(opcao.full, selectedCity)" caption class="text-negative">
                        Outra cidade — indisponível para este pedido
                      </q-item-label>
                    </q-item-section>
                  </q-item>
                </q-list>
              </q-card-section>
            </q-card>


            <!-- Itens do pedido -->
            <q-card flat bordered class="section-card">
              <q-card-section class="q-pa-md q-pb-sm">
                <div class="section-title">
                  <q-icon name="receipt_long" color="primary" size="22px" />
                  <span>Itens do pedido</span>
                  <q-space />
                  <q-btn
                    id="btn-checkout-limpar"
                    flat
                    dense
                    no-caps
                    color="negative"
                    icon="delete_outline"
                    label="Remover itens"
                    @click="removerItensDoPedido"
                  />
                </div>
              </q-card-section>
              <q-separator />
              <q-list separator>
                <q-item v-for="item in itensExibidos" :key="item.itemId" class="q-py-md">
                  <q-item-section avatar>
                    <q-avatar size="52px" color="green-1" text-color="primary" font-size="28px">🛍️</q-avatar>
                  </q-item-section>
                  <q-item-section>
                    <q-item-label class="text-subtitle1 text-weight-bold">{{ item.name }}</q-item-label>
                    <q-item-label caption class="font-mono">Quantidade: {{ item.quantity }}{{ item.resumo ? " · 100% Surpresa" : "" }}</q-item-label>
                    <q-item-label v-if="item.resumo" caption class="text-primary">{{ item.resumo }} em {{ selectedCity }}</q-item-label>
                    <q-item-label v-else-if="appStore.cartStoreName" caption class="text-primary">{{ appStore.cartStoreName }}</q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <span class="text-subtitle1 font-mono text-weight-bold">R$ {{ (item.price * item.quantity).toFixed(2) }}</span>
                  </q-item-section>
                </q-item>
              </q-list>
            </q-card>

            <!-- Forma de pagamento -->
            <q-card flat bordered class="section-card">
              <q-card-section class="q-pa-md">
                <div class="section-title q-mb-sm">
                  <q-icon name="payments" color="primary" size="22px" />
                  <span>Forma de pagamento</span>
                </div>
                <div v-if="!formaPagamento" class="text-caption text-warning q-mb-sm">
                  Selecione uma forma de pagamento para finalizar o pedido.
                </div>
                <div class="row q-col-gutter-sm">
                  <div v-for="opt in paymentOptions" :key="opt.value" class="col-12 col-sm-6">
                    <q-card
                      :id="`pay-${opt.value.replace(/\s+/g, '-').toLowerCase()}`"
                      flat
                      bordered
                      v-ripple
                      class="pay-tile cursor-pointer"
                      :class="{ 'pay-tile--active': formaPagamento === opt.value }"
                      @click="selectPayment(opt.value)"
                    >
                      <q-card-section class="row items-center no-wrap q-pa-md">
                        <q-avatar
                          size="44px"
                          :color="formaPagamento === opt.value ? 'primary' : 'grey-3'"
                          :text-color="formaPagamento === opt.value ? 'white' : 'grey-8'"
                          :icon="opt.icon"
                          class="q-mr-md"
                        />
                        <div class="col">
                          <div class="text-subtitle2 text-weight-bold">{{ opt.label }}</div>
                          <div class="text-caption text-grey-6">{{ opt.caption }}</div>
                        </div>
                        <q-icon v-if="formaPagamento === opt.value" name="check_circle" color="primary" size="24px" />
                      </q-card-section>
                    </q-card>
                  </div>
                </div>

              </q-card-section>
            </q-card>

          </div>

          <!-- RESUMO -->
          <div class="col-12 col-md-5">
            <div class="summary-sticky">
              <!-- Resgate de pontos (antes do resumo do pedido) -->

              <q-card flat bordered class="points-card section-card q-mb-md">
                <q-card-section class="q-pa-md q-gutter-y-sm">
                  <div class="row items-center no-wrap">
                    <q-avatar size="48px" color="white" text-color="primary" icon="workspace_premium" class="points-avatar q-mr-md" />
                    <div>
                      <div class="text-subtitle1 text-weight-bold">Abata via pontos acumulados</div>
                      <div class="text-body2 text-grey-7">
                        Você possui <span class="text-primary text-weight-bold font-mono">{{ usuarioAtual?.points || 0 }} pontos</span> em saldo. Troque-os por descontos adicionais no total!
                      </div>
                    </div>
                  </div>

                  <q-btn
                    id="btn-redeem-points-modal"
                    outline
                    no-caps
                    color="primary"
                    class="full-width text-weight-bold font-display action-btn"
                    @click="showPointsModal = true"
                  >
                    <span v-if="confirmedPointsUsed > 0">
                      Pontos ativados: {{ confirmedPointsUsed }} pts (-R$ {{ confirmedDiscount.toFixed(2) }})
                    </span>
                    <span v-else>Resgatar pontos acumulados</span>
                  </q-btn>
                </q-card-section>
              </q-card>
              <q-card flat bordered class="finalizar-total section-card">
                <q-card-section class="q-pa-lg q-gutter-y-sm">
                  <div class="section-title">
                    <q-icon name="receipt_long" color="primary" size="22px" />
                    <span>Resumo do pedido</span>
                  </div>

                  <div class="summary-rows q-gutter-y-sm">
                    <div class="row justify-between text-body1">
                      <span class="text-grey-7">Subtotal dos itens</span>
                      <span class="row items-center no-wrap q-gutter-x-sm">
                        <q-chip
                          v-if="mostrarMaximoHoje"
                          id="selo-maximo-hoje"
                          dense
                          square
                          icon="auto_awesome"
                          color="amber-2"
                          text-color="amber-10"
                          class="q-ma-none text-weight-bold"
                          label="Máximo disponível hoje"
                        >
                          <q-tooltip>Você pediu R$ {{ (appStore.sacolaMaxima?.pedido || 0).toFixed(2).replace('.', ',') }}; este foi o máximo que as padarias tinham disponível hoje.</q-tooltip>
                        </q-chip>
                        <span class="font-mono">R$ {{ subtotal.toFixed(2) }}</span>
                      </span>
                    </div>
                    <div class="row justify-between items-start text-body1">
                      <span class="text-grey-7">
                        Frete entrega
                        <span class="block text-caption text-grey-6">
                          {{ feeInfo.source === "padrao" ? "Taxa padrão do estabelecimento" : feeInfo.label }}
                        </span>
                      </span>
                      <span class="font-mono">{{ formatMoney(taxaEntrega) }}</span>
                    </div>
                    <div v-if="confirmedDiscount > 0" class="row justify-between text-primary text-weight-bold text-body1">
                      <span>Desconto de pontos ({{ confirmedPointsUsed }} pts)</span>
                      <span class="font-mono">- R$ {{ confirmedDiscount.toFixed(2) }}</span>
                    </div>
                  </div>

                  <q-separator class="q-my-md" />

                  <div class="row justify-between items-center">
                    <span class="text-h6 text-weight-bold">Total final</span>
                    <span class="text-h4 text-weight-bold text-secondary font-mono">R$ {{ total.toFixed(2) }}</span>
                  </div>

                  <div v-if="isDesktop" class="q-pt-md q-gutter-y-sm">
                    <q-btn
                      id="btn-checkout-submit"
                      unelevated
                      rounded
                      no-caps
                      color="secondary"
                      text-color="dark"
                      class="full-width text-weight-bolder text-uppercase font-display action-btn"
                      icon-right="send"
                      label="Enviar pedido"
                      :disable="!addressOk || !formaPagamento"
                      @click="handlePlaceOrder"
                    />
                    <q-btn
                      id="btn-checkout-cancel"
                      outline
                      rounded
                      no-caps
                      color="grey-7"
                      class="full-width text-weight-bold text-uppercase font-display action-btn"
                      label="Voltar"
                      @click="router.push({ name: 'PedidoCustomizado' })"
                    />
                  </div>
                </q-card-section>
              </q-card>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Rodapé (celular e tablet) -->
    <template v-if="!isDesktop && cart.length > 0">
      <q-separator />
      <div class="mobile-footer row items-center no-wrap q-pa-md q-gutter-x-sm no-print">
        <q-btn
          id="btn-checkout-cancel"
          outline
          rounded
          no-caps
          color="grey-7"
          class="text-weight-bold text-uppercase font-display action-btn"
          icon="arrow_back"
          @click="router.push({ name: 'PedidoCustomizado' })"
        />
        <q-btn
          id="btn-checkout-submit"
          unelevated
          rounded
          no-caps
          color="secondary"
          text-color="dark"
          class="col text-weight-bolder text-uppercase font-display action-btn"
          :label="`Enviar pedido · R$ ${total.toFixed(2)}`"
          :disable="!addressOk || !formaPagamento"
          @click="handlePlaceOrder"
        />
      </div>
    </template>

    <!-- Modal: resgate de pontos -->
    <q-dialog v-model="showPointsModal">
      <q-card class="dialog-card text-center">
        <q-card-section class="q-gutter-y-sm">
          <q-avatar size="48px" color="positive" text-color="white" icon="workspace_premium" />
          <div class="text-subtitle1 text-weight-bold font-display">Resgate de Recompensa</div>
          <div class="text-caption text-grey-6 text-weight-light">
            Sua economia te rendeu <span class="text-primary text-weight-bold font-mono">{{ usuarioAtual?.points || 0 }} pontos</span> acumulados.
          </div>
          <div class="text-caption text-grey-6 text-italic">Cada ponto equivale a R$ 0,005 (1.000 pontos = R$ 5,00 em descontos).</div>
        </q-card-section>

        <q-card-section class="q-pt-none">
          <q-card flat bordered class="q-pa-sm">
            <div class="text-caption text-grey-6 text-uppercase font-mono text-left q-mb-xs">Quantos deseja utilizar?</div>
            <div class="row items-center no-wrap q-gutter-x-sm">
              <q-input
                id="input-modal-points"
                :model-value="pointsInput"
                type="number"
                step="100"
                min="0"
                :max="usuarioAtual?.points || 0"
                outlined
                dense
                class="col font-mono text-weight-bold"
                input-class="text-center"
                @update:model-value="(v) => { pointsInput = v; handlePointsChange(); }"
              />
              <span class="text-grey-6 font-mono">=</span>
              <q-chip square outline color="warning" class="col text-weight-bold font-mono justify-center q-ma-none">
                R$ {{ discountValue.toFixed(2) }}
              </q-chip>
            </div>
            <q-btn
              id="btn-use-all-points"
              flat
              dense
              no-caps
              color="positive"
              icon="done_all"
              label="Utilizar todos os pontos"
              class="full-width q-mt-sm"
              :disable="!(usuarioAtual?.points > 0)"
              @click="usarTodosPontos"
            />
          </q-card>
        </q-card-section>

        <q-card-actions align="center" class="q-gutter-x-md q-pb-md">
          <q-btn
            id="btn-points-modal-cancel"
            round
            flat
            color="grey-7"
            icon="arrow_back"
            title="Cancelar"
            @click="showPointsModal = false"
          />
          <q-btn
            id="btn-points-modal-confirm"
            round
            unelevated
            color="positive"
            icon="check_circle"
            title="Confirmar pontos"
            @click="handleConfirmPointsRedempt"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Modal: agradecimento -->
    <q-dialog v-model="showThankYouModal" persistent>
      <q-card class="dialog-card text-center">
        <q-card-section class="q-gutter-y-sm">
          <q-avatar size="56px" color="green-1" text-color="primary" font-size="28px">🌱</q-avatar>
          <div class="text-subtitle1 text-weight-bold text-primary font-display">Muito obrigado pelo seu pedido!</div>
          <div class="text-caption text-grey-6 text-weight-light">
            Sua escolha consciente ajuda a reduzir o desperdício de alimentos de excelentes parceiros e faz toda a diferença para o nosso planeta! 🌍
          </div>
        </q-card-section>
        <q-card-actions class="q-px-md q-pb-md">
          <q-btn
            id="btn-thankyou-track"
            unelevated
            no-caps
            color="primary"
            class="full-width text-weight-bold text-uppercase font-display"
            label="Acompanhar Pedido em Andamento →"
            @click="handleThankYouConfirm(false)"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Modal: PDF do pedido -->
    <VisualizadorPdfPedidoModal
      :show="showPdfModal"
      :order="ocultarSurpresa(createdOrder)"
      :modoEscuro="modoEscuro"
      @close="handleClosePdfModal"
    />
  </q-page>
</template>

<style scoped lang="scss">
.finalizar-page {
  height: 100%;
}

.finalizar-scroll {
  overflow-y: auto;
  min-height: 0;
  padding: 20px 16px;
}

.finalizar-container {
  width: 100%;
  max-width: 100%;
  margin: 0 auto;
}

.summary-sticky {
  position: sticky;
  top: 8px;
}

.section-card {
  border-radius: 16px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.opacity-60 {
  opacity: 0.6;
}
.address-lines {
  margin-top: 4px;
}

.pay-tile {
  border-radius: 14px;
  border-width: 2px;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;

  &:hover {
    transform: translateY(-1px);
  }

  &--active {
    border-color: var(--q-primary);
    box-shadow: 0 0 0 3px rgba(67, 160, 71, 0.18);
  }
}

.action-btn {
  height: 52px;
  font-size: 15px;
}

.letter-wide {
  letter-spacing: 0.1em;
}

.dialog-card {
  width: 100%;
  max-width: 320px;
}

.points-card {
  background: rgba(67, 160, 71, 0.06);
  border-color: rgba(67, 160, 71, 0.2);
}

.points-avatar {
  border: 1px solid rgba(67, 160, 71, 0.3);
}

.address-card--error {
  border-color: var(--q-negative);
}

.body--dark {
  .address-warning {
    background: rgba(244, 67, 54, 0.14) !important;
    color: #ef9a9a !important;
  }

  .mobile-footer {
    background: #07131d;
  }
}
</style>