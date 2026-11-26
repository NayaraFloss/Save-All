// =====================================================================
// controladores/dadosUsuario.js — PREFERÊNCIAS DO USUÁRIO
// =====================================================================

// Importa a função de consulta ao banco
import { consultar } from "../config/db.js";
// Importa o erro com código HTTP
import { ErroHttp } from "../utils/erros.js";

// Preferências e estado de tela de cada usuário (antes no localStorage).
// Lista das únicas chaves que podem ser salvas
const CHAVES = [
  // Modo escuro, cidade escolhida etc.
  "preferencias",
  // Mensagens lidas
  "mensagens",
  // Controle do sorteio de itens
  "rotacao_sorteio",
  // Dicas já mostradas
  "dicas",
  // Avaliações que o usuário pulou
  "avaliacoes_dispensadas",
// Fecha a lista
];
// Tamanho máximo do valor salvo: 200 mil caracteres (o "_" só separa os milhares para leitura)
const TAMANHO_MAXIMO = 200_000;

// GET /me/dados: devolve todas as preferências do usuário logado
export async function listar(req, res) {
  // Busca no banco
  const { rows } = await consultar(
    // SQL: pega chave e valor do usuário
    "SELECT chave, valor FROM dados_usuario WHERE usuario_id = $1",
    // $1 = id de quem está logado
    [req.usuario.id],
  // Fecha a consulta
  );
  // Transforma a lista de linhas num objeto { chave: valor } e responde
  res.json(Object.fromEntries(rows.map((r) => [r.chave, r.valor])));
// Fecha a função
}

// PUT /me/dados/:chave: salva uma preferência
export async function salvar(req, res) {
  // Pega a chave do endereço e garante que é texto
  const chave = String(req.params.chave || "");
  // Se a chave não estiver na lista permitida, erro 400
  if (!CHAVES.includes(chave)) throw new ErroHttp(400, "Chave inválida.");
  // Pega o valor enviado no corpo da requisição
  const valor = req.body?.valor;
  // Se não veio valor, erro 400
  if (valor === undefined) throw new ErroHttp(400, "Informe o valor.");
  // Transforma o valor em texto JSON
  const json = JSON.stringify(valor);
  // Se for grande demais
  if (json.length > TAMANHO_MAXIMO)
    // Erro 413 (muito grande)
    throw new ErroHttp(413, "Dados muito grandes.");

  // Grava no banco: insere ou, se já existir, atualiza
  const { rows } = await consultar(
    `INSERT INTO dados_usuario (usuario_id, chave, valor) VALUES ($1, $2, $3::jsonb) -- tenta inserir
     ON CONFLICT (usuario_id, chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now() -- se já existe, atualiza valor e data
     RETURNING valor`, // devolve o valor gravado
    // $1 = usuário, $2 = chave, $3 = valor em JSON
    [req.usuario.id, chave, json],
  // Fecha a consulta
  );
  // Responde com o valor salvo
  res.json({ valor: rows[0].valor });
// Fecha a função
}
