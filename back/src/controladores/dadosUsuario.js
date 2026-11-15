import { consultar } from "../config/db.js";
import { ErroHttp } from "../utils/erros.js";

// Preferências e estado de tela de cada usuário (antes no localStorage).
const CHAVES = [
  "preferencias",
  "mensagens",
  "rotacao_sorteio",
  "dicas",
  "avaliacoes_dispensadas",
];
const TAMANHO_MAXIMO = 200_000;

export async function listar(req, res) {
  const { rows } = await consultar(
    "SELECT chave, valor FROM dados_usuario WHERE usuario_id = $1",
    [req.usuario.id],
  );
  res.json(Object.fromEntries(rows.map((r) => [r.chave, r.valor])));
}

export async function salvar(req, res) {
  const chave = String(req.params.chave || "");
  if (!CHAVES.includes(chave)) throw new ErroHttp(400, "Chave inválida.");
  const valor = req.body?.valor;
  if (valor === undefined) throw new ErroHttp(400, "Informe o valor.");
  const json = JSON.stringify(valor);
  if (json.length > TAMANHO_MAXIMO)
    throw new ErroHttp(413, "Dados muito grandes.");

  const { rows } = await consultar(
    `INSERT INTO dados_usuario (usuario_id, chave, valor) VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (usuario_id, chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now()
     RETURNING valor`,
    [req.usuario.id, chave, json],
  );
  res.json({ valor: rows[0].valor });
}
