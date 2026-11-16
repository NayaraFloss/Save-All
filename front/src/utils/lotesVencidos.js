// Estoque por lote: separa as sacolas vencidas das que ainda podem ser vendidas.
// O servidor já manda "quantidadeVencida"/"quantidadeVendavel" e "vencido" em cada lote;
// aqui há um plano B (cálculo pela data) para dados que ainda não trazem esses campos.

const dois = (n) => String(n).padStart(2, "0");
const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
};
const dia = (data) => String(data || "").slice(0, 10);

export const loteVencido = (lote) =>
  typeof lote?.vencido === "boolean" ? lote.vencido : !!dia(lote?.dataValidade) && dia(lote.dataValidade) < hojeISO();

export const lotesVencidosDoItem = (food) => (Array.isArray(food?.lotes) ? food.lotes.filter(loteVencido) : []);

// { total, vencidas, vendaveis }
export const resumoEstoque = (food) => {
  const total = Number(food?.quantity) || 0;
  if (Array.isArray(food?.lotes) && food.lotes.length) {
    const vencidas = lotesVencidosDoItem(food).reduce((s, l) => s + (Number(l.quantity) || 0), 0);
    return { total, vencidas, vendaveis: Math.max(0, total - vencidas) };
  }
  if (Number(food?.quantidadeVencida) > 0) {
    const vencidas = Number(food.quantidadeVencida) || 0;
    return { total, vencidas, vendaveis: Math.max(0, total - vencidas) };
  }
  // Sem lotes: o item inteiro vale pela própria validade
  const vencido = !!dia(food?.dataValidade) && dia(food.dataValidade) < hojeISO();
  return { total, vencidas: vencido ? total : 0, vendaveis: vencido ? 0 : total };
};

// Item pronto para o assistente de doação/descarte: se houver sacolas vencidas, a doação leva só
// elas (quantidade e validade dos lotes vencidos) e marca "apenasVencidos" para que, ao concluir,
// só os lotes vencidos saiam do estoque.
export const prepararParaDestinar = (food) => {
  if (!food) return food;
  const { vencidas, vendaveis } = resumoEstoque(food);
  if (vencidas <= 0) return food;
  const vencidos = lotesVencidosDoItem(food);
  const validades = vencidos.map((l) => dia(l.dataValidade)).sort();
  return {
    ...food,
    quantity: vencidas,
    quantidadeTotalNoEstoque: Number(food.quantity) || vencidas,
    apenasVencidos: vendaveis > 0 || vencidos.length > 0,
    ...(validades.length ? { dataValidade: validades[validades.length - 1] } : {}),
  };
};
