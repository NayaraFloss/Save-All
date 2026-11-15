// Instância única do axios (configurada em src/boot/axios.js).
// O front sempre conversa com o back-end real definido em API_URL (.env).
import { api } from 'boot/axios'

export { api }
