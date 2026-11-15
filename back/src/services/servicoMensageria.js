// Guarda, por usuário, o que já foi lido ou dispensado na central de mensagens.
// As mensagens em si são calculadas a partir dos dados do sistema (veja
// utils/mensageria.js); aqui fica só o estado de cada pessoa, salvo no servidor
// (tabela dados_usuario, chave "mensagens") para valer em qualquer navegador.
import { armazem } from './armazemServidor'

const DIAS_DE_RETENCAO = 30
const DIA = 86400000

const estadoVazio = () => ({ lidas: {}, dispensadas: {}, vistas: {} })

// O estado salvo é sempre o do usuário logado (o id fica só por compatibilidade).
const ler = () => ({ ...estadoVazio(), ...armazem.dado('mensagens', {}) })

const gravar = (_usuarioId, estado) => {
  armazem.salvarDado('mensagens', estado)
}

export const servicoMensageria = {
  // Aplica "lida" e "dispensada" às mensagens calculadas e fixa o horário em que
  // cada mensagem sem data própria (ex.: promoções) foi vista pela primeira vez.
  montar(usuarioId, geradas, agora = new Date()) {
    const estado = ler()
    const agoraIso = agora.toISOString()
    let alterou = false
    const lista = []

    for (const mensagem of geradas) {
      if (estado.dispensadas[mensagem.id]) continue
      let criadaEm = mensagem.criadaEm
      if (!criadaEm) {
        if (!estado.vistas[mensagem.id]) {
          estado.vistas[mensagem.id] = agoraIso
          alterou = true
        }
        criadaEm = estado.vistas[mensagem.id]
      }
      lista.push({ ...mensagem, criadaEm, lida: Boolean(estado.lidas[mensagem.id]) })
    }

    // Remove registros antigos para o armazenamento não crescer sem limite.
    const limite = agora.getTime() - DIAS_DE_RETENCAO * DIA
    for (const grupo of ['lidas', 'dispensadas', 'vistas']) {
      for (const [id, quando] of Object.entries(estado[grupo])) {
        if (new Date(quando).getTime() < limite) {
          delete estado[grupo][id]
          alterou = true
        }
      }
    }

    if (alterou) gravar(usuarioId, estado)
    return lista
  },

  marcarLidas(usuarioId, ids) {
    const estado = ler()
    const agora = new Date().toISOString()
    for (const id of ids) estado.lidas[id] = estado.lidas[id] || agora
    gravar(usuarioId, estado)
  },

  dispensar(usuarioId, id) {
    const estado = ler()
    estado.dispensadas[id] = new Date().toISOString()
    gravar(usuarioId, estado)
  },
}
