<script setup>
// Fundo decorativo (compras + sustentabilidade) das telas de entrada.
// Ícones em traço, bem suaves, para não competir com o conteúdo.
defineOptions({ name: 'FundoSustentavel' })

// x, y, escala, rotação e ícone de cada desenho (viewBox 600 x 900)
const itens = [
  { i: 'sacola', x: 60, y: 70, s: 1.1, r: -12 }, { i: 'folha', x: 470, y: 60, s: 1.2, r: 20 },
  { i: 'reciclar', x: 300, y: 130, s: 1.0, r: 0 }, { i: 'carrinho', x: 520, y: 230, s: 1.2, r: 8 },
  { i: 'maca', x: 70, y: 260, s: 1.0, r: -8 }, { i: 'arvore', x: 200, y: 300, s: 1.1, r: 0 },
  { i: 'pao', x: 440, y: 380, s: 1.0, r: 14 }, { i: 'gota', x: 50, y: 450, s: 1.0, r: 0 },
  { i: 'sacola', x: 540, y: 520, s: 1.0, r: 10 }, { i: 'reciclar', x: 150, y: 560, s: 1.1, r: 15 },
  { i: 'folha', x: 330, y: 610, s: 1.0, r: -25 }, { i: 'carrinho', x: 60, y: 700, s: 1.1, r: -6 },
  { i: 'maca', x: 470, y: 690, s: 1.1, r: 12 }, { i: 'arvore', x: 290, y: 780, s: 1.0, r: 0 },
  { i: 'pao', x: 130, y: 840, s: 1.0, r: -14 }, { i: 'gota', x: 540, y: 820, s: 1.0, r: 0 }
]

// Gera o desenho como imagem SVG (data URI) para poder repetir em telas largas
const defs = `
<g id="sacola"><path d="M-14 -6 H14 L11 20 H-11 Z"/><path d="M-7 -6 V-12 a7 7 0 0 1 14 0 V-6"/></g>
<g id="folha"><path d="M-14 12 C-14 -8 0 -16 16 -16 C16 0 8 14 -10 14 Z"/><path d="M-14 14 L6 -6"/></g>
<g id="reciclar"><path d="M-12 4 L-4 -10 L6 -10"/><path d="M2 -14 L8 -10 L2 -5"/><path d="M10 2 L14 14 L2 14"/><path d="M6 18 L2 14 L7 10"/><path d="M-14 14 L-22 2 L-14 -8" transform="translate(6 0)"/></g>
<g id="carrinho"><path d="M-18 -14 H-12 L-6 10 H12 L16 -6 H-10"/><circle cx="-4" cy="16" r="2.5"/><circle cx="10" cy="16" r="2.5"/></g>
<g id="maca"><path d="M0 -8 C-8 -14 -18 -6 -14 6 C-11 16 -5 18 0 15 C5 18 11 16 14 6 C18 -6 8 -14 0 -8 Z"/><path d="M0 -8 C0 -13 2 -16 6 -18"/></g>
<g id="arvore"><circle cx="0" cy="-8" r="12"/><path d="M0 4 V20"/><path d="M0 12 L-6 6"/></g>
<g id="pao"><path d="M-16 6 C-20 -8 -8 -14 0 -14 C8 -14 20 -8 16 6 Z"/><path d="M-16 6 H16 V12 H-16 Z"/><path d="M-5 -8 L-2 -2 M3 -8 L6 -2"/></g>
<g id="gota"><path d="M0 -16 C8 -4 12 2 12 8 a12 12 0 0 1 -24 0 C-12 2 -8 -4 0 -16 Z"/></g>`
const uso = itens
  .map((it) => `<use href="#${it.i}" transform="translate(${it.x} ${it.y}) rotate(${it.r}) scale(${it.s * 1.5})"/>`)
  .join('')
const gerar = (cor) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900" fill="none" stroke="${cor}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><defs>${defs}</defs>${uso}</svg>`
  )}")`
const estilo = { '--fs-claro': gerar('#43a047'), '--fs-escuro': gerar('#81c784') }
</script>

<template>
  <div class="fundo-sustentavel" :style="estilo" aria-hidden="true" />
</template>

<style scoped lang="scss">
.fundo-sustentavel {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: -1;
  opacity: 0.22;
  background-image: var(--fs-claro);
  background-size: 520px 780px;
  background-repeat: repeat;
  background-position: center top;
}

.body--dark .fundo-sustentavel {
  background-image: var(--fs-escuro);
  opacity: 0.14;
}

@media (max-width: 520px) {
  // celular: o desenho ocupa a largura toda
  .fundo-sustentavel { background-size: 100% auto; }
}
</style>
