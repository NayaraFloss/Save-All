// Junta as avaliações recebidas pela loja (pedidos de clientes + doações avaliadas pelas
// entidades) e calcula média e reclamações. É a MESMA conta usada na lista "Avaliações
// recebidas" e no card "Governança de Qualidade", para os números nunca divergirem.

// Limite de reclamações de 1 estrela tolerado (regra da plataforma)
export const LIMITE_RECLAMACOES = 5;

// Conta como reclamação formal: nota 1, ou reclamação marcada com nota baixa (1 ou 2).
// Uma nota 4 ou 5 nunca vira reclamação, mesmo que a caixinha tenha ficado marcada por engano.
export const ehReclamacao = (a) => {
  const nota = Number(a?.notaComida) || 0;
  if (!nota) return false;
  return nota === 1 || (!!a?.reclamacaoComida && nota <= 2);
};

// Lista única de avaliações, da mais recente para a mais antiga.
export const listarAvaliacoes = (orders = [], donations = []) => {
  const dePedidos = (orders || [])
    .filter((o) => Number(o?.notaComida) > 0)
    .map((o) => ({
      id: `pedido-${o.id}`,
      origem: "cliente",
      notaComida: Number(o.notaComida),
      comentarioComida: o.comentarioComida,
      reclamacaoComida: !!o.reclamacaoComida,
      data: o.avaliadoEm || o.date,
    }));
  // Evita contar a mesma doação duas vezes (id e token)
  const vistos = new Set();
  const deDoacoes = (donations || [])
    .filter((d) => Number(d?.avaliacaoEntidade?.notaComida) > 0)
    .filter((d) => {
      const chave = d.id || d.token;
      if (!chave) return true;
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    })
    .map((d) => ({
      id: `doacao-${d.id || d.token}`,
      origem: "entidade",
      notaComida: Number(d.avaliacaoEntidade.notaComida),
      comentarioComida: d.avaliacaoEntidade.comentarioComida,
      reclamacaoComida: !!d.avaliacaoEntidade.reclamacaoComida,
      data: d.avaliacaoEntidade.avaliadoEm || d.completedAt || d.createdAt,
    }));
  return [...dePedidos, ...deDoacoes].sort((a, b) => new Date(b.data || 0) - new Date(a.data || 0));
};

// Totais: quantidade, média (0 se não houver), reclamações e % do limite.
export const resumirAvaliacoes = (lista = []) => {
  const total = lista.length;
  const media = total ? lista.reduce((s, a) => s + a.notaComida, 0) / total : 0;
  const reclamacoes = lista.filter(ehReclamacao).length;
  const percentualLimite = Math.min(100, Math.round((reclamacoes / LIMITE_RECLAMACOES) * 100));
  return { total, media, reclamacoes, percentualLimite, excedido: reclamacoes > LIMITE_RECLAMACOES };
};
