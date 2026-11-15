<script setup>
import { useRouter } from "vue-router";
import FundoSustentavel from "components/FundoSustentavel.vue";
import LayoutEntrada from "components/LayoutEntrada.vue";
import { IMAGES } from 'src/assets/images'
import { ref, computed } from "vue";
import { storeToRefs } from "pinia";
import { useAppStore } from "stores/estadoApp";
import { formatCPF, formatCNPJ } from "src/utils/formatadores";
const router = useRouter();
defineOptions({ name: "CadastroPage" });
const appStore = useAppStore();
const { error, stores } = storeToRefs(appStore);
const { signup } = appStore;
const roleOptions = [
  { label: "🛒 Consumidor Final (Compra com desconto)", value: "client" },
  { label: "🏪 Estabelecimento Comercial (Vende e Doa)", value: "store" },
  { label: "🚚 Entregador Parceiro (Coleta e Entrega)", value: "driver" }
];
const driverTypeOptions = [
  { label: "Contratado (Próprio)", value: "internal" },
  { label: "Compartilhado (Cidade)", value: "shared" }
];
const storeOptions = computed(() => (stores.value || []).map((s) => ({ label: s.name, value: s.id })));
const a1File = ref(null);
const handleCpfCnpjInput = (v) => {
  cpfCnpj.value = role.value === "driver" ? formatCPF(v) : formatCNPJ(v);
};
const required = (v) => !!v || "Campo obrigatório";
const username = ref("");
const email = ref("");
const password = ref("");
const confirmPassword = ref("");
const role = ref("client");
const address = ref("");
const tipoEntregador = ref("internal");
const contractedStoreId = ref("");
const workingCity = ref("Pinhalzinho");
const cpfCnpj = ref("");
const docPhoto = ref("");
const selfiePhoto = ref("");
const pfxFileName = ref("");
const pfxFileSize = ref("");
const pfxPassword = ref("");
const pfxFileData = ref("");
const showPfxPassword = ref(false);
const handleA1FileUpload = (file) => {
  if (!file) return;
  pfxFileName.value = file.name;
  pfxFileSize.value = `${(file.size / 1024).toFixed(1)} KB`;
  const reader = new FileReader();
  reader.onload = (e) => {
    pfxFileData.value = e.target?.result || "";
  };
  reader.readAsDataURL(file);
};
const handleRemoveA1 = () => {
  a1File.value = null;
  pfxFileName.value = "";
  pfxFileSize.value = "";
  pfxPassword.value = "";
  pfxFileData.value = "";
};
const formErr = ref(null);
const submitting = ref(false);
const handleFileUpload = (type, name) => {
  if (type === "doc") docPhoto.value = name;
  if (type === "selfie") selfiePhoto.value = name;
};
const handleSubmit = async () => {
  if (!username.value || !email.value || !password.value || !confirmPassword.value) {
    formErr.value = "Preencha os campos obrigat\xF3rios.";
    return;
  }
  if (role.value !== "client" && !cpfCnpj.value) {
    formErr.value = role.value === "driver" ? "CPF \xE9 obrigat\xF3rio para entregadores." : "CNPJ \xE9 obrigat\xF3rio para este perfil.";
    return;
  }
  if (role.value === "driver" && (!docPhoto.value || !selfiePhoto.value)) {
    formErr.value = "Por favor, envie as fotos da CNH e da selfie para a verifica\xE7\xE3o do entregador.";
    return;
  }
  if (role.value === "store") {
    if (!pfxFileName.value) {
      formErr.value = "Por favor, anexe o arquivo do Certificado Digital A1 (.pfx ou .p12) do estabelecimento.";
      return;
    }
    if (!pfxPassword.value) {
      formErr.value = "Por favor, informe a senha do Certificado Digital A1 (.pfx).";
      return;
    }
  }
  if (role.value === "driver" && tipoEntregador.value === "internal" && !contractedStoreId.value) {
    formErr.value = "Por favor, selecione o estabelecimento contratante.";
    return;
  }
  if (password.value !== confirmPassword.value) {
    formErr.value = "As senhas n\xE3o coincidem.";
    return;
  }
  if (password.value.length < 4) {
    formErr.value = "A senha deve ter pelo menos 4 caracteres.";
    return;
  }
  formErr.value = null;
  submitting.value = true;
  try {
    let extraFields = {
      cpfCnpj: cpfCnpj.value,
      docPhotoUrl: docPhoto.value ? IMAGES.avatarDocumento : void 0,
      selfieUrl: selfiePhoto.value ? IMAGES.avatar02 : void 0
    };
    if (role.value === "store") {
      extraFields = {
        ...extraFields,
        pfxFileName: pfxFileName.value,
        pfxPassword: pfxPassword.value,
        pfxFileData: pfxFileData.value,
        signatureType: "digital",
        signatureCertificate: `Certificado A1: ${cpfCnpj.value || "Certificado Digital"}`,
        autoSignEnabled: true
      };
    } else if (role.value === "driver") {
      const storeObj = stores.value.find((s) => s.id === contractedStoreId.value);
      extraFields = {
        ...extraFields,
        tipoEntregador: tipoEntregador.value,
        contractedStoreId: tipoEntregador.value === "internal" ? contractedStoreId.value : void 0,
        contractedStoreName: tipoEntregador.value === "internal" && storeObj ? storeObj.name : void 0,
        workingCity: workingCity.value || "Pinhalzinho"
      };
    }
    await signup(username.value, email.value, password.value, role.value, address.value, extraFields);
  } catch (err) {
    formErr.value = err.message || "Erro ao realizar o cadastro.";
  } finally {
    submitting.value = false;
  }
};
</script>

<template>
  <q-page class="cadastro-page">
    <FundoSustentavel />
    <LayoutEntrada titulo="Faça parte da revolução sustentável" texto="Cadastre-se como consumidor, estabelecimento, entregador ou entidade social e ajude a reduzir o desperdício de alimentos.">
    <!-- Barra superior -->
    <div class="row items-center">
      <q-btn
        id="btn-signup-back"
        flat
        round
        color="grey-7"
        icon="arrow_back"
        @click="router.push({ name: 'BemVindo' })"
      />
      <span class="q-ml-sm text-caption text-grey-6 text-uppercase text-weight-light letter-wide font-display">Voltar</span>
    </div>

    <div class="column items-center full-width">
    <!-- Cabeçalho -->
    <div class="text-center q-my-md">
      <h2 class="text-h5 text-weight-medium letter-wide font-display q-ma-none">Criar Cadastro</h2>
      <p class="text-caption text-grey-6 text-weight-light q-mt-xs q-mb-none">Seja parte da revolução sustentável com a Save All.</p>
    </div>

    <!-- Formulário -->
    <q-form class="cadastro-form full-width q-mx-auto q-gutter-y-sm" @submit.prevent="handleSubmit">
      <q-banner v-if="formErr || error" dense rounded class="bg-negative text-white text-center text-caption">
        {{ formErr || error }}
      </q-banner>

      <!-- Tipo de perfil -->
      <div>
        <q-select
          v-model="role"
          outlined
          dense
          emit-value
          map-options
          label="Tipo de Perfil"
          :options="roleOptions"
          @update:model-value="formErr = null"
        />
        <div class="text-caption text-grey-6 text-italic q-mt-xs q-ml-xs">
          <span v-if="role === 'client'">Compre produtos e alimentos de estabelecimentos parceiros com descontos de até 70%.</span>
          <span v-if="role === 'store'">Anuncie fornadas, refeições e excedentes ou destine para doação com segurança jurídica (Lei 14.016).</span>
          <span v-if="role === 'driver'">Atenda estabelecimentos da sua região e garanta uma renda extra com entregas rápidas.</span>
        </div>
      </div>

      <!-- Camada 1 — Cadastro Verificado -->
      <q-card v-if="role !== 'client'" flat bordered class="verified-card">
        <q-card-section class="q-gutter-y-sm">
          <div class="row items-center no-wrap q-gutter-x-xs">
            <q-icon name="verified_user" color="primary" size="18px" />
            <span class="text-caption text-weight-bold text-uppercase text-primary letter-wide">Camada 1 — Cadastro Verificado</span>
          </div>

          <div class="text-caption text-grey-6 text-weight-light">Para garantir a segurança da rede, exigimos a verificação de sua identidade e atuação.</div>

          <!-- CPF / CNPJ -->
          <q-input hide-bottom-space
            :model-value="cpfCnpj"
            outlined
            dense
            class="font-mono"
            :label="role === 'driver' ? 'CPF do Entregador (Obrigatório)' : 'CNPJ do Estabelecimento (Obrigatório)'"
            :maxlength="role === 'driver' ? 14 : 18"
            :placeholder="role === 'driver' ? 'Ex: 000.000.000-00' : 'Ex: 00.000.000/0000-00'"
            :rules="[required]"
            lazy-rules
            @update:model-value="handleCpfCnpjInput"
          />

          <!-- Fotos (Entregadores) -->
          <div v-if="role === 'driver'" class="row q-col-gutter-sm">
            <div class="col-6">
              <q-card flat bordered class="upload-box cursor-pointer" :class="docPhoto ? 'upload-box--ok' : ''" @click="handleFileUpload('doc', 'cnh_entregador.jpg')">
                <q-card-section class="column items-center justify-center text-center q-pa-sm">
                  <q-icon :name="docPhoto ? 'check' : 'photo_camera'" :color="docPhoto ? 'primary' : 'grey-6'" size="18px" />
                  <span class="text-caption text-weight-bold text-grey-6 upload-label">
                    {{ docPhoto ? 'Anexado: ' + docPhoto : 'Anexar CNH' }}
                  </span>
                </q-card-section>
              </q-card>
              <div class="text-caption text-grey-6 text-uppercase q-mt-xs">Foto da CNH</div>
            </div>

            <div class="col-6">
              <q-card flat bordered class="upload-box cursor-pointer" :class="selfiePhoto ? 'upload-box--ok' : ''" @click="handleFileUpload('selfie', 'selfie_entregador.jpg')">
                <q-card-section class="column items-center justify-center text-center q-pa-sm">
                  <q-icon :name="selfiePhoto ? 'check' : 'person'" :color="selfiePhoto ? 'primary' : 'grey-6'" size="18px" />
                  <span class="text-caption text-weight-bold text-grey-6 upload-label">
                    {{ selfiePhoto ? 'Anexado: ' + selfiePhoto : 'Tirar Selfie' }}
                  </span>
                </q-card-section>
              </q-card>
              <div class="text-caption text-grey-6 text-uppercase q-mt-xs">Foto de Selfie</div>
            </div>
          </div>

          <!-- Certificado Digital A1 (Estabelecimentos) -->
          <div v-if="role === 'store'" class="q-gutter-y-sm">
            <div class="row items-center no-wrap q-gutter-x-xs">
              <q-icon name="vpn_key" color="primary" size="16px" />
              <span class="text-caption text-weight-bold text-uppercase text-grey-6">Certificado Digital A1 (.PFX / .P12)</span>
              <span class="text-negative text-weight-bold">*</span>
            </div>

            <div class="text-caption text-grey-6 text-weight-light">
              Anexe o arquivo A1 (.pfx) do estabelecimento para emissão de notas fiscais e assinatura digital dos termos de doação da Lei 14.016/2020.
            </div>

            <!-- Arquivo anexado -->
            <q-item v-if="pfxFileName" class="pfx-item rounded-borders">
              <q-item-section avatar>
                <q-avatar rounded color="primary" text-color="white" icon="description" size="32px" />
              </q-item-section>
              <q-item-section>
                <q-item-label class="text-weight-bold ellipsis font-mono">{{ pfxFileName }}</q-item-label>
                <q-item-label caption class="text-primary">
                  <span>{{ pfxFileSize || 'Arquivo .pfx anexado' }}</span>
                  <span> • </span>
                  <span class="text-weight-medium">Certificado A1 Válido</span>
                </q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-btn flat dense no-caps size="sm" color="negative" label="Remover" title="Substituir ou remover arquivo" @click="handleRemoveA1" />
              </q-item-section>
            </q-item>

            <div v-else class="q-gutter-y-sm">
              <q-file
                id="input-signup-cert-a1"
                v-model="a1File"
                outlined
                dense
                accept=".pfx,.p12"
                label="Anexar Arquivo A1 (.pfx ou .p12)"
                hint="Clique ou arraste o arquivo do certificado digital"
                @update:model-value="handleA1FileUpload"
              >
                <template #prepend>
                  <q-icon name="cloud_upload" color="primary" />
                </template>
              </q-file>

            </div>

            <!-- Senha do certificado -->
            <q-input hide-bottom-space
              id="input-signup-cert-password"
              v-model="pfxPassword"
              outlined
              dense
              class="font-mono"
              label="Senha do Certificado A1"
              hint="Para descriptografia"
              placeholder="Senha de importação do .pfx"
              :type="showPfxPassword ? 'text' : 'password'"
            >
              <template #append>
                <q-icon
                  :name="showPfxPassword ? 'visibility_off' : 'visibility'"
                  class="cursor-pointer"
                  size="18px"
                  @click="showPfxPassword = !showPfxPassword"
                />
              </template>
            </q-input>
          </div>
        </q-card-section>
      </q-card>

      <!-- Vínculo de trabalho (Entregador) -->
      <q-card v-if="role === 'driver'" flat bordered class="verified-card">
        <q-card-section class="q-gutter-y-sm">
          <div class="text-caption text-weight-bold text-uppercase text-primary letter-wide">Vínculo de Trabalho</div>

          <q-btn-toggle
            v-model="tipoEntregador"
            spread
            unelevated
            no-caps
            dense
            toggle-color="primary"
            color="grey-3"
            text-color="grey-8"
            class="full-width"
            :options="driverTypeOptions"
          />

          <q-select
            v-if="tipoEntregador === 'internal'"
            v-model="contractedStoreId"
            outlined
            dense
            emit-value
            map-options
            label="Vincular ao Estabelecimento"
            :options="storeOptions"
          />

          <q-input hide-bottom-space
            v-model="workingCity"
            outlined
            dense
            label="Cidade de Trabalho"
            placeholder="Ex: Pinhalzinho"
            :rules="[required]"
            lazy-rules
          />
        </q-card-section>
      </q-card>

      <!-- Nome -->
      <q-input hide-bottom-space
        id="input-signup-name"
        v-model="username"
        outlined
        dense
        :label="
          role === 'client'
            ? 'Seu Nome completo'
            : role === 'store'
            ? 'Nome Fantasia do Estabelecimento'
            : role === 'driver'
            ? 'Nome completo do Entregador'
            : role === 'institution'
            ? 'Nome da Entidade Social / ONG'
            : 'Nome da Unidade de Descarte / Compostagem'
        "
        :placeholder="
          role === 'client'
            ? 'Ex: Camila Silva'
            : role === 'store'
            ? 'Ex: Estabelecimento / Comércio Central'
            : role === 'driver'
            ? 'Ex: Marcos Souza'
            : role === 'institution'
            ? 'Ex: Mesa Brasil Sesc'
            : 'Ex: Orgânicos do Pinhal'
        "
        :rules="[required]"
        lazy-rules
        @update:model-value="formErr = null"
      >
        <template #prepend>
          <q-icon name="person" />
        </template>
      </q-input>

      <!-- E-mail -->
      <q-input hide-bottom-space
        id="input-signup-email"
        v-model="email"
        type="email"
        outlined
        dense
        label="E-mail de Login"
        placeholder="Ex: seuemail@email.com"
        :rules="[required]"
        lazy-rules
        @update:model-value="formErr = null"
      >
        <template #prepend>
          <q-icon name="mail" />
        </template>
      </q-input>

      <!-- Endereço -->
      <q-input hide-bottom-space
        id="input-signup-address"
        v-model="address"
        outlined
        dense
        label="Endereço Principal"
        placeholder="Ex: Av. Mato Grosso, 3269, Pinhalzinho/SC"
      >
        <template #prepend>
          <q-icon name="place" />
        </template>
      </q-input>

      <!-- Senha -->
      <q-input hide-bottom-space
        id="input-signup-pass"
        v-model="password"
        type="password"
        outlined
        dense
        label="Senha de Acesso"
        placeholder="Mínimo 4 caracteres"
        :rules="[required]"
        lazy-rules
        @update:model-value="formErr = null"
      >
        <template #prepend>
          <q-icon name="lock" />
        </template>
      </q-input>

      <!-- Confirmar senha -->
      <q-input hide-bottom-space
        id="input-signup-confirm"
        v-model="confirmPassword"
        type="password"
        outlined
        dense
        label="Confirmar Senha"
        placeholder="Repita sua senha"
        :rules="[required]"
        lazy-rules
        @update:model-value="formErr = null"
      >
        <template #prepend>
          <q-icon name="verified_user" />
        </template>
      </q-input>

      <q-btn
        id="btn-signup-submit"
        type="submit"
        unelevated
        rounded
        no-caps
        color="primary"
        class="full-width text-weight-bold font-display"
        :loading="submitting"
        :disable="submitting"
        :label="submitting ? 'Cadastrando...' : 'Finalizar Cadastro'"
      />
    </q-form>
    </div>

    <!-- Redirecionamento -->
    <div class="cadastro-footer text-center q-mt-sm">
      <q-separator class="q-mb-sm" />
      <div class="text-caption text-grey-6 text-weight-light">
        Já possui conta?
        <q-btn
          id="link-signup-to-login"
          flat
          dense
          no-caps
          color="primary"
          class="text-weight-bold q-ml-xs"
          label="Faça login aqui..."
          @click="router.push({ name: 'Login' })"
        />
      </div>
    </div>
    </LayoutEntrada>
  </q-page>
</template>

<style scoped lang="scss">
.cadastro-page {
  position: relative;
  min-height: 100%;
}

.cadastro-form {
  width: 100%;
  max-width: 420px;
  margin-left: auto !important;
  margin-right: auto !important;
}

.letter-wide {
  letter-spacing: 0.1em;
}

.verified-card {
  background: rgba(67, 160, 71, 0.05);
  border-color: rgba(67, 160, 71, 0.2);
}

.upload-box {
  min-height: 64px;
  border-style: dashed;

  &--ok {
    border-color: var(--q-primary);
    background: rgba(67, 160, 71, 0.1);
  }
}

.upload-label {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.2;
}

.pfx-item {
  background: rgba(67, 160, 71, 0.1);
  border: 1px solid rgba(67, 160, 71, 0.3);
}
</style>
