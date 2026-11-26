<script setup>
// Apresenta os termos e informações que acompanham os relatórios da loja.
import { ref, computed, onMounted, onUnmounted } from "vue";
import { servicoDoacoes } from "../../services/servicoDoacoes";
import { useAppStore } from "../../stores/estadoApp";

// Entradas recebidas do componente pai que configuram os dados e opções desta tela.
const props = defineProps({
  // Registros ESG da loja (doações e descartes já registrados)
  disposals: { type: Array, default: () => [] },
  modoEscuro: Boolean
});
const { triggerNotification } = useAppStore();

// Estado local reativo usado para acompanhar seleções, formulários e etapas da interface.
const aba = ref("doacao");
const ofertas = ref([]);
// Ações da tela validam a interação e encaminham as alterações ou eventos necessários.
const carregar = () => {
  try {
    ofertas.value = servicoDoacoes.getDonationOffers();
  } catch {
    ofertas.value = [];
  }
};
onMounted(() => {
  carregar();
  window.addEventListener("saveall_donation_offer_updated", carregar);
  window.addEventListener("saveall_donation_offer_created", carregar);
});
onUnmounted(() => {
  window.removeEventListener("saveall_donation_offer_updated", carregar);
  window.removeEventListener("saveall_donation_offer_created", carregar);
});

const dataBR = (v) => {
  const d = new Date(v);
  return isNaN(d.getTime()) ? "N/A" : d.toLocaleDateString("pt-BR");
};
// Termos de doação: toda doação aceita pela entidade (assinada pelas duas partes) ou já entregue
const termosDoacao = computed(() =>
  ofertas.value
    .filter((o) => o.status === "accepted" || o.status === "completed")
    .map((o) => ({
      oferta: o,
      titulo: o.foodName,
      destino: o.recipientOrg,
      data: dataBR(o.entregueEm || o.respondedAt || o.criadoEm),
      qtd: o.quantity,
      entregue: o.status === "completed"
    }))
);
// Termos de descarte: um por descarte registrado
const termosDescarte = computed(() =>
  props.disposals
    .filter((l) => l.type === "discard")
    .map((l) => ({
      log: l,
      titulo: l.foodName,
      destino: l.discardDestination || "Destino de descarte",
      data: dataBR(l.date),
      qtd: l.quantity
    }))
);

const baixarDoacao = (item) => {
  try {
    servicoDoacoes.downloadDonationPdf(item.oferta);
  } catch (erro) {
    triggerNotification(erro.message || "Não foi possível gerar o termo.", "error");
  }
};
const baixarDescarte = (item) => {
  try {
    servicoDoacoes.downloadDisposalCertificatePdf(item.log);
  } catch (erro) {
    triggerNotification(erro.message || "Não foi possível gerar o termo.", "error");
  }
};
</script>

<template>
<!-- Interface principal: apresenta os termos e informações que acompanham os relatórios da loja. -->
  <div>
    <q-tabs v-model="aba" dense no-caps active-color="primary" indicator-color="primary" align="justify">
      <q-tab name="doacao" :label="`Termos de doação (${termosDoacao.length})`" />
      <q-tab name="descarte" :label="`Termos de descarte (${termosDescarte.length})`" />
    </q-tabs>
    <q-separator :dark="modoEscuro" />
    <q-tab-panels v-model="aba" animated :class="modoEscuro ? 'bg-transparent' : ''">
      <q-tab-panel name="doacao" class="q-pa-sm">
        <div v-if="!termosDoacao.length" class="text-caption text-grey-6 q-pa-md text-center">
          Nenhum termo de doação ainda. Ele aparece quando a entidade aceita a doação.
        </div>
        <q-list v-else separator :dark="modoEscuro">
          <q-item v-for="t in termosDoacao" :key="t.oferta.id">
            <q-item-section>
              <q-item-label class="text-weight-bold">{{ t.titulo }}</q-item-label>
              <q-item-label caption>Entidade: {{ t.destino }} · {{ t.qtd }} un · {{ t.data }}</q-item-label>
            </q-item-section>
            <q-item-section side>
              <div class="row items-center q-gutter-x-sm">
                <q-badge :color="t.entregue ? 'positive' : 'info'" :label="t.entregue ? 'Entregue' : 'Aceita'" />
                <q-btn flat dense no-caps color="primary" icon="picture_as_pdf" label="Termo PDF" @click="baixarDoacao(t)" />
              </div>
            </q-item-section>
          </q-item>
        </q-list>
      </q-tab-panel>
      <q-tab-panel name="descarte" class="q-pa-sm">
        <div v-if="!termosDescarte.length" class="text-caption text-grey-6 q-pa-md text-center">
          Nenhum termo de descarte ainda.
        </div>
        <q-list v-else separator :dark="modoEscuro">
          <q-item v-for="t in termosDescarte" :key="t.log.id">
            <q-item-section>
              <q-item-label class="text-weight-bold">{{ t.titulo }}</q-item-label>
              <q-item-label caption>Destino: {{ t.destino }} · {{ t.qtd }} un · {{ t.data }}</q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-btn flat dense no-caps color="primary" icon="picture_as_pdf" label="Termo PDF" @click="baixarDescarte(t)" />
            </q-item-section>
          </q-item>
        </q-list>
      </q-tab-panel>
    </q-tab-panels>
  </div>
</template>