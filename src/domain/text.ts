/**
 * Comparação de nomes escritos por gente: "Alimentação", "alimentacao" e
 * " Alimentação " são a mesma categoria. Serve tanto para casar a planilha
 * importada com o que já existe quanto para achar cadastros repetidos.
 */
export function chaveDeNome(valor: string): string {
  return valor
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
