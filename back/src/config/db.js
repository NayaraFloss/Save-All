// =====================================================================
// config/db.js — CONEXÃO COM O BANCO DE DADOS (PostgreSQL)
// Cria um "pool" (grupo de conexões reaproveitáveis) e duas funções
// para facilitar consultas: "consultar" e "transacao".
// =====================================================================

// Importa a biblioteca "pg", que conversa com o PostgreSQL
import pg from "pg";
// Importa as configurações (precisamos do endereço do banco)
import { env } from "./env.js";

// DATE vem como texto "AAAA-MM-DD" e NUMERIC como número (não como string).
// Tipo 1082 (DATE): devolve a data como texto puro, sem converter para objeto Date (evita bagunça de fuso horário)
pg.types.setTypeParser(1082, (v) => v);
// Tipo 1700 (NUMERIC): converte o texto para número decimal (ex.: "12.50" vira 12.5)
pg.types.setTypeParser(1700, (v) => parseFloat(v));

// Bancos na nuvem (Neon, Render, Supabase) exigem conexão criptografada (SSL).
// No computador (localhost) o SSL fica desligado, como antes.
// Verifica se o endereço do banco aponta para o próprio computador
const local = /@(localhost|127\.0\.0\.1)[:/]/.test(env.databaseUrl);
// Verifica se o próprio endereço já diz como usar SSL ("sslmode=...")
const sslNaUrl = /sslmode=/.test(env.databaseUrl);
// Cria o pool de conexões e exporta para os outros arquivos
export const pool = new pg.Pool({
  // Endereço completo do banco
  connectionString: env.databaseUrl,
  // No máximo 10 conexões abertas ao mesmo tempo
  max: 10,
  // Se for local ou se a URL já define SSL, não acrescenta nada; senão liga SSL aceitando certificados da nuvem
  ...(local || sslNaUrl ? {} : { ssl: { rejectUnauthorized: false } }),
// Fecha a configuração do pool
});

// Sem este ouvinte, uma conexão ociosa derrubada pelo PostgreSQL (reinício do serviço,
// queda de rede, pgAdmin encerrando sessões) DERRUBA a API inteira. Com ele, só registra:
// o pool descarta a conexão ruim e abre outra na próxima consulta.
// Fica "ouvindo" erros do pool
pool.on("error", (erro) => {
  // Só escreve o problema no terminal, sem derrubar a API
  console.error(
    // Texto explicativo
    "[banco] conexão com o PostgreSQL perdida (a API continua no ar):",
    // Mensagem do erro
    erro.message,
  // Fecha o console.error
  );
// Fecha o ouvinte
});

// Função atalho para rodar um comando SQL: recebe o SQL, os parâmetros ($1, $2...) e, opcionalmente, outra conexão
export const consultar = (sql, params = [], cliente = pool) =>
  // Executa o SQL e devolve o resultado (com as linhas em "rows")
  cliente.query(sql, params);

// Executa várias consultas na mesma transação (COMMIT ou ROLLBACK automático).
// Transação = "tudo ou nada": ou todas as consultas dão certo, ou nenhuma vale
export async function transacao(fn) {
  // Pega uma conexão exclusiva do pool
  const cliente = await pool.connect();
  // Tenta executar
  try {
    // Avisa o banco que vai começar uma transação
    await cliente.query("BEGIN");
    // Roda a função recebida, passando a conexão para ela usar
    const resultado = await fn(cliente);
    // Deu tudo certo: confirma (grava de verdade)
    await cliente.query("COMMIT");
    // Devolve o que a função retornou
    return resultado;
  // Se algo falhou
  } catch (erro) {
    // Se a própria conexão caiu, o ROLLBACK também falha: não deixa esse erro esconder o original
    // Desfaz tudo o que foi feito na transação (ignora erro do próprio ROLLBACK)
    await cliente.query("ROLLBACK").catch(() => {});
    // Repassa o erro original para quem chamou
    throw erro;
  // "finally" roda sempre, com erro ou sem erro
  } finally {
    // Devolve a conexão ao pool para ser reaproveitada
    cliente.release();
  // Fecha o finally
  }
// Fecha a função transacao
}
