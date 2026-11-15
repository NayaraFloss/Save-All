<script setup>
import FundoSustentavel from "components/FundoSustentavel.vue";
import { useRouter } from "vue-router";
import { ref, computed, onMounted } from "vue";
import { storeToRefs } from "pinia";
import { useAppStore } from "stores/estadoApp";
import { addressMatchesCity, getCityName } from "src/utils/cidades";
import { formatCep, isCepValido, calculateDeliveryFee, formatMoney } from "src/utils/frete";

const router = useRouter();
const appStore = useAppStore();
const { usuarioAtual, selectedCity, stores, cartStoreId, orders } = storeToRefs(appStore);
const { updateProfile, triggerNotification, loadOrders } = appStore;

// Garante que os pedidos da cliente estejam carregados (eles alimentam a lista de endereços recentes)
onMounted(async () => {
  if (usuarioAtual.value?.role !== "client") return;
  try {
    await loadOrders();
  } catch {
    // sem pedidos carregados, a lista usa só o perfil e os endereços salvos
  }
});

// A cidade é definida pelo pedido e não pode ser alterada aqui
const cityName = computed(() => getCityName(selectedCity.value));
const uf = computed(() => String(selectedCity.value || "").split(",")[1]?.trim() || "");

const normalizar = (t) =>
  String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

// ---------- Formulário ----------
const saved = usuarioAtual.value?.addressData;
const startsFilled = !!saved && addressMatchesCity(saved.full || saved.city || "", selectedCity.value);
const form = ref({
  cep: startsFilled ? saved.cep || "" : "",
  street: startsFilled ? saved.street || "" : "",
  number: startsFilled ? saved.number || "" : "",
  noNumber: startsFilled ? !!saved.noNumber : false,
  complement: startsFilled ? saved.complement || "" : "",
  neighborhood: startsFilled ? saved.neighborhood || "" : "",
  reference: startsFilled ? saved.reference || "" : ""
});
const cepError = ref("");
const cepLoading = ref(false);
const submitted = ref(false);
const saving = ref(false);

const onCepInput = async (value) => {
  form.value.cep = formatCep(value);
  cepError.value = "";
  if (!isCepValido(form.value.cep)) return;
  cepLoading.value = true;
  try {
    const resp = await fetch(`https://viacep.com.br/ws/${form.value.cep.replace(/\D/g, "")}/json/`);
    const data = await resp.json();
    if (data.erro) {
      cepError.value = "CEP não encontrado. Confira os números ou preencha o endereço manualmente.";
      return;
    }
    if (normalizar(data.localidade) !== normalizar(cityName.value)) {
      cepError.value = `Este CEP pertence a ${data.localidade}/${data.uf}. Seu pedido é em ${cityName.value}, então a entrega precisa ser nessa cidade.`;
      return;
    }
    if (data.logradouro) form.value.street = data.logradouro;
    if (data.bairro) form.value.neighborhood = data.bairro;
  } catch {
    // sem internet / serviço fora do ar: o cliente preenche manualmente
  } finally {
    cepLoading.value = false;
  }
};

const rules = {
  cep: () => isCepValido(form.value.cep) || "Informe um CEP com 8 dígitos",
  street: () => form.value.street.trim().length >= 3 || "Informe a rua / avenida",
  number: () => form.value.noNumber || form.value.number.trim().length > 0 || "Informe o número ou marque “Sem número”",
  neighborhood: () => form.value.neighborhood.trim().length >= 2 || "Informe o bairro"
};
const errors = computed(() => ({
  cep: rules.cep() === true ? "" : rules.cep(),
  street: rules.street() === true ? "" : rules.street(),
  number: rules.number() === true ? "" : rules.number(),
  neighborhood: rules.neighborhood() === true ? "" : rules.neighborhood()
}));
const canSave = computed(() => Object.values(errors.value).every((e) => !e) && !cepError.value);

// ---------- Frete estimado ----------
const store = computed(() => (stores.value || []).find((s) => s.id === cartStoreId.value));
const fee = computed(() =>
  calculateDeliveryFee(store.value?.deliveryConfig, {
    cep: form.value.cep,
    neighborhood: form.value.neighborhood
  })
);
const showFee = computed(() => isCepValido(form.value.cep) || form.value.neighborhood.trim().length >= 2);

// ---------- Endereços salvos ----------
const savedAddresses = computed(() => usuarioAtual.value?.savedAddresses || []);
const currentFull = computed(() => usuarioAtual.value?.address || "");

// Endereços usados recentemente pela cliente logada: perfil, salvos e pedidos anteriores
const recentAddresses = computed(() => {
  const result = [];
  const seen = new Set();
  const add = (entry) => {
    const key = normalizar(entry.full);
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push(entry);
  };
  const user = usuarioAtual.value;
  if (user?.address) {
    const structured = user.addressData?.full === user.address ? user.addressData : {};
    add({ id: "profile-address", ...structured, full: user.address, source: "Endereço do perfil" });
  }
  savedAddresses.value.forEach((a) => add({ ...a, source: "Salvo" }));
  const myOrders = (orders.value || [])
    .filter((o) => o.clienteId === user?.id && o.address)
    .sort((a, b) => new Date(b.criadoEm || 0) - new Date(a.criadoEm || 0));
  myOrders.forEach((o) => add({ id: `order-${o.id}`, full: o.address, source: "Pedido anterior" }));
  return result.slice(0, 8);
});
const isFromOrderCity = (full) => addressMatchesCity(full, selectedCity.value);

const buildFull = (d) => {
  const numberText = d.noNumber ? "S/N" : d.number.trim();
  const comp = d.complement.trim() ? ` - ${d.complement.trim()}` : "";
  return `${d.street.trim()}, ${numberText}${comp}, ${d.neighborhood.trim()}, CEP ${d.cep} - ${cityName.value}/${uf.value}`;
};

const goBack = () => router.push({ name: "FinalizarPedido" });

const handleSave = async () => {
  submitted.value = true;
  if (!canSave.value) {
    triggerNotification("Confira os campos do endereço antes de salvar.", "warning");
    return;
  }
  saving.value = true;
  try {
    const data = {
      cep: form.value.cep,
      street: form.value.street.trim(),
      number: form.value.noNumber ? "" : form.value.number.trim(),
      noNumber: form.value.noNumber,
      complement: form.value.complement.trim(),
      neighborhood: form.value.neighborhood.trim(),
      reference: form.value.reference.trim(),
      city: cityName.value,
      uf: uf.value
    };
    const full = buildFull(form.value);
    const entry = { id: `addr-${Date.now()}`, ...data, full };
    const list = [entry, ...savedAddresses.value.filter((a) => a.full !== full)].slice(0, 6);
    await updateProfile({ address: full, addressData: { ...data, full }, savedAddresses: list });
    goBack();
  } finally {
    saving.value = false;
  }
};

const useSaved = async (addr) => {
  if (!isFromOrderCity(addr.full)) {
    triggerNotification(`Seu pedido é em ${selectedCity.value}. Este endereço é de outra cidade.`, "warning");
    return;
  }
  // Endereços antigos (só texto) não têm campos separados
  const structured = addr.street ? { ...addr } : null;
  await updateProfile({ address: addr.full, addressData: structured });
  goBack();
};

const removeSaved = async (addr) => {
  const list = savedAddresses.value.filter((a) => a.id !== addr.id);
  await updateProfile({ savedAddresses: list });
};
</script>

<template>
  <q-page class="address-page column no-wrap">
    <FundoSustentavel />

    <!-- Cabeçalho -->
    <q-toolbar class="bg-white text-dark address-header">
      <q-btn id="btn-address-back" flat round dense icon="arrow_back" @click="goBack" />
      <span class="q-pl-sm text-caption text-grey-6 text-uppercase text-weight-medium gt-xs">Checkout</span>
      <div class="col text-center ellipsis q-px-sm text-subtitle2 text-weight-bold text-uppercase font-display">Cadastro de Endereço</div>
      <span class="text-caption text-uppercase text-weight-bold text-positive">Endereço de entrega</span>
    </q-toolbar>

    <div class="col address-scroll">
      <div class="address-container">
        <div class="row q-col-gutter-md items-start">
          <!-- FORMULÁRIO -->
          <div class="col-12 col-md-7">
            <q-card flat bordered class="form-card">
              <q-card-section class="q-pa-lg q-gutter-y-md">
                <div class="row items-center q-gutter-x-sm">
                  <q-avatar size="34px" color="green-1" text-color="positive" icon="edit_location_alt" />
                  <div class="text-subtitle1 text-weight-bold">Dados do endereço</div>
                </div>

                <div class="row q-col-gutter-md">
                  <div class="col-12 col-sm-5">
                    <q-input
                      id="input-addr-cep"
                      :model-value="form.cep"
                      outlined
                      color="positive"
                      label="CEP *"
                      inputmode="numeric"
                      maxlength="9"
                      :loading="cepLoading"
                      :error="!!cepError || (submitted && !!errors.cep)"
                      :error-message="cepError || errors.cep"
                      @update:model-value="onCepInput"
                    >
                      <template #prepend><q-icon name="pin_drop" color="positive" /></template>
                    </q-input>
                  </div>
                  <div class="col-12 col-sm-7">
                    <q-input
                      id="input-addr-city"
                      :model-value="`${cityName} / ${uf}`"
                      outlined
                      readonly
                      label="Cidade (definida pelo pedido)"
                    >
                      <template #prepend><q-icon name="location_city" color="grey-6" /></template>
                      <template #append><q-icon name="lock" size="18px" color="grey-6" /></template>
                    </q-input>
                  </div>
                </div>

                <q-input
                  id="input-addr-street"
                  v-model="form.street"
                  outlined
                  color="positive"
                  label="Rua / Avenida *"
                  :error="submitted && !!errors.street"
                  :error-message="errors.street"
                >
                  <template #prepend><q-icon name="signpost" color="positive" /></template>
                </q-input>

                <div class="row q-col-gutter-md">
                  <div class="col-12 col-sm-4">
                    <q-input
                      id="input-addr-number"
                      v-model="form.number"
                      outlined
                      color="positive"
                      label="Número *"
                      :disable="form.noNumber"
                      :error="submitted && !!errors.number"
                      :error-message="errors.number"
                    />
                    <q-checkbox v-model="form.noNumber" dense color="positive" label="Sem número (S/N)" class="q-mt-xs text-caption" />
                  </div>
                  <div class="col-12 col-sm-8">
                    <q-input
                      id="input-addr-neighborhood"
                      v-model="form.neighborhood"
                      outlined
                      color="positive"
                      label="Bairro *"
                      :error="submitted && !!errors.neighborhood"
                      :error-message="errors.neighborhood"
                    >
                      <template #prepend><q-icon name="holiday_village" color="positive" /></template>
                    </q-input>
                  </div>
                </div>

                <q-input
                  id="input-addr-complement"
                  v-model="form.complement"
                  outlined
                  color="positive"
                  label="Complemento (apto, bloco, casa...)"
                />
                <q-input
                  id="input-addr-reference"
                  v-model="form.reference"
                  outlined
                  color="positive"
                  label="Ponto de referência (opcional)"
                  hint="Ajuda o entregador a encontrar você"
                />
              </q-card-section>
            </q-card>
          </div>

          <!-- LATERAL -->
          <div class="col-12 col-md-5 side-col q-gutter-y-md">
            <q-banner dense rounded class="city-rule-banner bg-green-1 text-green-9 text-body2">
              <template #avatar><q-icon name="info" color="positive" size="22px" /></template>
              Seu pedido foi feito em <strong>{{ selectedCity }}</strong>. A entrega só é possível para endereços de
              <strong>{{ cityName }}</strong>.
            </q-banner>

            <!-- Endereços usados recentemente pela cliente logada -->
            <q-card id="card-recent-addresses" flat bordered>
              <q-card-section class="row items-center q-pb-sm">
                <q-avatar size="34px" color="green-1" text-color="positive" icon="history" class="q-mr-sm" />
                <div class="col">
                  <div class="text-subtitle2 text-weight-bold">Usados recentemente</div>
                  <div class="text-caption text-grey-6">Endereços do seu perfil e de pedidos anteriores</div>
                </div>
              </q-card-section>
              <q-separator />
              <q-list v-if="recentAddresses.length" separator>
                <q-item
                  v-for="addr in recentAddresses"
                  :key="addr.id"
                  clickable
                  v-ripple
                  class="q-py-sm"
                  :class="{ 'address-item--blocked': !isFromOrderCity(addr.full) }"
                  @click="useSaved(addr)"
                >
                  <q-item-section avatar>
                    <q-avatar size="36px" :color="currentFull === addr.full ? 'green-2' : 'grey-3'" text-color="grey-8" icon="place" />
                  </q-item-section>
                  <q-item-section>
                    <template v-if="addr.street">
                      <q-item-label class="text-weight-medium">{{ addr.street }}, {{ addr.noNumber ? 'S/N' : addr.number }}</q-item-label>
                      <q-item-label caption>{{ addr.neighborhood }} · CEP {{ addr.cep }} · {{ addr.city }}/{{ addr.uf }}</q-item-label>
                    </template>
                    <q-item-label v-else class="text-weight-medium">{{ addr.full }}</q-item-label>
                    <q-item-label caption class="text-grey-6">{{ addr.source }}</q-item-label>
                    <q-item-label v-if="!isFromOrderCity(addr.full)" caption class="text-negative">
                      Outra cidade — indisponível para este pedido
                    </q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <div class="row items-center no-wrap">
                      <q-icon v-if="currentFull === addr.full" name="check_circle" color="positive" />
                      <q-btn
                        v-if="addr.source === 'Salvo'"
                        flat
                        round
                        dense
                        size="sm"
                        icon="delete"
                        color="grey-6"
                        @click.stop="removeSaved(addr)"
                      >
                        <q-tooltip>Remover</q-tooltip>
                      </q-btn>
                    </div>
                  </q-item-section>
                </q-item>
              </q-list>
              <q-card-section v-else class="text-body2 text-grey-6">
                Você ainda não usou nenhum endereço. Cadastre o primeiro ao lado.
              </q-card-section>
            </q-card>

            <!-- Frete -->
            <q-card flat bordered class="fee-card">
              <q-card-section class="row items-center no-wrap q-pa-md">
                <q-avatar size="48px" color="orange-1" text-color="orange-9" icon="local_shipping" class="q-mr-md" />
                <div class="col">
                  <div class="text-caption text-grey-6 text-uppercase font-mono">Frete estimado</div>
                  <div v-if="showFee" class="text-h5 text-weight-bold text-secondary font-mono">{{ formatMoney(fee.fee) }}</div>
                  <div v-else class="text-body2 text-grey-6">Informe o CEP ou o bairro para ver o valor.</div>
                  <div v-if="showFee" class="text-caption text-grey-6">
                    {{ fee.source === 'padrao' ? 'Taxa padrão do estabelecimento' : `Região: ${fee.label}` }}
                  </div>
                </div>
              </q-card-section>
            </q-card>
          </div>
        </div>
      </div>
    </div>

    <!-- Rodapé -->
    <q-separator />
    <div class="row justify-center q-pa-md address-footer">
      <div class="footer-inner row q-col-gutter-md full-width">
        <div class="col-4">
          <q-btn outline rounded no-caps color="grey-7" class="full-width confirm-btn text-weight-bold" label="Cancelar" @click="goBack" />
        </div>
        <div class="col-8">
          <q-btn
            id="btn-address-confirm"
            unelevated
            rounded
            no-caps
            color="warning"
            text-color="dark"
            class="full-width text-weight-bold confirm-btn"
            icon="save"
            label="Salvar endereço e voltar ao checkout"
            :loading="saving"
            @click="handleSave"
          />
        </div>
      </div>
    </div>
  </q-page>
</template>

<style scoped lang="scss">
.address-page {
  height: calc(100vh - 50px);
}

.address-header {
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
}

.address-scroll {
  overflow-y: auto;
  min-height: 0;
  padding: 20px 16px;
}

.address-container {
  width: 100%;
  max-width: 1100px;
  margin: 0 auto;
}

.footer-inner {
  max-width: 1100px;
}

.confirm-btn {
  height: 52px;
  font-size: 15px;
}

.address-item--blocked {
  opacity: 0.55;
}

@media (max-width: 1023px) {
  .side-col {
    order: -1;
  }
}

.body--dark {
  .address-header {
    background: #07131d !important;
    color: #fff;
  }

  .city-rule-banner.bg-green-1 {
    background: rgba(102, 187, 106, 0.12) !important;
    color: #a5d6a7 !important;
  }
}
</style>