// Criptografa, no banco, certificados digitais que ainda estejam em texto puro
// (cadastrados antes da criptografia ser ativada). Pode rodar mais de uma vez.
// Uso: npm run banco:criptografar

// Importa o pool de conexões com o banco
import { pool } from '../src/config/db.js'
// Importa a lista de campos sensíveis, o verificador "já está criptografado?" e o protetor
import { CAMPOS_SENSIVEIS, estaCriptografado, protegerExtras } from '../src/utils/criptografia.js'

// Tenta executar
try {
  // Busca o id e os extras de todos os usuários
  const { rows } = await pool.query('SELECT id, extras FROM usuarios')
  // Contador de usuários alterados
  let alterados = 0
  // Passa por cada usuário
  for (const u of rows) {
    // Verifica se algum campo sensível é texto não vazio e ainda NÃO está criptografado
    const pendente = CAMPOS_SENSIVEIS.some((c) => typeof u.extras?.[c] === 'string' && u.extras[c] !== '' && !estaCriptografado(u.extras[c]))
    // Se não há nada pendente, pula para o próximo usuário
    if (!pendente) continue
    // Grava os extras já protegidos (criptografados) no banco
    await pool.query('UPDATE usuarios SET extras = $1::jsonb WHERE id = $2', [JSON.stringify(protegerExtras(u.extras)), u.id])
    // Soma 1 no contador
    alterados++
  // Fecha o for
  }
  // Mostra quantos foram atualizados
  console.log(`OK: ${alterados} usuário(s) atualizado(s).`)
// Se deu erro
} catch (e) {
  // Mostra o motivo
  console.error('Falha:', e.message)
  // Marca falha
  process.exitCode = 1
// Sempre, no final
} finally {
  // Fecha as conexões
  await pool.end()
// Fecha o finally
}
