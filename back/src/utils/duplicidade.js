// =====================================================================
// utils/duplicidade.js — IMPEDE NOMES E DOCUMENTOS REPETIDOS
// =====================================================================

// Importa a função de consulta ao banco
import { consultar } from "../config/db.js";
// Importa o erro com código HTTP
import { ErroHttp } from "./erros.js";

// Nomes e CPF/CNPJ não podem se repetir entre usuários (nem entre estabelecimentos).
// A comparação ignora maiúsculas, acentos e espaços extras: "Padaria  do Oda" = "padaria do odá".
// Letras com acento (na mesma ordem da lista de baixo)
const COM_ACENTO = "áàâãäéèêëíìîïóòôõöúùûüçñ";
// As mesmas letras sem acento, posição por posição
const SEM_ACENTO = "aaaaaeeeeiiiiooooouuuucn";
// Gera o trecho de SQL que "normaliza" um nome no banco: tira espaços, junta espaços repetidos, deixa minúsculo e tira acentos
export const SQL_NOME = (coluna) =>
  // Texto SQL montado com a coluna e as duas listas de letras
  `translate(lower(regexp_replace(trim(${coluna}), '\\s+', ' ', 'g')), '${COM_ACENTO}', '${SEM_ACENTO}')`;
// Gera o trecho de SQL que deixa só os números de um documento (COALESCE troca nulo por vazio)
export const SQL_DOCUMENTO = (coluna) =>
  // Texto SQL: remove tudo que não é dígito
  `regexp_replace(COALESCE(${coluna}, ''), '\\D', '', 'g')`;

// Faz a mesma normalização do nome, só que aqui no JavaScript
export const normalizarNome = (nome) => {
  // Transforma em texto
  let s = String(nome || "")
    // Tira espaços das pontas
    .trim()
    // Troca vários espaços seguidos por um só
    .replace(/\s+/g, " ")
    // Deixa minúsculo
    .toLowerCase();
  // Para cada letra acentuada (i = posição)
  for (let i = 0; i < COM_ACENTO.length; i++)
    // Troca todas as ocorrências pela versão sem acento
    s = s.split(COM_ACENTO[i]).join(SEM_ACENTO[i]);
  // Devolve o nome normalizado
  return s;
// Fecha a função
};
// Deixa só os números de um texto (ex.: "123.456.789-00" -> "12345678900")
export const somenteDigitos = (v) => String(v || "").replace(/\D/g, "");

// Procura conflitos. usuarioId = a própria conta (não conflita consigo mesma nem com a própria loja);
// lojaId = a própria loja (edição de estabelecimento pelo master).
export async function buscarDuplicidade(
  // Recebe nome, documento e os ids que devem ser ignorados (padrão: nenhum)
  { nome, cpfCnpj, usuarioId = null, lojaId = null },
  // Conexão opcional (para usar dentro de uma transação)
  db,
// Fecha os parâmetros
) {
  // Objeto que vai guardar as mensagens de conflito
  const conflitos = {};
  // Normaliza o nome (ou vazio se não veio)
  const n = nome ? normalizarNome(nome) : "";
  // Se há nome para checar
  if (n) {
    // Procura o mesmo nome em usuários e em lojas
    const { rows } = await consultar(
      `SELECT nome FROM usuarios WHERE ${SQL_NOME("nome")} = $1 AND id IS DISTINCT FROM $2 -- usuários com o mesmo nome (menos a própria conta)
       UNION ALL -- junta com o resultado de baixo
       SELECT nome FROM lojas WHERE ${SQL_NOME("nome")} = $1 AND usuario_id IS DISTINCT FROM $2 AND id IS DISTINCT FROM $3 -- lojas com o mesmo nome (menos a própria)
       LIMIT 1`, // basta achar um
      // $1 nome normalizado, $2 usuário ignorado, $3 loja ignorada
      [n, usuarioId, lojaId],
      // Conexão
      db,
    // Fecha a consulta
    );
    // Se encontrou alguém
    if (rows[0])
      // Guarda a mensagem de conflito de nome
      conflitos.nome = `Já existe uma conta ou estabelecimento com o nome "${rows[0].nome}". Escolha outro nome.`;
  // Fecha o if
  }
  // Pega só os números do documento
  const d = somenteDigitos(cpfCnpj);
  // Se há documento para checar
  if (d) {
    // Procura o mesmo documento em usuários e lojas
    const { rows } = await consultar(
      `SELECT 1 FROM usuarios WHERE ${SQL_DOCUMENTO("cpf_cnpj")} = $1 AND id IS DISTINCT FROM $2 -- usuários com o mesmo documento
       UNION ALL -- junta com o de baixo
       SELECT 1 FROM lojas WHERE ${SQL_DOCUMENTO("cnpj")} = $1 AND usuario_id IS DISTINCT FROM $2 AND id IS DISTINCT FROM $3 -- lojas com o mesmo CNPJ
       LIMIT 1`, // basta achar um
      // $1 documento, $2 usuário ignorado, $3 loja ignorada
      [d, usuarioId, lojaId],
      // Conexão
      db,
    // Fecha a consulta
    );
    // Se encontrou
    if (rows[0])
      // Mensagem: mais de 11 dígitos é CNPJ, senão CPF
      conflitos.cpfCnpj = `Já existe uma conta cadastrada com o ${d.length > 11 ? "CNPJ" : "CPF"} ${cpfCnpj}.`;
  // Fecha o if
  }
  // Devolve os conflitos encontrados (vazio se não houver)
  return conflitos;
// Fecha a função
}

// Lança erro 409 com a mensagem do primeiro conflito encontrado
export async function garantirSemDuplicidade(dados, db) {
  // Procura conflitos
  const conflitos = await buscarDuplicidade(dados, db);
  // Pega a mensagem do nome ou, se não houver, a do documento
  const mensagem = conflitos.nome || conflitos.cpfCnpj;
  // Se existe conflito: erro 409
  if (mensagem) throw new ErroHttp(409, mensagem);
// Fecha a função
}
