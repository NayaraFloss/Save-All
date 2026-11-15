/**
 * Formats a raw input string as a valid CPF (XXX.XXX.XXX-XX).
 * Accepts up to 11 digits and automatically inserts dots and hyphen.
 */
export function formatCPF(value) {
  if (!value) return '';
  const digits = String(value).replace(/\D/g, '').slice(0, 11);
  
  if (digits.length <= 3) {
    return digits;
  }
  if (digits.length <= 6) {
    return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  }
  if (digits.length <= 9) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  }
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

/**
 * Formats a raw input string as a valid CNPJ (XX.XXX.XXX/XXXX-XX).
 * Accepts up to 14 digits and automatically inserts dots, slash, and hyphen.
 */
export function formatCNPJ(value) {
  if (!value) return '';
  const digits = String(value).replace(/\D/g, '').slice(0, 14);

  if (digits.length <= 2) {
    return digits;
  }
  if (digits.length <= 5) {
    return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  }
  if (digits.length <= 8) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  }
  if (digits.length <= 12) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  }
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

/**
 * Automatically formats as CPF if <= 11 digits, or CNPJ if > 11 digits.
 */
export function formatCpfCnpj(value) {
  if (!value) return '';
  const digits = String(value).replace(/\D/g, '');
  if (digits.length <= 11) {
    return formatCPF(digits);
  }
  return formatCNPJ(digits);
}

// CPF válido: 11 dígitos, não todos iguais e com os dois dígitos verificadores corretos
export function cpfValido(valor) {
  const d = String(valor || '').replace(/\D/g, '')
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const digito = (base) => {
    let soma = 0
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (base.length + 1 - i)
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
  }
  return digito(d.slice(0, 9)) === Number(d[9]) && digito(d.slice(0, 10)) === Number(d[10])
}
