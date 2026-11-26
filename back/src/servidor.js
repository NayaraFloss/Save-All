// =====================================================================
// servidor.js — PONTO DE PARTIDA DA API
// É este arquivo que roda quando você digita "npm start".
// Ele liga o servidor numa porta, testa o banco e cuida do desligamento.
// =====================================================================

// Traz as configurações (porta, senha do banco etc.) lidas do arquivo .env
import { env } from "./config/env.js";
// Traz o "pool": um grupo de conexões prontas com o banco PostgreSQL
import { pool } from "./config/db.js";
// Traz o "app": o aplicativo Express já montado com todas as rotas
import { app } from "./app.js";

// Liga o servidor na porta definida (ex.: 3001) e guarda uma referência a ele em "servidor"
// A função "async () => {...}" roda uma vez, logo depois que o servidor começa a escutar
const servidor = app.listen(env.porta, async () => {
  // "try" = tenta fazer algo que pode dar erro
  try {
    // Faz uma consulta bem simples no banco só para ver se ele responde
    await pool.query("SELECT 1");
    // Se chegou aqui, o banco respondeu: mostra no terminal o endereço da API
    console.log(
      // Texto com o endereço; ${env.porta} é trocado pelo número da porta
      `API Save All em http://localhost:${env.porta}/v1  (banco conectado)`,
    // Fecha a chamada do console.log
    );
  // "catch" = se o "try" deu erro, cai aqui; "e" é o erro
  } catch (e) {
    // Mostra no terminal que não conseguiu falar com o banco e o motivo
    console.error("Não foi possível conectar ao PostgreSQL:", e.message);
    // Dá uma dica de onde procurar o problema
    console.error(
      // Texto da dica: conferir o .env e se o script do banco foi rodado
      "Confira DATABASE_URL no .env e se o script database/saveall_pgadmin.sql foi executado.",
    // Fecha a chamada do console.error
    );
  // Fecha o bloco catch
  }
// Fecha a função e o app.listen
});

// Erros que escapariam de todos os tratamentos: em vez de a API cair (e o app ficar
// "zerado" com ERR_CONNECTION_REFUSED), registra o erro completo no terminal e segue no ar.
// "unhandledRejection" = uma promessa (tarefa assíncrona) falhou e ninguém tratou o erro
process.on("unhandledRejection", (erro) => {
  // Mostra o erro completo (stack = lista de onde o erro passou); se não tiver, mostra o erro mesmo
  console.error("[erro não tratado] promessa rejeitada:", erro?.stack || erro);
// Fecha o ouvinte
});
// "uncaughtException" = um erro comum (não assíncrono) que ninguém tratou
process.on("uncaughtException", (erro) => {
  // Mostra o erro no terminal em vez de deixar o programa morrer
  console.error("[erro não tratado] exceção:", erro?.stack || erro);
// Fecha o ouvinte
});

// Cria a função "encerrar", que desliga tudo com calma (sem cortar requisições no meio)
const encerrar = () =>
  // Para de aceitar novas requisições; quando terminar, fecha as conexões do banco e sai com código 0 (sucesso)
  servidor.close(() => pool.end().then(() => process.exit(0)));
// SIGINT = quando você aperta Ctrl+C no terminal: chama "encerrar"
process.on("SIGINT", encerrar);
// SIGTERM = quando o sistema/hospedagem pede para o programa fechar: chama "encerrar"
process.on("SIGTERM", encerrar);
