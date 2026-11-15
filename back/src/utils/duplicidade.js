import { consultar } from "../config/db.js";
import { ErroHttp } from "./erros.js";

// Nomes e CPF/CNPJ não podem se repetir entre usuários (nem entre estabelecimentos).
// A comparação ignora maiúsculas, acentos e espaços extras: "Padaria  do Oda" = "padaria do odá".
const COM_ACENTO = "áàâãäéèêëíìîïóòôõöúùûüçñ";
const SEM_ACENTO = "aaaaaeeeeiiiiooooouuuucn";
export const SQL_NOME = (coluna) =>
  `translate(lower(regexp_replace(trim(${coluna}), '\\s+', ' ', 'g')), '${COM_ACENTO}', '${SEM_ACENTO}')`;
export const SQL_DOCUMENTO = (coluna) =>
  `regexp_replace(COALESCE(${coluna}, ''), '\\D', '', 'g')`;

export const normalizarNome = (nome) => {
  let s = String(nome || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
  for (let i = 0; i < COM_ACENTO.length; i++)
    s = s.split(COM_ACENTO[i]).join(SEM_ACENTO[i]);
  return s;
};
export const somenteDigitos = (v) => String(v || "").replace(/\D/g, "");

// Procura conflitos. usuarioId = a própria conta (não conflita consigo mesma nem com a própria loja);
// lojaId = a própria loja (edição de estabelecimento pelo master).
export async function buscarDuplicidade(
  { nome, cpfCnpj, usuarioId = null, lojaId = null },
  db,
) {
  const conflitos = {};
  const n = nome ? normalizarNome(nome) : "";
  if (n) {
    const { rows } = await consultar(
      `SELECT nome FROM usuarios WHERE ${SQL_NOME("nome")} = $1 AND id IS DISTINCT FROM $2
       UNION ALL
       SELECT nome FROM lojas WHERE ${SQL_NOME("nome")} = $1 AND usuario_id IS DISTINCT FROM $2 AND id IS DISTINCT FROM $3
       LIMIT 1`,
      [n, usuarioId, lojaId],
      db,
    );
    if (rows[0])
      conflitos.nome = `Já existe uma conta ou estabelecimento com o nome "${rows[0].nome}". Escolha outro nome.`;
  }
  const d = somenteDigitos(cpfCnpj);
  if (d) {
    const { rows } = await consultar(
      `SELECT 1 FROM usuarios WHERE ${SQL_DOCUMENTO("cpf_cnpj")} = $1 AND id IS DISTINCT FROM $2
       UNION ALL
       SELECT 1 FROM lojas WHERE ${SQL_DOCUMENTO("cnpj")} = $1 AND usuario_id IS DISTINCT FROM $2 AND id IS DISTINCT FROM $3
       LIMIT 1`,
      [d, usuarioId, lojaId],
      db,
    );
    if (rows[0])
      conflitos.cpfCnpj = `Já existe uma conta cadastrada com o ${d.length > 11 ? "CNPJ" : "CPF"} ${cpfCnpj}.`;
  }
  return conflitos;
}

// Lança erro 409 com a mensagem do primeiro conflito encontrado
export async function garantirSemDuplicidade(dados, db) {
  const conflitos = await buscarDuplicidade(dados, db);
  const mensagem = conflitos.nome || conflitos.cpfCnpj;
  if (mensagem) throw new ErroHttp(409, mensagem);
}
