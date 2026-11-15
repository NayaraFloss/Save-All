import { defineRouter } from '#q-app/wrappers'
import { createRouter, createMemoryHistory, createWebHistory } from 'vue-router'
import routes from './routes'

/*
 * If not building with SSR mode, you can
 * directly export the Router instantiation;
 *
 * The function below can be async too; either use
 * async/await or return a Promise which resolves
 * with the Router instance.
 */

// Erros que o navegador dá quando não consegue baixar o arquivo de uma tela
// (servidor fora do ar ou versão nova publicada com a aba antiga aberta).
const ERRO_CARREGAR_TELA =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i

const CHAVE_RECARGA = 'saveall_recarga_tela'

export default defineRouter(function (/* { store, ssrContext } */) {
  // URLs limpas (/painel-loja, /confirmar-doacao?id=...) em vez de /#/painel-loja.
  // O servidor (Vercel) devolve o index.html para qualquer rota: veja vercel.json.
  const createHistory = process.env.SERVER ? createMemoryHistory : createWebHistory

  // Links antigos com "#/" (ex.: confirmações de doação já enviadas por WhatsApp)
  // continuam funcionando: /#/confirmar-doacao?id=X vira /confirmar-doacao?id=X
  if (!process.env.SERVER && window.location.hash.startsWith('#/')) {
    window.history.replaceState(null, '', window.location.hash.slice(1))
  }

  const Router = createRouter({
    scrollBehavior: () => ({ left: 0, top: 0 }),
    routes,

    // Leave this as is and make changes in quasar.conf.js instead!
    // quasar.conf.js -> build -> vueRouterMode
    // quasar.conf.js -> build -> publicPath
    history: createHistory(process.env.VUE_ROUTER_BASE)
  })

  if (!process.env.SERVER) {
    // Se a tela não carregar, recarrega a página UMA vez já no destino.
    // A marca no sessionStorage evita ficar recarregando sem parar se o servidor estiver fora do ar.
    Router.onError((err, to) => {
      if (!ERRO_CARREGAR_TELA.test(err?.message || '')) return

      let jaRecarregou = false
      try {
        jaRecarregou = sessionStorage.getItem(CHAVE_RECARGA) === to.fullPath
        sessionStorage.setItem(CHAVE_RECARGA, to.fullPath)
      } catch {
        // sessionStorage indisponível: segue sem a proteção
      }
      if (jaRecarregou) return

      const destino = Router.resolve(to.fullPath).href
      window.location.href = destino
      window.location.reload()
    })

    // Quando uma navegação dá certo, libera nova tentativa de recarga no futuro
    Router.afterEach(() => {
      try {
        sessionStorage.removeItem(CHAVE_RECARGA)
      } catch {
        // ignora
      }
    })
  }

  return Router
})
