// WhatsApp por "mensagem pronta em um clique": o sistema abre o WhatsApp (app ou Web)
// já com o número e o texto preenchidos; quem envia é a própria pessoa, no aparelho dela.
// Não há servidor de envio nem cadastro na Meta.

// Deixa só os dígitos no formato internacional (55 + DDD + número). Vazio se inválido.
export const normalizarTelefone = (valor) => {
  let digitos = String(valor || '').replace(/\D/g, '')
  if (!digitos) return ''
  if (digitos.startsWith('00')) digitos = digitos.slice(2)
  if (digitos.startsWith('0')) digitos = digitos.replace(/^0+/, '')
  // Número brasileiro sem o código do país (DDD + 8 ou 9 dígitos)
  if (digitos.length === 10 || digitos.length === 11) digitos = `55${digitos}`
  return digitos.length >= 12 && digitos.length <= 13 ? digitos : ''
}

export const telefoneValido = (valor) => !!normalizarTelefone(valor)

// +55 (49) 99999-9999
export const formatarTelefone = (valor) => {
  const n = normalizarTelefone(valor)
  if (!n) return String(valor || '')
  const ddd = n.slice(2, 4)
  const resto = n.slice(4)
  const meio =
    resto.length === 9
      ? `${resto.slice(0, 5)}-${resto.slice(5)}`
      : `${resto.slice(0, 4)}-${resto.slice(4)}`
  return `+${n.slice(0, 2)} (${ddd}) ${meio}`
}

// Preferências salvas no perfil (extras do usuário)
export const configWhatsapp = (usuario) => ({
  abrirEm: 'app', // 'app' (wa.me, abre o aplicativo) ou 'web' (web.whatsapp.com)
  assinatura: '',
  avisarStatus: true, // loja: abrir a mensagem ao avançar o pedido
  ...(usuario?.whatsappConfig || {}),
})

export const linkWhatsapp = (telefone, texto, abrirEm = 'app') => {
  const numero = normalizarTelefone(telefone)
  const mensagem = encodeURIComponent(texto || '')
  if (abrirEm === 'web') {
    return `https://web.whatsapp.com/send?${numero ? `phone=${numero}&` : ''}text=${mensagem}`
  }
  return `https://wa.me/${numero}${mensagem ? `?text=${mensagem}` : ''}`
}

// Abre o WhatsApp com a mensagem. Precisa ser chamado direto no clique (senão o navegador bloqueia).
// Devolve false se o navegador bloqueou a nova aba.
export const abrirWhatsapp = (telefone, texto, usuario) => {
  const cfg = configWhatsapp(usuario)
  const corpo = cfg.assinatura?.trim() ? `${texto}\n\n${cfg.assinatura.trim()}` : texto
  const janela = window.open(linkWhatsapp(telefone, corpo, cfg.abrirEm), '_blank')
  if (janela) janela.opener = null
  return !!janela
}

const moeda = (valor) =>
  Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const primeiroNome = (nome) =>
  String(nome || '')
    .trim()
    .split(/\s+/)[0] || 'cliente'

// Mensagem da loja para o cliente conforme a situação do pedido
export const mensagemStatusPedido = (pedido, status = pedido?.status) => {
  // Sacola Surpresa: não revela a padaria nem os produtos ao cliente
  const loja = pedido?.surpresa ? 'padaria parceira' : pedido?.nomeLoja || 'nossa loja'
  const nome = primeiroNome(pedido?.nomeCliente)
  const numero = `#${pedido?.id}`
  const itens = pedido?.surpresa
    ? '• Sacola Surpresa'
    : (pedido?.items || []).map((i) => `• ${i.quantity}x ${i.name}`).join('\n')
  switch (status) {
    case 'pending':
      return `Olá, ${nome}! Recebemos o seu pedido ${numero} na ${loja}:\n${itens}\nTotal: ${moeda(pedido?.total)}.\nEm breve começamos o preparo.`
    case 'accepted':
      return `Olá, ${nome}! A ${loja} aceitou o seu pedido ${numero}.`
    case 'preparing':
      return `Olá, ${nome}! O seu pedido ${numero} está em preparo na ${loja}. Avisaremos quando sair para entrega.`
    case 'delivery':
      return `Olá, ${nome}! O seu pedido ${numero} saiu para entrega. Fique atento(a) ao endereço: ${pedido?.address || 'informado no pedido'}.`
    case 'delivered':
      return `Olá, ${nome}! O seu pedido ${numero} foi entregue. Obrigado por ajudar a evitar o desperdício com a ${loja}! Você pode avaliar o pedido no app em até 1 hora.`
    case 'cancelled':
      return `Olá, ${nome}. O seu pedido ${numero} na ${loja} foi cancelado. Se tiver dúvidas, responda esta mensagem.`
    default:
      return `Olá, ${nome}! Sobre o seu pedido ${numero} na ${loja}:`
  }
}

// Mensagem gentil quando o Master desvincula uma entidade social ou um estabelecimento.
// tipo: 'entidade' | 'loja'. Responsável e motivo são opcionais.
export const mensagemDesvinculo = ({
  tipo = 'entidade',
  nome = '',
  responsavel = '',
  motivo = '',
} = {}) => {
  const saudacao = `Olá, ${primeiroNome(responsavel || nome)}! \u{1F49A}`
  const motivoLinha = motivo?.trim() ? `\n\n\u{1F4CC} *Motivo:* ${motivo.trim()}` : ''
  if (tipo === 'loja') {
    return `${saudacao}

Aqui é a equipe do *Save All*. Passamos para avisar, com todo o respeito, que o vínculo do estabelecimento *${nome}* com a plataforma foi *pausado por enquanto*. Isso significa que os seus produtos ficam temporariamente fora do catálogo público de ofertas.${motivoLinha}

Agradecemos de coração por tudo que você já fez para reduzir o desperdício de alimentos na nossa região. \u{1F33F} Se quiser conversar, esclarecer algum ponto ou pedir a reativação, é só responder esta mensagem. Estamos aqui para ajudar!

Um abraço,
Equipe Save All`
  }
  return `${saudacao}

Aqui é a equipe do *Save All*. Passamos para avisar, com muito carinho e respeito, que o vínculo da entidade *${nome}* com a plataforma foi *pausado por enquanto*. Por isso, ela não receberá novas ofertas de doação até ser reativada.${motivoLinha}

Sabemos o quanto o trabalho de vocês é importante para as famílias atendidas, e agradecemos muito pela parceria até aqui. \u{1F64F} Se quiser conversar, atualizar algum dado ou pedir a reativação, é só responder esta mensagem. Vamos ajudar no que for preciso!

Um abraço,
Equipe Save All`
}

// Modelos de mensagem do painel master para estabelecimentos e clientes
export const MODELOS_MASTER = [
  {
    id: 'aviso',
    rotulo: 'Aviso geral',
    texto: (d) => `Olá, ${primeiroNome(d.nome)}! Aqui é a administração do Save All. `,
  },
  {
    id: 'validade',
    rotulo: 'Itens perto da validade',
    paraLoja: true,
    texto: (d) =>
      `Olá, ${d.nome}! Notamos itens do seu catálogo perto do vencimento. Que tal aplicar um desconto ou encaminhar para doação pelo app Save All?`,
  },
  {
    id: 'suspensao',
    rotulo: 'Conta suspensa',
    texto: (d) =>
      `Olá, ${d.nome}. Sua conta no Save All foi suspensa${d.motivo ? ` pelo seguinte motivo: ${d.motivo}` : ''}. Para contestar, responda esta mensagem.`,
  },
  {
    id: 'desvinculo',
    rotulo: 'Desvinculação (mensagem gentil)',
    paraLoja: true,
    texto: (d) => mensagemDesvinculo({ tipo: 'loja', nome: d.nome, motivo: d.motivo }),
  },
  {
    id: 'restauracao',
    rotulo: 'Conta reativada',
    texto: (d) =>
      `Olá, ${d.nome}! Sua conta no Save All foi reativada. Você já pode voltar a usar o app normalmente.`,
  },
  {
    id: 'suporte',
    rotulo: 'Retorno do suporte',
    texto: (d) =>
      `Olá, ${primeiroNome(d.nome)}! Aqui é o suporte do Save All, sobre o seu chamado: `,
  },
]
