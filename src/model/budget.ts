/**
 * Orçamento estimado: preços unitários de materiais (perfil de preços), mão de obra por etapa,
 * outros custos, imprevistos e BDI. Os perfis ficam salvos no navegador do usuário.
 * Valores de referência aproximados (nov/2026) — o usuário ajusta à sua região/fornecedor.
 */
import type { Quantities, QtyRow, StageKey } from '../structure/quantities';

export type LaborMode = 'pct' | 'm2' | 'fixo';

export interface BudgetProfile {
  id: string;
  name: string;
  /** Preço unitário por item (chave normalizada do nome). */
  prices: Record<string, number>;
  labor: Partial<Record<StageKey, { mode: LaborMode; value: number }>>;
  extras: { name: string; value: number }[];
  /** Imprevistos e BDI (% sobre o subtotal). */
  contingency: number;
  bdi: number;
  updatedAt?: string;
}

/** Chave do item: ignora a classe do concreto (C20…C40) para o mesmo preço valer sempre. */
export const itemKey = (item: string) => item.replace(/\bC\d{2}\b/g, 'Cxx').trim();

export const DEFAULT_PRICES: Record<string, number> = {
  'Concreto Cxx': 0,
  'Concreto magro': 0,
  'Cimento Portland (sacos de 50 kg)': 39,
  'Areia média lavada': 160,
  'Brita 1': 150,
  'Cal hidratada (sacos de 20 kg)': 24,
  'Água (amassamento)': 0.02,
  'Aço CA-50/60': 9.5,
  'Fôrmas (chapa compensada)': 48,
  Escavação: 65,
  'Vigotas treliçadas (intereixo 42 cm)': 16,
  'Lajotas cerâmicas / EPS': 3.2,
  'Tela soldada Q-92 (capa)': 24,
  'Escoramento de lajes': 18,
  'Blocos cerâmicos 14×19×29': 2.6,
  'Placas de gesso 60×60 cm': 7,
  'Arame galvanizado nº 18 e tirantes': 25,
  'Sisal e gesso cola (sacos 20 kg)': 28,
  'Chapas de gesso acartonado 1,20×2,40': 55,
  'Perfis F530 e canaletas': 9,
  'Massa e fita para juntas': 8,
  'Réguas de PVC 20 cm': 38,
  'Metalon / sarrafos para estrutura do forro': 12,
  'Perfil de acabamento (roda-forro PVC)': 9,
  'Lambri de madeira 10 cm': 85,
  'Sarrafos 2,5×5 cm (estrutura)': 6,
  'Verniz (galões 3,6 L)': 120,
  'Placas de fibra mineral': 18,
  'Perfis T clicados': 10,
  'Massa corrida e pintura de teto': 25,
  'Madeira serrada (total do madeiramento)': 3200,
  'Telhas: Cerâmica portuguesa': 2.4,
  'Telhas: Cerâmica romana': 2.4,
  'Telhas: Cerâmica colonial (capa e canal)': 1.6,
  'Telhas: Cerâmica francesa': 2.6,
  'Telhas: Telha de concreto': 3.5,
  'Telhas: Fibrocimento ondulada 6 mm': 75,
  'Telhas: Metálica trapezoidal': 70,
  'Telhas: Termoacústica (sanduíche)': 160,
  'Shingle (fardos de 3,1 m²)': 380,
  'Chapas OSB 11 mm (1,22 × 2,44)': 95,
  'Manta de subcobertura (rolos 30 m²)': 420,
  'Cumeeiras e espigões (peças)': 7,
  'Cumeeiras (peças)': 45,
  'Calhas (beiral)': 65,
  'Calha central (água furtada)': 85,
  'Calha de platibanda + rufos': 85,
  'Blocos de concreto 14×19×39 (muros)': 4.3,
  'Tijolos maciços aparentes': 1.4,
  'Pintura acrílica externa (2 faces)': 0,
  'Tinta acrílica (latas de 18 L, 2 demãos)': 420,
  'Gradil metálico (com pintura)': 380,
  'Vidro temperado 10 mm': 480,
  'Tela de alambrado (fio 12)': 45,
  'Placas pré-moldadas de concreto': 95,
  'Pedra rachão': 140,
  'Mourões / postes': 65,
  'Cerca de madeira/bambu (painéis)': 120,
  'Arame liso/farpado': 1.2,
  'Mudas para cerca viva': 15,
  Portões: 2800,
};

export const STAGE_NAMES: Record<StageKey, string> = {
  fundacao: 'Fundação',
  estrutura: 'Estrutura',
  alvenaria: 'Alvenaria e revestimentos',
  telhado: 'Telhado',
  muros: 'Muros e cercas',
};

export function defaultProfile(): BudgetProfile {
  return {
    id: 'padrao',
    name: 'Referência (valores médios)',
    prices: { ...DEFAULT_PRICES },
    labor: {
      fundacao: { mode: 'pct', value: 70 },
      estrutura: { mode: 'pct', value: 80 },
      alvenaria: { mode: 'pct', value: 90 },
      telhado: { mode: 'pct', value: 60 },
      muros: { mode: 'pct', value: 70 },
    },
    extras: [],
    contingency: 5,
    bdi: 0,
  };
}

export interface BudgetLine {
  key: string;
  item: string;
  unit: string;
  qty: number;
  price: number;
  total: number;
  /** Item sem preço no perfil nem na referência. */
  missing?: boolean;
}
export interface BudgetStage {
  key: StageKey;
  name: string;
  lines: BudgetLine[];
  materials: number;
  labor: number;
  laborText: string;
  total: number;
}
export interface Budget {
  stages: BudgetStage[];
  extras: { name: string; value: number }[];
  subtotal: number;
  contingency: number;
  bdi: number;
  total: number;
  area: number;
  perM2: number;
  /** Itens sem preço informado. */
  missing: string[];
}

const brl0 = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Calcula o orçamento com as quantidades de cada etapa e o perfil de preços. */
export function buildBudget(q: Quantities, p: BudgetProfile, builtArea: number): Budget {
  const missing = new Set<string>();
  const stages: BudgetStage[] = q.stages.map((st) => {
    const lines: BudgetLine[] = st.summary
      .filter((r: QtyRow) => !Number.isNaN(r.qty) && r.qty > 0)
      .map((r) => {
        const key = itemKey(r.item);
        const price = p.prices[key] ?? DEFAULT_PRICES[key] ?? 0;
        const miss = !(key in p.prices) && !(key in DEFAULT_PRICES);
        if (miss) missing.add(key);
        return { key, item: r.item, unit: r.unit, qty: r.qty, price, total: r.qty * price, missing: miss && price === 0 };
      });
    const materials = lines.reduce((s, l) => s + l.total, 0);
    const lb = p.labor[st.key] ?? { mode: 'pct' as LaborMode, value: 0 };
    const labor = lb.mode === 'pct' ? (materials * lb.value) / 100 : lb.mode === 'm2' ? lb.value * builtArea : lb.value;
    const laborText = lb.mode === 'pct' ? `${lb.value}% dos materiais` : lb.mode === 'm2' ? `${brl0(lb.value)}/m² × ${builtArea.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} m²` : 'valor fechado';
    return { key: st.key, name: STAGE_NAMES[st.key] ?? st.name, lines, materials, labor, laborText, total: materials + labor };
  });
  const extras = p.extras.filter((e) => e.name.trim() && e.value);
  const subtotal = stages.reduce((s, x) => s + x.total, 0) + extras.reduce((s, e) => s + e.value, 0);
  const contingency = (subtotal * p.contingency) / 100;
  const bdi = ((subtotal + contingency) * p.bdi) / 100;
  const total = subtotal + contingency + bdi;
  return { stages, extras, subtotal, contingency, bdi, total, area: builtArea, perM2: builtArea > 0 ? total / builtArea : 0, missing: [...missing] };
}

export const brl = brl0;

/** Planilha CSV (separador ;, padrão do Excel em português). */
export function budgetCsv(b: Budget, profileName: string, title: string): string {
  const n = (v: number, d = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: false });
  const rows: string[][] = [[`Orçamento estimado - ${title}`], [`Perfil de preços: ${profileName}`], [`Área construída: ${n(b.area, 1)} m²`], [], ['Etapa', 'Item', 'Quantidade', 'Unidade', 'Valor unitário (R$)', 'Total (R$)']];
  for (const st of b.stages) {
    for (const l of st.lines) rows.push([st.name, l.item, n(l.qty), l.unit, n(l.price), n(l.total)]);
    rows.push([st.name, `Mão de obra (${st.laborText})`, '', '', '', n(st.labor)]);
    rows.push([st.name, 'TOTAL DA ETAPA', '', '', '', n(st.total)]);
  }
  for (const e of b.extras) rows.push(['Outros', e.name, '', '', '', n(e.value)]);
  rows.push([], ['', 'Subtotal', '', '', '', n(b.subtotal)], ['', 'Imprevistos', '', '', '', n(b.contingency)], ['', 'BDI', '', '', '', n(b.bdi)], ['', 'TOTAL GERAL', '', '', '', n(b.total)], ['', 'Custo por m²', '', '', '', n(b.perM2)]);
  return '﻿' + rows.map((r) => r.map((c) => (/[;"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(';')).join('\r\n');
}

// ---------- perfis salvos (por usuário, no navegador) ----------
const key = (user: string) => `planta3d:orcamentos:${user || 'local'}`;

export function loadProfiles(user: string): BudgetProfile[] {
  try {
    const raw = localStorage.getItem(key(user));
    const list = raw ? (JSON.parse(raw) as BudgetProfile[]) : [];
    return [defaultProfile(), ...list.filter((p) => p.id !== 'padrao')];
  } catch {
    return [defaultProfile()];
  }
}

export function saveProfiles(user: string, list: BudgetProfile[]) {
  try {
    localStorage.setItem(key(user), JSON.stringify(list.filter((p) => p.id !== 'padrao')));
  } catch {
    /* armazenamento indisponível */
  }
}
