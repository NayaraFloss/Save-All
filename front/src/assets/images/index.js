// Imagens do projeto.
// Coloque as fotos nesta pasta (jpg, png, webp ou svg) com os mesmos nomes abaixo.
// Se existir um .jpg/.png/.webp, ele tem prioridade sobre o placeholder .svg.
// Para baixar as fotos originais: npm run imagens
const urls = import.meta.glob('./*.{jpg,jpeg,png,webp,svg}', {
  eager: true,
  query: '?url',
  import: 'default'
})

const pick = (nome) =>
  urls[`./${nome}.jpg`] ??
  urls[`./${nome}.jpeg`] ??
  urls[`./${nome}.png`] ??
  urls[`./${nome}.webp`] ??
  urls[`./${nome}.svg`]

export const IMAGES = {
  lojaItaipu: pick('loja-itaipu'),
  lojaVilla: pick('loja-villa'),
  lojaKiuda: pick('loja-kiuda'),
  lojaBonissima: pick('loja-bonissima'),
  lojaCentral: pick('loja-central'),
  lojaSelecao: pick('loja-selecao'),
  alimento01: pick('alimento-01'),
  alimento02: pick('alimento-02'),
  alimento03: pick('alimento-03'),
  alimento04: pick('alimento-04'),
  alimento05: pick('alimento-05'),
  avatarPadrao: pick('avatar-padrao'),
  avatar02: pick('avatar-02'),
  avatar03: pick('avatar-03'),
  avatar04: pick('avatar-04'),
  avatar05: pick('avatar-05'),
  avatar06: pick('avatar-06'),
  avatar07: pick('avatar-07'),
  avatar08: pick('avatar-08'),
  avatar09: pick('avatar-09'),
  avatar10: pick('avatar-10'),
  avatarDocumento: pick('avatar-documento'),
}
