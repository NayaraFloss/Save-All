<script setup>
import { useRouter } from "vue-router";
import { ref } from "vue";
import { storeToRefs } from "pinia";
import { useAppStore } from "../stores/estadoApp";
import FundoSustentavel from "components/FundoSustentavel.vue";
import LayoutEntrada from "components/LayoutEntrada.vue";
defineOptions({ name: "LoginPage" });
const router = useRouter();
const appStore = useAppStore();
const { error } = storeToRefs(appStore);
const { login } = appStore;
const email = ref("");
const password = ref("");
const showPassword = ref(false);
const submitting = ref(false);
const formErr = ref(null);
const handleSubmit = async () => {
  if (!email.value || !password.value) {
    formErr.value = "Informe seu e-mail (ou usu\xE1rio) e senha para entrar.";
    return;
  }
  formErr.value = null;
  submitting.value = true;
  try {
    await login(email.value, password.value);
  } catch (err) {
    formErr.value = err.message || "Credenciais inv\xE1lidas. Verifique seu e-mail e senha.";
  } finally {
    submitting.value = false;
  }
};
</script>

<template>
  <q-page class="login-page">
    <FundoSustentavel />
    <LayoutEntrada>
    <!-- Barra superior -->
    <div class="row items-center justify-between">
      <q-btn
        id="btn-login-back"
        flat
        no-caps
        color="grey-7"
        icon="arrow_back"
        label="Voltar"
        class="text-weight-bold text-uppercase"
        @click="router.push({ name: 'BemVindo' })"
      />
      <q-chip outline dense size="sm" color="grey-7" class="font-mono">SaveAll Acesso Único</q-chip>
    </div>

    <!-- Conteúdo principal -->
    <div class="login-content full-width q-mx-auto q-py-md q-gutter-y-md">
      <!-- Logo e título -->
      <div class="text-center q-gutter-y-sm">
        <q-avatar size="56px" square class="logo-box bg-white">
          <svg viewBox="0 0 64 64" width="32" height="32" fill="none">
            <rect x="10" y="24" width="44" height="6" rx="3" fill="#66BB6A" />
            <path d="M14 30 H50 L45 52 H19 Z" fill="#4CAF50" />
            <polygon points="18,24 24,15 28,24" fill="#FFA726" />
            <circle cx="34" cy="20" r="6" fill="#EF5350" />
          </svg>
        </q-avatar>

        <div>
          <div class="text-h6 text-weight-bold font-display">Acesse sua Conta</div>
          <div class="text-caption text-grey-6">
            Informe suas credenciais cadastradas para entrar no sistema
          </div>
        </div>
      </div>

      <!-- Erro do formulário -->
      <q-banner v-if="formErr || error" dense rounded class="bg-negative text-white text-center text-caption">
        {{ formErr || error }}
      </q-banner>

      <!-- Formulário -->
      <q-form class="q-gutter-y-sm" @submit.prevent="handleSubmit">
        <q-input hide-bottom-space
          id="input-login-email"
          v-model="email"
          outlined
          dense
          label="E-mail ou Usuário"
          placeholder="Digite seu e-mail ou usuário"
          :rules="[(v) => !!v || 'Informe seu e-mail ou usuário']"
          lazy-rules
          @update:model-value="formErr = null"
        >
          <template #prepend>
            <q-icon name="mail" />
          </template>
        </q-input>

        <q-input hide-bottom-space
          id="input-login-password"
          v-model="password"
          outlined
          dense
          label="Senha"
          placeholder="Digite sua senha"
          :type="showPassword ? 'text' : 'password'"
          :rules="[(v) => !!v || 'Informe sua senha']"
          lazy-rules
          @update:model-value="formErr = null"
        >
          <template #prepend>
            <q-icon name="lock" />
          </template>
          <template #append>
            <q-icon
              id="btn-login-toggle-pass"
              :name="showPassword ? 'visibility_off' : 'visibility'"
              class="cursor-pointer"
              @click="showPassword = !showPassword"
            />
          </template>
        </q-input>

        <div class="row justify-end">
          <q-btn
            id="link-forgot-pass"
            flat
            dense
            no-caps
            size="sm"
            color="primary"
            label="Esqueceu a senha?"
            @click="
              $q.notify({
                type: 'info',
                message: 'Para redefinir sua senha, fale com o administrador do sistema.'
              })
            "
          />
        </div>

        <q-btn
          id="btn-login-submit"
          type="submit"
          unelevated
          rounded
          color="primary"
          class="full-width text-weight-bold"
          icon="login"
          :loading="submitting"
          :disable="submitting"
          :label="submitting ? 'Entrando...' : 'Entrar na Plataforma'"
        />
      </q-form>

      <!-- Credenciamento Gov.br -->
      <q-card flat bordered>
        <q-card-section class="q-pa-sm row items-center justify-between no-wrap">
          <div class="row items-center no-wrap text-primary text-weight-bold text-caption">
            <q-icon name="verified_user" size="18px" class="q-mr-xs" />
            <span>É uma Entidade Social / ONG?</span>
          </div>
          <q-btn
            flat
            dense
            no-caps
            size="sm"
            color="primary"
            type="a"
            href="#/credenciamento-entidade"
            label="Credenciar com Gov.br →"
          />
        </q-card-section>
      </q-card>
    </div>

    <!-- Rodapé: criar conta -->
    <div class="login-content full-width q-mx-auto">
      <q-separator class="q-mb-sm" />
      <div class="text-center text-caption text-grey-6">
        Não tem uma conta?
        <q-btn
          id="link-login-to-signup"
          flat
          dense
          no-caps
          color="primary"
          class="text-weight-bold q-ml-xs"
          label="Cadastre-se aqui (escolha seu perfil)"
          @click="router.push({ name: 'Cadastro' })"
        />
      </div>
    </div>
    </LayoutEntrada>
  </q-page>
</template>

<style scoped lang="scss">
.login-page {
  position: relative;
  min-height: 100%;
}

.login-content {
  max-width: 384px;
}

.logo-box {
  border-radius: 16px;
  border: 1px solid rgba(128, 128, 128, 0.25);
}

.body--dark .logo-box {
  background: #1d1d1d !important;
}
</style>
