<script setup>
import BlocoAssinatura from "../components/store/BlocoAssinatura.vue";
import { ref, computed, onMounted, watch } from "vue";
import { storeToRefs } from "pinia";
import { useAppStore } from "../stores/estadoApp";
import { armazem } from "../services/armazemServidor";
const appStore = useAppStore();
// Botão Início do cabeçalho: volta à primeira aba do painel
watch(() => appStore.inicioSinal, () => {
  activeTab.value = "incoming";
});
const { usuarioAtual } = storeToRefs(appStore);
const { alternarModoEscuro, logout, triggerNotification } = appStore;
const activeTab = ref("incoming");
const allLogs = ref([]);
const entityRating = computed(() => Number(usuarioAtual.value?.rating ?? 5));
const suspenso = computed(() => {
  return entityRating.value < 4;
});
// Registros ESG vêm do servidor (tabela registros_descarte)
const loadLogs = () => {
  allLogs.value = armazem.colecao("esg_disposal_logs");
};
onMounted(() => {
  loadLogs();
});
const receivedDiscards = computed(() => {
  return allLogs.value.filter((log) => log.type === "discard" && log.discardDestination === (usuarioAtual.value?.name || "Adubo Org\xE2nico Pinhal"));
});
const pendingIncoming = ref([]);
const gpsCoordinates = ref("");
const captureGps = () => {
  gpsCoordinates.value = "";
  if (typeof navigator === "undefined" || !navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      gpsCoordinates.value = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
    },
    () => {},
    { timeout: 8000 }
  );
};
const drawnSignature = ref("");
const handleSignatureSave = (dataUrl) => {
  drawnSignature.value = dataUrl || "";
};
const handleSignatureClear = () => {
  drawnSignature.value = "";
};
const showSignModal = ref(false);
const activePendingItem = ref(null);
const signatureTypeChoice = ref("digital");
const certificateKey = ref("ICP-Brasil: Adubo-Pinhal-Licenca-29402");
const handleOpenConfirm = (item) => {
  if (suspenso.value) {
    triggerNotification("Sua conta est\xE1 suspensa devido \xE0 baixa reputa\xE7\xE3o. N\xE3o \xE9 poss\xEDvel confirmar recebimentos.", "error");
    return;
  }
  activePendingItem.value = item;
  drawnSignature.value = "";
  captureGps();
  showSignModal.value = true;
};
const handleConfirmReceipt = () => {
  if (!activePendingItem.value) return;
  if (signatureTypeChoice.value === "drawn" && !drawnSignature.value) {
    triggerNotification("Desenhe e salve a assinatura antes de confirmar.", "warning");
    return;
  }
  const newItemLog = {
    id: `disp-${Date.now()}`,
    foodId: activePendingItem.value.foodId,
    foodName: activePendingItem.value.foodName,
    category: activePendingItem.value.category,
    type: "discard",
    recipientOrganization: "",
    signatureName: `${usuarioAtual.value?.name || "Adubo Org\xE2nico Pinhal"} - Operador`,
    signatureImage: signatureTypeChoice.value === "drawn" ? drawnSignature.value : void 0,
    signatureType: signatureTypeChoice.value,
    signatureCertificate: signatureTypeChoice.value === "digital" ? `\u{1F512} Assinado digitalmente por ${usuarioAtual.value?.name || "Adubo Org\xE2nico Pinhal"} (${certificateKey.value}) em ${(/* @__PURE__ */ new Date()).toLocaleString()}` : `\u270D\uFE0F Assinado por desenho manual em ${(/* @__PURE__ */ new Date()).toLocaleString()}`,
    discardDestination: usuarioAtual.value?.name || "Adubo Org\xE2nico Pinhal",
    weightEstimatedKg: activePendingItem.value.weightEstimatedKg,
    gpsCoordinates: gpsCoordinates.value || "N\xE3o informada",
    date: (/* @__PURE__ */ new Date()).toISOString()
  };
  allLogs.value.unshift(newItemLog);
  armazem.salvarColecao("esg_disposal_logs", allLogs.value);
  pendingIncoming.value = pendingIncoming.value.filter((item) => item.id !== activePendingItem.value.id);
  triggerNotification("Descarte recebido e assinado com sucesso! Transformando res\xEDduos em adubo org\xE2nico.", "success");
  showSignModal.value = false;
  activePendingItem.value = null;
};
const esgTotals = computed(() => {
  const totalWeight = receivedDiscards.value.reduce((sum, log) => sum + log.weightEstimatedKg, 0);
  return {
    weightKg: totalWeight.toFixed(1),
    compostKg: (totalWeight * 0.35).toFixed(1),
    // 35% of weight turns to organic compost
    co2Kg: (totalWeight * 2.5).toFixed(1),
    // 2.5 kg CO2e / kg
    waterL: Math.round(totalWeight * 130)
    // 130L water saved / kg
  };
});
</script>

<template>
  <q-page class="descarte column no-wrap">
    <div class="descarte-container column no-wrap col q-pa-md q-mx-auto full-width">
      <!-- Top header with profile info -->
      <q-card flat bordered>
        <q-card-section class="row items-center justify-between no-wrap">
          <div class="row items-center no-wrap q-gutter-x-sm">
            <q-avatar size="40px" color="teal-1" text-color="teal">♻️</q-avatar>
            <div>
              <div class="row items-center no-wrap q-gutter-x-xs">
                <div class="text-caption text-weight-bold ellipsis nome-parceiro">{{ usuarioAtual?.name || 'Adubo Orgânico Pinhal' }}</div>
                <q-icon name="verified_user" color="teal" size="14px">
                  <q-tooltip>Cadastro Verificado</q-tooltip>
                </q-icon>
              </div>
              <div class="text-caption text-grey-6 ellipsis">ID: {{ usuarioAtual?.id || 'user-disposal-1' }}</div>
            </div>
          </div>

          <div class="row items-center no-wrap q-gutter-x-xs">
            <q-btn flat round dense color="grey-7" :icon="$q.dark.isActive ? 'light_mode' : 'dark_mode'" @click="alternarModoEscuro" />
            <q-btn flat round dense color="negative" icon="logout" @click="logout" />
          </div>
        </q-card-section>
      </q-card>

      <!-- Suspension Warning Banner (Governance Layer 2 Rule) -->
      <q-banner v-if="suspenso" rounded dense class="bg-negative text-white q-mt-sm banner-suspenso">
        <template #avatar>
          <q-icon name="warning" color="white" />
        </template>
        <div class="text-caption text-weight-bold">PARCEIRO SUSPENSO — GOVERNANÇA CRÍTICA</div>
        <div class="text-caption">Sua reputação de ({{ entityRating }}⭐) violou o limite mínimo de 4.0. Seus agendamentos de descarte orgânico estão temporariamente travados para auditoria fiscal.</div>
      </q-banner>

      <!-- Main Panel content (Tabs list) -->
      <div class="col scroll q-my-sm">
        <q-tabs
          v-model="activeTab"
          dense
          no-caps
          active-color="teal"
          indicator-color="teal"
          class="text-grey-7 bg-grey-3 rounded-borders tabs-descarte"
        >
          <q-tab name="incoming" :label="`📥 Receber (${pendingIncoming.length})`" />
          <q-tab name="history" :label="`📋 Composteira (${receivedDiscards.length})`" />
          <q-tab name="profile" label="🛡️ Cadastro / Licença" />
        </q-tabs>

        <q-tab-panels v-model="activeTab" animated class="bg-transparent">
          <!-- TAB 1: INCOMING ORG DISCARDS -->
          <q-tab-panel name="incoming" class="q-pa-none q-pt-md">
            <div class="row items-center justify-between q-mb-sm">
              <span class="text-caption text-weight-bold text-grey-6 text-uppercase">Agendamentos de Descarte Orgânico</span>
              <span class="text-caption text-grey-6">Layer 3 — Rastreabilidade Orgânica</span>
            </div>

            <q-card v-if="pendingIncoming.length === 0" flat bordered class="vazio q-pa-lg text-center">
              <q-icon name="check_circle" color="teal" size="32px" />
              <div class="text-subtitle2 text-weight-bold">Usina de adubo limpa!</div>
              <div class="text-caption text-grey-6">Nenhum descarte orgânico pendente de chegada e pesagem.</div>
            </q-card>

            <q-card v-for="item in pendingIncoming" :key="item.id" flat bordered class="q-mb-sm">
              <q-card-section>
                <div class="row justify-between items-start no-wrap">
                  <div>
                    <q-badge color="teal-1" text-color="teal" label="CARGA EM TRÂNSITO" />
                    <div class="text-subtitle2 text-weight-bold q-mt-xs">{{ item.foodName }}</div>
                    <div class="text-caption text-grey-6">
                      <span>Gerador: <b>{{ item.nomeLoja }}</b></span>
                      <span> • </span>
                      <span>Categoria: <b>{{ item.category }}</b></span>
                    </div>
                  </div>
                  <div class="text-right">
                    <div class="text-subtitle2 text-weight-bold text-teal mono">{{ item.weightEstimatedKg }} kg</div>
                    <div class="text-caption text-grey-6">Estimado</div>
                  </div>
                </div>

                <!-- Calculated organic compost output -->
                <div class="row q-col-gutter-sm q-mt-xs">
                  <div class="col-6">
                    <div class="caixa-metrica q-pa-sm rounded-borders">
                      <div class="text-caption text-grey-6">Adubo Previsto (35%)</div>
                      <div class="text-caption text-weight-bold text-teal mono">+{{ (item.weightEstimatedKg * 0.35).toFixed(1) }} kg Humus</div>
                    </div>
                  </div>
                  <div class="col-6">
                    <div class="caixa-metrica q-pa-sm rounded-borders">
                      <div class="text-caption text-grey-6">CO₂ Retido (Metano)</div>
                      <div class="text-caption text-weight-bold text-positive mono">+{{ (item.weightEstimatedKg * 2.5).toFixed(1) }} kg CO₂e</div>
                    </div>
                  </div>
                </div>
              </q-card-section>
              <q-card-actions class="q-px-md q-pb-md q-pt-none">
                <q-btn
                  class="full-width"
                  color="teal"
                  unelevated
                  no-caps
                  label="♻️ Pesar, Tratar & Assinar"
                  @click="handleOpenConfirm(item)"
                />
              </q-card-actions>
            </q-card>
          </q-tab-panel>

          <!-- TAB 2: COMPLETED TRACEABILITY COMPOST LOGS -->
          <q-tab-panel name="history" class="q-pa-none q-pt-md">
            <div class="row items-center justify-between q-mb-sm">
              <span class="text-caption text-weight-bold text-grey-6 text-uppercase">Log de Processamento Orgânico</span>
              <span class="text-caption text-grey-6">Auditoria e Retenção de Gases</span>
            </div>

            <q-card v-if="receivedDiscards.length === 0" flat bordered class="vazio q-pa-lg text-center">
              <q-icon name="eco" color="grey-6" size="32px" />
              <div class="text-subtitle2 text-weight-bold">Usina Vazia</div>
              <div class="text-caption text-grey-6">Nenhuma carga de descarte orgânico certificada até o momento.</div>
            </q-card>

            <q-card v-for="log in receivedDiscards" :key="log.id" flat bordered class="q-mb-sm">
              <q-card-section>
                <div class="row justify-between items-center text-caption text-grey-6">
                  <span class="mono">ID: {{ log.id }}</span>
                  <span>{{ new Date(log.date).toLocaleDateString() }} às {{ new Date(log.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) }}</span>
                </div>

                <div class="text-subtitle2 text-weight-bold q-my-xs">{{ log.foodName }}</div>

                <div class="row q-col-gutter-xs caixa-metrica q-pa-xs rounded-borders text-caption text-grey-6">
                  <div class="col-3">
                    <span>Peso Tratado</span>
                    <span class="text-weight-bold text-teal mono block">{{ log.weightEstimatedKg }} kg</span>
                  </div>
                  <div class="col-3">
                    <span>Adubo Gerado</span>
                    <span class="text-weight-bold text-teal mono block">{{ (log.weightEstimatedKg * 0.35).toFixed(1) }} kg</span>
                  </div>
                  <div class="col-3">
                    <span>CO₂ Evitado</span>
                    <span class="text-weight-bold text-positive mono block">{{ (log.weightEstimatedKg * 2.5).toFixed(1) }} kg</span>
                  </div>
                  <div class="col-3">
                    <span>Água Poupada</span>
                    <span class="text-weight-bold text-blue mono block">{{ Math.round(log.weightEstimatedKg * 130) }} L</span>
                  </div>
                </div>

                <!-- Layer 3 Traceability indicators -->
                <q-separator spaced />
                <div class="column q-gutter-y-xs text-caption text-grey-6">
                  <div class="row items-center no-wrap q-gutter-x-xs">
                    <q-icon name="explore" color="teal" size="14px" />
                    <span>GPS Coleta: <b class="mono">{{ log.gpsCoordinates || '-26.8831, -53.0583' }}</b></span>
                  </div>
                  <div class="row items-center no-wrap q-gutter-x-xs">
                    <q-icon name="verified_user" color="teal" size="14px" />
                    <span class="ellipsis">{{ log.signatureCertificate || 'Certificado eletrônico de compostagem emitido' }}</span>
                  </div>
                </div>
              </q-card-section>
            </q-card>
          </q-tab-panel>

          <!-- TAB 3: TRUST PROFILE & LICENSES -->
          <q-tab-panel name="profile" class="q-pa-none q-pt-md">
            <!-- Layer 1 Verification Details -->
            <q-card flat bordered class="q-mb-md">
              <q-card-section>
                <div class="row items-center q-gutter-x-sm q-mb-sm">
                  <q-icon name="verified_user" color="teal" size="20px" />
                  <div class="text-caption text-weight-bold text-uppercase text-grey-7">Camada 1 — Cadastro Verificado</div>
                </div>

                <q-list dense separator>
                  <q-item class="q-px-none">
                    <q-item-section class="text-grey-6">Parceiro Legal</q-item-section>
                    <q-item-section side class="text-weight-medium text-right">{{ usuarioAtual?.name || 'Adubo Orgânico Pinhal' }}</q-item-section>
                  </q-item>
                  <q-item class="q-px-none">
                    <q-item-section class="text-grey-6">CNPJ Ativo</q-item-section>
                    <q-item-section side class="text-weight-medium mono">{{ usuarioAtual?.cpfCnpj || '98.765.432/0001-11' }}</q-item-section>
                  </q-item>
                  <q-item class="q-px-none">
                    <q-item-section class="text-grey-6">Licença Ambiental</q-item-section>
                    <q-item-section side>
                      <q-badge color="teal-1" text-color="teal" label="✓ LAO FATMA/IMA Nº 4920/26" />
                    </q-item-section>
                  </q-item>
                  <q-item class="q-px-none">
                    <q-item-section class="text-grey-6">Laudo Técnico</q-item-section>
                    <q-item-section side class="text-caption text-italic">Laudo_Compostabilidade.pdf</q-item-section>
                  </q-item>
                  <q-item class="q-px-none">
                    <q-item-section class="text-grey-6">Biometria e Selfie</q-item-section>
                    <q-item-section side class="text-caption text-italic">Verificação do Operador Ativa</q-item-section>
                  </q-item>
                </q-list>
              </q-card-section>
            </q-card>

            <!-- Camada 2: reputação -->
            <q-card flat bordered>
              <q-card-section>
                <div class="row items-center justify-between q-mb-sm">
                  <div class="row items-center q-gutter-x-sm">
                    <q-icon name="star" color="amber" size="20px" />
                    <div class="text-caption text-weight-bold text-uppercase text-grey-7">Camada 2 — Reputação e Nota</div>
                  </div>
                  <span class="text-caption text-grey-6">Média atual</span>
                </div>

                <p class="text-caption text-grey-6 q-mb-sm">Assim como as entidades sociais, as unidades de descarte compostagem possuem fiscalização algorítmica automática. Notas abaixo de <b>4.0</b> geram suspensão de licenças no app.</p>

                <div class="caixa-metrica q-pa-sm rounded-borders q-mb-sm">
                  <div class="row justify-between items-center">
                    <span class="text-caption text-grey-6">Sua reputação atual:</span>
                    <span :class="['text-subtitle1 text-weight-bold mono', entityRating < 4.0 ? 'text-negative' : 'text-amber']">
                      {{ entityRating.toFixed(1) }} ⭐
                    </span>
                  </div>
                  <q-linear-progress rounded size="8px" class="q-my-sm" :value="Math.min(1, entityRating / 5)" :color="entityRating < 4.0 ? 'negative' : 'teal'" />
                  <div class="row justify-between text-caption text-grey-6">
                    <span>0</span>
                    <span class="text-negative text-weight-bold">4.0 (Limite de Corte)</span>
                    <span>5.0 (Excelente)</span>
                  </div>
                </div>
              </q-card-section>
            </q-card>
          </q-tab-panel>
        </q-tab-panels>
      </div>

      <!-- Footer Cumulative ESG Dashboard Cards -->
      <q-card flat bordered>
        <q-card-section>
          <div class="row items-center justify-between q-mb-sm">
            <span class="text-caption text-weight-bold text-grey-6 text-uppercase">Impacto Ecológico Comprovado</span>
            <span class="text-caption text-grey-6 text-italic">Padrão EPA Brasil</span>
          </div>

          <div class="row q-col-gutter-sm">
            <div class="col-4">
              <div class="metrica metrica-teal q-pa-sm rounded-borders text-center">
                <div class="text-caption text-teal text-uppercase">Adubo Gerado</div>
                <div class="text-caption text-weight-bold text-teal mono">{{ esgTotals.compostKg }} kg</div>
              </div>
            </div>
            <div class="col-4">
              <div class="metrica metrica-green q-pa-sm rounded-borders text-center">
                <div class="text-caption text-positive text-uppercase">CO₂ Retido</div>
                <div class="text-caption text-weight-bold text-positive mono">{{ esgTotals.co2Kg }} kg</div>
              </div>
            </div>
            <div class="col-4">
              <div class="metrica metrica-blue q-pa-sm rounded-borders text-center">
                <div class="text-caption text-blue text-uppercase">Água Evitada</div>
                <div class="text-caption text-weight-bold text-blue mono ellipsis">{{ esgTotals.waterL }} L</div>
              </div>
            </div>
          </div>
        </q-card-section>
      </q-card>

      <!-- SIGNATURE MODAL -->
      <q-dialog v-model="showSignModal">
        <q-card class="dialog-assinatura full-width">
          <q-card-section class="row items-center justify-between no-wrap q-pb-sm">
            <div class="text-caption text-weight-bold text-uppercase text-grey-7">Auditoria — Entrada de Resíduos Orgânicos</div>
            <q-btn flat round dense icon="close" color="grey-7" @click="showSignModal = false" />
          </q-card-section>
          <q-separator />

          <q-card-section class="q-gutter-y-md">
            <div v-if="activePendingItem" class="caixa-metrica q-pa-sm rounded-borders">
              <div class="text-caption text-weight-bold text-grey-6 text-uppercase">Carga orgânica identificada:</div>
              <div class="text-subtitle2 text-weight-bold">{{ activePendingItem.foodName }}</div>
              <div class="text-caption text-grey-6">Peso: {{ activePendingItem.weightEstimatedKg }} kg • Origem: {{ activePendingItem.nomeLoja }}</div>
            </div>

            <!-- Layer 3 Sign type options -->
            <div>
              <div class="text-caption text-weight-bold text-grey-6 text-uppercase q-mb-xs">Auditar Entrada Composteira</div>
              <div class="row q-col-gutter-sm">
                <div class="col-6">
                  <q-btn
                    class="full-width"
                    no-caps
                    dense
                    :outline="signatureTypeChoice !== 'digital'"
                    :unelevated="signatureTypeChoice === 'digital'"
                    :color="signatureTypeChoice === 'digital' ? 'teal' : 'grey-7'"
                    label="🔒 Token Criptográfico"
                    @click="signatureTypeChoice = 'digital'"
                  />
                </div>
                <div class="col-6">
                  <q-btn
                    class="full-width"
                    no-caps
                    dense
                    :outline="signatureTypeChoice !== 'drawn'"
                    :unelevated="signatureTypeChoice === 'drawn'"
                    :color="signatureTypeChoice === 'drawn' ? 'teal' : 'grey-7'"
                    label="✍️ Desenho Manual"
                    @click="signatureTypeChoice = 'drawn'"
                  />
                </div>
              </div>
            </div>

            <!-- Token selection -->
            <q-input
              v-if="signatureTypeChoice === 'digital'"
              v-model="certificateKey"
              outlined
              dense
              color="teal"
              label="Chave Assinatura Digital (ICP-Brasil)"
              input-class="mono"
            >
              <template #prepend>
                <q-icon name="lock" color="teal" size="16px" />
              </template>
            </q-input>

            <div v-else class="area-desenho q-pa-sm rounded-borders">
              <BlocoAssinatura label="Assine com o dedo ou mouse" @save="handleSignatureSave" @clear="handleSignatureClear" />
            </div>

            <div class="row items-center no-wrap q-gutter-x-xs text-caption text-grey-6">
              <q-icon name="explore" color="teal" size="16px" />
              <span>Processamento registrado em GPS: <b class="mono text-teal">{{ gpsCoordinates || 'obtendo localização...' }}</b></span>
            </div>
          </q-card-section>

          <q-card-actions align="right" class="q-px-md q-pb-md q-gutter-x-sm">
            <q-btn flat no-caps color="grey-7" label="Cancelar" @click="showSignModal = false" />
            <q-btn unelevated no-caps color="teal" label="✓ Pesar & Assinar" @click="handleConfirmReceipt" />
          </q-card-actions>
        </q-card>
      </q-dialog>
    </div>
  </q-page>
</template>

<style scoped lang="scss">
.descarte {
  min-height: 100vh;
  background: #f5f7f8;
}
.descarte-container {
  width: 100%;
}
.nome-parceiro {
  max-width: 150px;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.caixa-metrica {
  background: rgba(2, 6, 23, 0.04);
  border: 1px solid rgba(100, 116, 139, 0.2);
}
.vazio {
  border-style: dashed;
}
.metrica {
  border: 1px solid transparent;
  &.metrica-teal {
    background: rgba(20, 184, 166, 0.1);
    border-color: rgba(20, 184, 166, 0.2);
  }
  &.metrica-green {
    background: rgba(16, 185, 129, 0.1);
    border-color: rgba(16, 185, 129, 0.2);
  }
  &.metrica-blue {
    background: rgba(59, 130, 246, 0.1);
    border-color: rgba(59, 130, 246, 0.2);
  }
}
.dialog-assinatura {
  max-width: 384px;
}
.area-desenho {
  min-height: 80px;
  border: 1px solid rgba(100, 116, 139, 0.3);
}
.svg-assinatura {
  width: 128px;
  height: 40px;
  border-bottom: 1px solid rgba(100, 116, 139, 0.4);
}
.banner-suspenso {
  animation: pulso 2s ease-in-out infinite;
}

.body--dark {
  .descarte {
    background: #040c13;
  }
  .tabs-descarte {
    background: rgba(15, 23, 42, 0.6) !important;
  }
}

@keyframes pulso {
  50% {
    opacity: 0.7;
  }
}
</style>
