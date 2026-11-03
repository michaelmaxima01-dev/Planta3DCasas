/** Acabamentos de piso disponíveis (cor usada no desenho + nome usado nos relatórios). */
export const FLOOR_FINISHES = [
  { c: '#d9c4a3', n: 'Madeira clara' },
  { c: '#c8a77f', n: 'Madeira' },
  { c: '#9c7652', n: 'Madeira escura' },
  { c: '#cfd8dc', n: 'Porcelanato cinza' },
  { c: '#ece7df', n: 'Porcelanato bege' },
  { c: '#b9c4b0', n: 'Cerâmica verde' },
  { c: '#a7a9ac', n: 'Cimento queimado' },
  { c: '#f2f2f2', n: 'Branco' },
];

export const finishName = (color: string) =>
  FLOOR_FINISHES.find((f) => f.c.toLowerCase() === color.toLowerCase())?.n ?? 'Personalizado';

export const DEFAULT_META = {
  title: 'Projeto residencial',
  client: '',
  address: '',
  author: '',
  registry: '',
  notes: '',
};
