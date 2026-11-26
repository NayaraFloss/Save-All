// "Rua X, 120 - Centro, Pinhalzinho/SC" -> "Pinhalzinho, SC" (mesmo formato de lojas.cidade).
// Devolve null se o endereço não terminar com "Cidade/UF" ou "Cidade - UF" ou "Cidade, UF".
export function cidadeDoEndereco(endereco) {
  // Transforma em texto (vazio se não houver)
  const m = String(endereco || "")
    // Tira espaços das pontas
    .trim()
    // Procura no FINAL: um nome de cidade, depois "/", "," ou "-", depois 2 letras (a UF)
    .match(/([A-Za-zÀ-ÿ'. ]+?)\s*[/,-]\s*([A-Za-z]{2})\s*$/);
  // Se não achou esse padrão, devolve null
  if (!m) return null;
  // m[1] é a cidade encontrada; tira espaços
  const cidade = m[1].trim();
  // Se a cidade tem pelo menos 2 letras, devolve "Cidade, UF" (UF em maiúsculas); senão null
  return cidade.length >= 2 ? `${cidade}, ${m[2].toUpperCase()}` : null;
// Fecha a função
}
