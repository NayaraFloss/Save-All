import { defineBoot } from '#q-app/wrappers'
import { useAppStore } from 'stores/estadoApp'

// Perfil -> tela inicial
const homeByRole = {
  client: 'PainelConsumidor',
  store: 'PainelLoja',
  institution: 'PainelEntidade',
  disposal: 'PainelDescarte',
  master: 'PainelMaster',
  admin: 'PainelMaster'
}

export default defineBoot(async ({ router, store }) => {
  const app = useAppStore(store)
  app.setAppRouter(router)

  // Guard de autenticação / perfil
  router.beforeEach((to) => {
    if (!to.meta.requiresAuth) return true
    const user = app.usuarioAtual
    if (!user) return { name: 'Login' }
    const role = user.role === 'admin' ? 'master' : user.role
    if (to.meta.role && to.meta.role !== role) {
      return { name: homeByRole[user.role] || 'BemVindo' }
    }
    return true
  })

  await app.initApp()
})
