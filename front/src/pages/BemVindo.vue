<script setup>
import { useRouter } from "vue-router";
import FundoSustentavel from "components/FundoSustentavel.vue";
const router = useRouter();
</script>

<template>
  <q-page class="bemvindo column items-center justify-between q-py-xl q-px-lg">
    <FundoSustentavel />
    <!-- Header Logo Design -->
    <div class="logo-wrap column items-center q-mt-md">
      <div class="logo-ring row items-center justify-center q-pa-sm">
        <svg class="logo-text-svg text-grey-7" viewBox="0 0 200 200">
          <path
            id="curve"
            fill="none"
            d="M 100, 100 m -80, 0 a 80,80 0 1,1 160,0 a 80,80 0 1,1 -160,0"
          />
          <text fill="currentColor">
            <textPath href="#curve" startOffset="0%">
              descontos • sustentabilidade • zero disperdício • economia circular
            </textPath>
          </text>
        </svg>
      </div>

      <!-- Inner Logo Image / Basket SVG -->
      <div class="logo-inner column items-center">
        <span class="logo-save text-h5 text-weight-bold">SAVE</span>
        <span class="logo-all text-h6 text-weight-light text-positive">ALL.</span>

        <!-- Custom SVG food basket logo -->
        <svg class="logo-basket q-mt-sm" viewBox="0 0 64 64" fill="none">
          <!-- Basket base outline -->
          <path d="M12 28 H52 L46 54 H18 Z" fill="#66BB6A" opacity="0.85" />
          <path d="M14 30 H50 L45 52 H19 Z" fill="#4CAF50" />
          <rect x="10" y="24" width="44" height="6" rx="3" fill="#A5D6A7" />
          <!-- Grill grid details on basket -->
          <line x1="22" y1="30" x2="24" y2="52" stroke="#ffffff" stroke-width="1.5" opacity="0.3" />
          <line x1="32" y1="30" x2="32" y2="52" stroke="#ffffff" stroke-width="1.5" opacity="0.3" />
          <line x1="42" y1="30" x2="40" y2="52" stroke="#ffffff" stroke-width="1.5" opacity="0.3" />
          <line x1="16" y1="38" x2="48" y2="38" stroke="#ffffff" stroke-width="1.5" opacity="0.3" />
          <line x1="18" y1="46" x2="46" y2="46" stroke="#ffffff" stroke-width="1.5" opacity="0.3" />
          <!-- Delicious organic food popping out -->
          <!-- Carrot -->
          <path d="M22 14 Q24 10 21 6 Q25 9 27 16" stroke="#81C784" stroke-width="2" stroke-linecap="round" />
          <polygon points="18,24 24,15 28,24" fill="#FFA726" />
          <!-- Apple -->
          <circle cx="34" cy="20" r="6" fill="#EF5350" />
          <path d="M34 14 Q36 10 38 13" stroke="#81C784" stroke-width="1.5" />
          <!-- Bread -->
          <path d="M40 24 C40 16 48 16 48 24 Z" fill="#FFB74D" />
          <line x1="42" y1="20" x2="45" y2="23" stroke="#ffffff" stroke-width="1" />
          <line x1="45" y1="18" x2="48" y2="21" stroke="#ffffff" stroke-width="1" />
          <!-- Leaf details -->
          <circle cx="28" cy="22" r="4.5" fill="#C5E1A5" />
        </svg>
      </div>
    </div>

    <!-- Greeting Title -->
    <div class="text-center q-my-lg col column justify-center">
      <h2 class="titulo text-h5 text-weight-light q-ma-none">Bem-vindo (a)</h2>
      <p class="descricao text-body2 text-grey-6 text-weight-light q-mt-sm q-mb-none">
        Economize dinheiro, saboreie refeições incríveis e salve o planeta reduzindo o desperdício alimentar.
      </p>
    </div>

    <!-- Actions -->
    <div class="acoes column q-gutter-y-md full-width q-mt-auto">
      <q-btn
        id="btn-welcome-login"
        class="full-width"
        color="positive"
        text-color="dark"
        rounded
        unelevated
        no-caps
        size="lg"
        label="Acessar Conta (Login)"
        @click="router.push({ name: 'Login' })"
      />

      <q-btn
        id="btn-welcome-signup"
        class="full-width btn-cadastro"
        color="positive"
        outline
        rounded
        no-caps
        size="lg"
        label="Cadastre-se grátis"
        @click="router.push({ name: 'Cadastro' })"
      />

      <!-- Public Social Entity Registration Link with Gov.br -->
      <q-btn
        class="full-width btn-entidade"
        color="positive"
        flat
        no-caps
        dense
        href="/credenciamento-entidade"
      >
        <span class="text-caption text-weight-bold">🏛️ É uma Entidade Social / ONG? Credencie-se via Gov.br</span>
      </q-btn>
    </div>
  </q-page>
</template>

<style scoped lang="scss">
.bemvindo {
  position: relative;
  min-height: 100%;
  background: #f5f7f8;
  color: #1e293b;
}
.logo-wrap {
  position: relative;
}
.logo-ring {
  width: 224px;
  height: 224px;
  border-radius: 50%;
  border: 1px dashed #cbd5e1;
  animation: logo-spin 50s linear infinite;
}
.logo-text-svg {
  position: absolute;
  width: 100%;
  height: 100%;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.25em;
}
.logo-inner {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}
.logo-save {
  letter-spacing: 0.15em;
  color: #0f172a;
}
.logo-all {
  letter-spacing: 0.2em;
  margin-top: -4px;
}
.logo-basket {
  width: 80px;
  height: 80px;
}
.titulo {
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #0f172a;
}
.descricao {
  max-width: 320px;
  margin-left: auto;
  margin-right: auto;
  line-height: 1.6;
}
.acoes {
  max-width: 320px;
}
.btn-entidade {
  border: 1px solid #a7f3d0;
  background: #ecfdf5;
  border-radius: 12px;
  color: #047857 !important;
}

.body--dark {
  .bemvindo {
    background: #040c13;
    color: #fff;
  }
  .logo-ring {
    border-color: #475569;
  }
  .logo-save,
  .titulo {
    color: #fff;
  }
  .btn-entidade {
    background: rgba(15, 23, 42, 0.6);
    border-color: #1e293b;
    color: #34d399 !important;
  }
}

@keyframes logo-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
