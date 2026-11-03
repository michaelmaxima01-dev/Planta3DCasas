const nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** 3.5 → "3,50 m" */
export const fmtMeters = (v: number) => `${nf2.format(v)} m`;
/** 12.345 → "12,3 m²" */
export const fmtArea = (v: number) => `${nf1.format(v)} m²`;
export const fmtNumber = (v: number, digits = 2) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(v);
export const parseNumber = (s: string) => parseFloat(s.replace(/\s/g, '').replace(',', '.'));
