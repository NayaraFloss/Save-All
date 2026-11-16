<script setup>
// Painel master > Aterros e descarte: só o master cadastra os destinos de descarte
// (aterro sanitário, compostagem, biodigestor...) e vincula cada um a uma cidade.
// As lojas veem, no assistente de descarte, apenas os destinos ativos da cidade delas.
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useQuasar } from "quasar";
import { storeToRefs } from "pinia";
import { useAppStore } from "../../stores/estadoApp";
import { servicoDoacoes } from "../../services/servicoDoacoes";
import { cidadesDasLojas } from "../../utils/cidades";

const $q = useQuasar();
const appStore = useAppStore();
const { stores } = storeToRefs(appStore);

const TIPOS = [
  { label: "Aterro sanitário controlado", value: "ATERRO_SANITARIO_CONTROLADO", icon: "landscape", cor: "brown-6" },
  { label: "Compostagem", value: "COMPOSTAGEM", icon: "compost", cor: "green-7" },
  { label: "Biodigestor", value: "BIODIGESTOR", icon: "bolt", cor: "teal-7" },
  { label: "Lixo orgânico (coleta municipal)", value: "LIXO_ORGANICO", icon: "delete", cor: "grey-7" },
  { label: "Outro", value: "OUTRO", icon: "recycling", cor: "blue-grey-6" }
];
const tipo = (v) => TIPOS.find((t) => t.value === v) || TIPOS[TIPOS.length - 1];

const destinos = ref([]);
const carregar = () => (destinos.value = servicoDoacoes.getDisposalPartners());
onMounted(() => {
  carregar();
  window.addEventListener("saveall_dados_atualizados", carregar);
});
onUnmounted(() => window.removeEventListener("saveall_dados_atualizados", carregar));

// Cidades: só as que têm loja cadastrada (cresce sozinha quando entra uma cidade nova)
const opcoesCidade = computed(() => [...cidadesDasLojas(stores.value)].sort((a, b) => a.localeCompare(b)));
const filtroCidade = ref(null);
const busca = ref("");
const filtrados = computed(() => {
  const termo = busca.value.trim().toLowerCase();
  return destinos.value.filter((d) => {
    if (filtroCidade.value && `${d.city}, ${d.state || "SC"}` !== filtroCidade.value) return false;
    if (!termo) return true;
    return [d.name, d.cnpj, d.city, d.address].some((t) => String(t || "").toLowerCase().includes(termo));
  });
});
const porCidade = computed(() => {
  const grupos = {};
  filtrados.value.forEach((d) => {
    const chave = `${d.city || "Sem cidade"}${d.state ? "/" + d.state : ""}`;
    (grupos[chave] ||= []).push(d);
  });
  return Object.entries(grupos).sort(([a], [b]) => a.localeCompare(b));
});

// ----- Cadastro / edição -----
const mostrar = ref(false);
const salvando = ref(false);
const form = ref(null);
const vazio = () => ({
  id: null,
  name: "",
  cnpj: "",
  treatmentType: "ATERRO_SANITARIO_CONTROLADO",
  environmentalLicense: "",
  cidade: opcoesCidade.value[0] || "Pinhalzinho, SC",
  address: "",
  postalCode: "",
  contactPerson: "",
  whatsapp: "",
  email: "",
  dailyCapacityKg: null,
  operatingHours: "08:00 às 17:00",
  isMunicipalUnit: false,
  active: true,
  notes: ""
});
const abrirNovo = () => {
  form.value = vazio();
  mostrar.value = true;
};
const abrirEdicao = (d) => {
  form.value = { ...vazio(), ...d, cidade: `${d.city || ""}, ${d.state || "SC"}` };
  mostrar.value = true;
};
const digitos = (v) => String(v || "").replace(/\D/g, "");
const erroForm = computed(() => {
  const f = form.value;
  if (!f) return "";
  if (f.name.trim().length < 3) return "Informe o nome do aterro ou destino.";
  if (digitos(f.cnpj).length !== 14) return "Informe o CNPJ com 14 números.";
  if (!/,\s*[A-Za-z]{2}$/.test(String(f.cidade || ""))) return "Escolha a cidade no formato Cidade, UF (ex.: Pinhalzinho, SC).";
  if (!f.address.trim()) return "Informe o endereço.";
  const nomeRepetido = destinos.value.some(
    (d) => d.id !== f.id && d.name.trim().toLowerCase() === f.name.trim().toLowerCase()
  );
  if (nomeRepetido) return "Já existe um destino com este nome.";
  const cnpjRepetido = destinos.value.some((d) => d.id !== f.id && digitos(d.cnpj) === digitos(f.cnpj));
  if (cnpjRepetido) return "Já existe um destino com este CNPJ.";
  return "";
});
const salvar = async () => {
  if (erroForm.value) return;
  const f = form.value;
  const [cidade, uf] = String(f.cidade).split(",").map((t) => t.trim());
  salvando.value = true;
  try {
    const { erro } = await servicoDoacoes.salvarDestino({
      ...(f.id ? { id: f.id } : {}),
      name: f.name.trim(),
      cnpj: f.cnpj,
      treatmentType: f.treatmentType,
      environmentalLicense: f.environmentalLicense.trim(),
      city: cidade,
      state: (uf || "SC").toUpperCase(),
      address: f.address.trim(),
      postalCode: f.postalCode,
      contactPerson: f.contactPerson.trim(),
      whatsapp: f.whatsapp,
      email: f.email.trim(),
      dailyCapacityKg: Number(f.dailyCapacityKg) || null,
      operatingHours: f.operatingHours,
      isMunicipalUnit: f.isMunicipalUnit,
      active: f.active,
      validationStatus: f.active ? "validated" : "inactive",
      notes: f.notes
    });
    if (erro) return; // a mensagem do servidor já apareceu
    appStore.triggerNotification(`Destino "${f.name.trim()}" salvo para ${cidade}.`, "success");
    mostrar.value = false;
  } finally {
    salvando.value = false;
    carregar();
  }
};
const alternarAtivo = async (d) => {
  const ativo = !(d.active !== false && d.validationStatus !== "inactive");
  const { erro } = await servicoDoacoes.salvarDestino({ ...d, active: ativo, validationStatus: ativo ? "validated" : "inactive" });
  if (!erro) appStore.triggerNotification(ativo ? `"${d.name}" voltou a aparecer para as lojas.` : `"${d.name}" não aparece mais para as lojas.`, "success");
  carregar();
};
const ativo = (d) => d.active !== false && d.validationStatus !== "inactive";
const excluir = (d) => {
  $q.dialog({
    title: "Excluir destino",
    message: `Excluir "${d.name}"? Se ele já tiver descartes registrados, o sistema recusa: nesse caso, desative.`,
    cancel: { label: "Cancelar", flat: true, noCaps: true },
    ok: { label: "Excluir", color: "negative", unelevated: true, noCaps: true },
    persistent: true
  }).onOk(async () => {
    const { erro } = await servicoDoacoes.removerDestino(d.id);
    if (!erro) appStore.triggerNotification(`"${d.name}" excluído.`, "success");
    carregar();
  });
};
</script>

<template>
  <div class="destinos-raiz">
    <div class="row items-center justify-between q-col-gutter-sm">
      <div>
        <div class="text-h6 text-weight-bold">Aterros e Destinos de Descarte</div>
        <div class="text-caption text-grey-7">
          Só a administração cadastra. Cada loja vê apenas os destinos ativos da cidade dela.
        </div>
      </div>
      <q-btn unelevated no-caps color="brown-6" icon="add_location_alt" label="Cadastrar Aterro / Destino" class="text-weight-bold" @click="abrirNovo" />
    </div>

    <div class="destinos-filtros">
      <q-input v-model="busca" outlined dense clearable placeholder="Buscar por nome, CNPJ, cidade ou endereço...">
        <template #prepend><q-icon name="search" /></template>
      </q-input>
      <q-select v-model="filtroCidade" :options="opcoesCidade" clearable outlined dense label="Cidade" />
    </div>

    <q-card v-if="!filtrados.length" flat bordered class="q-pa-lg text-center text-grey-7">
      <q-icon name="landscape" size="40px" color="grey-5" />
      <div class="q-mt-sm">Nenhum destino cadastrado{{ filtroCidade ? ` em ${filtroCidade}` : "" }}.</div>
      <div class="text-caption">Sem destino na cidade, as lojas dela não conseguem registrar descartes.</div>
    </q-card>

    <div v-for="[cidade, lista] in porCidade" :key="cidade">
      <div class="text-subtitle2 text-weight-bold q-mb-sm">
        <q-icon name="place" color="brown-6" /> {{ cidade }}
        <q-badge color="grey-6" class="q-ml-xs">{{ lista.length }}</q-badge>
      </div>
      <div class="destinos-grade">
        <q-card v-for="d in lista" :key="d.id" flat bordered :class="['destino-card', { 'destino-inativo': !ativo(d) }]">
          <q-card-section class="row no-wrap items-start q-gutter-x-sm">
            <q-avatar rounded size="42px" :color="tipo(d.treatmentType).cor" text-color="white" :icon="tipo(d.treatmentType).icon" />
            <div class="col" style="min-width: 0">
              <div class="text-subtitle2 text-weight-bold ellipsis">{{ d.name }}</div>
              <div class="text-caption text-grey-7">{{ tipo(d.treatmentType).label }}</div>
              <div class="text-caption text-grey-7 ellipsis">{{ d.address }}</div>
              <div class="row q-gutter-xs q-mt-xs">
                <q-badge :color="ativo(d) ? 'positive' : 'grey-6'">{{ ativo(d) ? "Visível para as lojas" : "Desativado" }}</q-badge>
                <q-badge v-if="d.isMunicipalUnit" outline color="blue-8">Municipal</q-badge>
                <q-badge v-if="d.environmentalLicense" outline color="brown-6">Licença {{ d.environmentalLicense }}</q-badge>
              </div>
            </div>
          </q-card-section>
          <q-separator />
          <q-card-actions align="right" class="q-py-xs">
            <q-btn flat dense no-caps color="grey-8" :icon="ativo(d) ? 'visibility_off' : 'visibility'" :label="ativo(d) ? 'Desativar' : 'Ativar'" @click="alternarAtivo(d)" />
            <q-btn flat dense no-caps color="orange-8" icon="edit" label="Editar" @click="abrirEdicao(d)" />
            <q-btn flat dense round color="negative" icon="delete" @click="excluir(d)"><q-tooltip>Excluir</q-tooltip></q-btn>
          </q-card-actions>
        </q-card>
      </div>
    </div>

    <!-- Janela de cadastro / edição -->
    <q-dialog v-model="mostrar">
      <q-card v-if="form" class="destino-dialog">
        <q-card-section class="row items-center no-wrap">
          <q-icon name="add_location_alt" color="brown-6" size="24px" class="q-mr-sm" />
          <div class="col text-subtitle1 text-weight-bold">{{ form.id ? "Editar destino de descarte" : "Cadastrar aterro / destino" }}</div>
          <q-btn flat round dense icon="close" @click="mostrar = false" />
        </q-card-section>
        <q-separator />
        <q-card-section class="destino-corpo q-gutter-y-md">
          <q-input v-model="form.name" outlined dense label="Nome *" placeholder="Ex.: Aterro Sanitário de Pinhalzinho" maxlength="160" />
          <div class="row q-col-gutter-sm">
            <div class="col-12 col-sm-6">
              <q-input v-model="form.cnpj" outlined dense label="CNPJ *" mask="##.###.###/####-##" inputmode="numeric" />
            </div>
            <div class="col-12 col-sm-6">
              <q-select v-model="form.treatmentType" :options="TIPOS" emit-value map-options outlined dense label="Tipo *" />
            </div>
            <div class="col-12 col-sm-6">
              <q-select
                v-model="form.cidade"
                :options="opcoesCidade"
                outlined
                dense
                use-input
                fill-input
                hide-selected
                new-value-mode="add-unique"
                input-debounce="0"
                label="Cidade vinculada *"
                hint="Formato Cidade, UF (ex.: Saudades, SC)"
                @new-value="(v, feito) => feito(v)"
              />
            </div>
            <div class="col-12 col-sm-6">
              <q-input v-model="form.environmentalLicense" outlined dense label="Licença ambiental" placeholder="Ex.: IMA/SC-LAO-2026-0001" />
            </div>
          </div>
          <q-input v-model="form.address" outlined dense label="Endereço *" placeholder="Rua, número, bairro ou rodovia/km" />
          <div class="row q-col-gutter-sm">
            <div class="col-12 col-sm-4"><q-input v-model="form.postalCode" outlined dense label="CEP" mask="#####-###" /></div>
            <div class="col-12 col-sm-4"><q-input v-model="form.contactPerson" outlined dense label="Responsável técnico" /></div>
            <div class="col-12 col-sm-4"><q-input v-model="form.whatsapp" outlined dense label="WhatsApp" mask="(##) #####-####" /></div>
            <div class="col-12 col-sm-6"><q-input v-model="form.email" outlined dense label="E-mail" type="email" /></div>
            <div class="col-6 col-sm-3"><q-input v-model.number="form.dailyCapacityKg" outlined dense label="Capacidade (kg/dia)" type="number" min="0" /></div>
            <div class="col-6 col-sm-3"><q-input v-model="form.operatingHours" outlined dense label="Horário" /></div>
          </div>
          <div class="row q-gutter-md">
            <q-toggle v-model="form.isMunicipalUnit" label="Unidade municipal (prefeitura)" color="blue-8" />
            <q-toggle v-model="form.active" label="Visível para as lojas da cidade" color="positive" />
          </div>
          <q-input v-model="form.notes" outlined dense type="textarea" autogrow label="Observações" />
          <div v-if="erroForm" class="text-caption text-negative">{{ erroForm }}</div>
        </q-card-section>
        <q-separator />
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat no-caps color="grey-7" label="Cancelar" @click="mostrar = false" />
          <q-btn unelevated no-caps color="brown-6" icon="check" label="Salvar destino" class="text-weight-bold" :loading="salvando" :disable="!!erroForm" @click="salvar" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<style scoped lang="scss">
.destinos-raiz {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.destinos-filtros {
  display: grid;
  gap: 8px;
  grid-template-columns: minmax(0, 1fr);
}
@media (min-width: 900px) {
  .destinos-filtros { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); }
}
.destinos-grade {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  align-items: start;
}
@media (max-width: 400px) {
  .destinos-grade { grid-template-columns: minmax(0, 1fr); }
}
.destino-card { border-radius: 12px; }
.destino-inativo { opacity: 0.6; }
.destino-dialog { width: 680px; max-width: 94vw; border-radius: 16px; }
.destino-corpo { max-height: 70vh; overflow-y: auto; }
</style>
