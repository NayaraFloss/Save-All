// A janela não rola mais: o conteúdo rola dentro de .app-shell (veja css/app.scss).
export const areaDeRolagem = () => document.querySelector('.app-shell') || window

export const rolarPara = (top = 0, behavior = 'smooth') => {
  areaDeRolagem().scrollTo({ top, behavior })
}
