// "Rua X, 120 - Centro, Pinhalzinho/SC" -> "Pinhalzinho, SC" (mesmo formato de lojas.cidade).
// Devolve null se o endereço não terminar com "Cidade/UF" ou "Cidade - UF" ou "Cidade, UF".
export function cidadeDoEndereco(endereco) {
  const m = String(endereco || "")
    .trim()
    .match(/([A-Za-zÀ-ÿ'. ]+?)\s*[/,-]\s*([A-Za-z]{2})\s*$/);
  if (!m) return null;
  const cidade = m[1].trim();
  return cidade.length >= 2 ? `${cidade}, ${m[2].toUpperCase()}` : null;
}
