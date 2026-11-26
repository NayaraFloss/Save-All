// Inicializa o Pinia, que fornece a instância compartilhada das stores da aplicação.
import { defineStore } from '#q-app/wrappers'
import { createPinia } from 'pinia'

/*
 * Sem SSR, a instância da store também pode ser exportada diretamente.
 * Esta função de configuração pode ser assíncrona, desde que devolva a
 * instância do Pinia ou uma promessa que a resolva.
 */

export default defineStore((/* { ssrContext } */) => {
  // Cria a instância que será registrada pelo boot do Quasar.
  const pinia = createPinia()

  // Registre plugins do Pinia neste ponto, antes de devolver a instância.
  // pinia.use(SomePiniaPlugin)

  return pinia
})
