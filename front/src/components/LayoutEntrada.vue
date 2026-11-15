<script setup>
// Tela dividida de entrada (Login / Cadastro):
// painel com a marca Save All à esquerda e formulário à direita.
// Em telas estreitas (< 900px) o painel da marca some e só o formulário aparece.
defineOptions({ name: 'LayoutEntrada' })
defineProps({
  titulo: { type: String, default: 'Salve comida. Salve o planeta.' },
  texto: {
    type: String,
    default: 'Compre alimentos com desconto, doe o que sobra e acompanhe o impacto de cada resgate.'
  }
})

const beneficios = [
  { icone: 'shopping_basket', texto: 'Alimentos fresquinhos com até 70% de desconto' },
  { icone: 'volunteer_activism', texto: 'Doações rastreáveis para entidades sociais' },
  { icone: 'eco', texto: 'Impacto ecológico medido a cada pedido' }
]
</script>

<template>
  <div class="entrada">
    <section class="entrada__form">
      <slot />
    </section>

    <aside class="entrada__marca" aria-hidden="true">
      <div class="marca-conteudo column items-center text-center">
        <div class="marca-logo">
          <svg class="marca-anel" viewBox="0 0 200 200">
            <path id="curva-marca" fill="none" d="M 100, 100 m -80, 0 a 80,80 0 1,1 160,0 a 80,80 0 1,1 -160,0" />
            <text fill="currentColor"><textPath href="#curva-marca">descontos • sustentabilidade • zero desperdício • economia circular</textPath></text>
          </svg>
          <div class="marca-centro column items-center">
            <span class="marca-save">SAVE</span>
            <span class="marca-all">ALL.</span>
            <svg class="marca-cesta" viewBox="0 0 64 64" fill="none">
              <path d="M12 28 H52 L46 54 H18 Z" fill="#A5D6A7" opacity="0.9" />
              <path d="M14 30 H50 L45 52 H19 Z" fill="#66BB6A" />
              <rect x="10" y="24" width="44" height="6" rx="3" fill="#E8F5E9" />
              <line x1="22" y1="30" x2="24" y2="52" stroke="#fff" stroke-width="1.5" opacity="0.4" />
              <line x1="32" y1="30" x2="32" y2="52" stroke="#fff" stroke-width="1.5" opacity="0.4" />
              <line x1="42" y1="30" x2="40" y2="52" stroke="#fff" stroke-width="1.5" opacity="0.4" />
              <polygon points="18,24 24,15 28,24" fill="#FFA726" />
              <circle cx="34" cy="20" r="6" fill="#EF5350" />
              <circle cx="44" cy="22" r="4" fill="#FFEE58" />
            </svg>
          </div>
        </div>

        <h2 class="marca-titulo">{{ titulo }}</h2>
        <p class="marca-texto">{{ texto }}</p>

        <ul class="marca-lista column q-gutter-y-sm">
          <li v-for="b in beneficios" :key="b.icone" class="row items-center no-wrap">
            <q-icon :name="b.icone" size="20px" class="q-mr-sm" />
            <span class="text-left">{{ b.texto }}</span>
          </li>
        </ul>
      </div>
    </aside>
  </div>
</template>

<style scoped lang="scss">
.entrada {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-height: 100%;
}

.entrada__form {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  min-width: 0;

  // blocos internos centralizados, com largura confortável para formulário
  > :deep(*) { width: 100%; max-width: 440px; }
}

.entrada__marca { display: none; }

@media (min-width: 900px) {
  .entrada { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .entrada__form { padding: 24px 40px; }

  .entrada__marca {
    order: -1; // marca na esquerda, formulário na direita
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px;
    color: #fff;
    background: linear-gradient(155deg, #2e7d32 0%, #43a047 55%, #66bb6a 100%);
    position: relative;
    overflow: hidden;

    // círculos decorativos
    &::before, &::after {
      content: '';
      position: absolute;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.07);
    }
    &::before { width: 420px; height: 420px; top: -140px; left: -120px; }
    &::after { width: 320px; height: 320px; bottom: -120px; right: -100px; }
  }
}

.marca-conteudo { position: relative; z-index: 1; max-width: 420px; }

.marca-logo {
  position: relative;
  width: 240px;
  height: 240px;
  border-radius: 50%;
  border: 1px dashed rgba(255, 255, 255, 0.55);
  background: rgba(255, 255, 255, 0.08);
}
.marca-anel {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.25em;
  color: rgba(255, 255, 255, 0.85);
  animation: marca-giro 60s linear infinite; // só o texto em volta gira
}
.marca-centro {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}
.marca-save { font-size: 26px; font-weight: 700; letter-spacing: 0.15em; line-height: 1.1; }
.marca-all { font-size: 20px; font-weight: 300; letter-spacing: 0.2em; margin-top: -2px; color: #dcedc8; }
.marca-cesta { width: 84px; height: 84px; margin-top: 6px; }

.marca-titulo {
  margin: 28px 0 8px;
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 700;
  line-height: 1.2;
}
.marca-texto { margin: 0 0 20px; font-size: 15px; line-height: 1.6; opacity: 0.92; }
.marca-lista { list-style: none; margin: 0; padding: 0; font-size: 14px; }

@keyframes marca-giro { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .marca-anel { animation: none; }
}
</style>
