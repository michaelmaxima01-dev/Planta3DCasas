import { type Budget, brl } from '../model/budget';
import type { Doc } from './pdf';

const n2 = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

/** Folhas do orçamento estimado: uma tabela por etapa e o resumo geral. */
export function appendBudgetSheets(doc: Doc, b: Budget, profileName: string) {
  doc.newSheet('Orçamento estimado - resumo');
  let a = doc.area;
  let y = doc.heading('Orçamento estimado da obra', a.x, a.y + 2, 5);
  doc.text(`Perfil de preços: ${profileName}  •  Área construída: ${n2(b.area)} m²  •  Data: ${new Date().toLocaleDateString('pt-BR')}`, a.x, y, 2.4, { color: '#495057' });
  y += 6;
  const w = a.w * 0.55;
  const rows: string[][] = b.stages.map((s) => [s.name, brl(s.materials), brl(s.labor), brl(s.total), b.total > 0 ? `${((s.total / b.total) * 100).toFixed(1)}%` : '-']);
  for (const e of b.extras) rows.push([e.name, '-', '-', brl(e.value), b.total > 0 ? `${((e.value / b.total) * 100).toFixed(1)}%` : '-']);
  y = doc.table(a.x, y, [w * 0.34, w * 0.18, w * 0.18, w * 0.18, w * 0.12], ['Etapa', 'Materiais', 'Mão de obra', 'Total', '%'], rows, { align: ['left', 'right', 'right', 'right', 'right'], rowH: 7, foot: ['Subtotal', '', '', brl(b.subtotal), ''] });
  y += 6;
  const tot: string[][] = [
    ['Subtotal', brl(b.subtotal)],
    ['Imprevistos', brl(b.contingency)],
    ['BDI / encargos', brl(b.bdi)],
  ];
  y = doc.table(a.x, y, [w * 0.6, w * 0.4], ['Composição', 'Valor'], tot, { align: ['left', 'right'], rowH: 7, foot: ['TOTAL GERAL', brl(b.total)] });
  // destaque do total e custo por m²
  const bx = a.x + w + 14;
  const bw = a.w - w - 14;
  const p = doc.pdf;
  p.setFillColor('#eaf1ff');
  p.setDrawColor('#2f6fed');
  p.setLineWidth(0.4);
  p.roundedRect(bx, a.y + 14, bw, 46, 3, 3, 'FD');
  doc.text('TOTAL ESTIMADO', bx + bw / 2, a.y + 24, 3, { bold: true, align: 'center', color: '#1849b0' });
  doc.text(brl(b.total), bx + bw / 2, a.y + 38, 8, { bold: true, align: 'center', color: '#1849b0' });
  doc.text(`${brl(b.perM2)} por m² construído`, bx + bw / 2, a.y + 50, 3, { align: 'center', color: '#1849b0' });
  // barras por etapa
  let by = a.y + 72;
  doc.text('Distribuição por etapa', bx, by, 3, { bold: true });
  by += 5;
  const colors = ['#2f6fed', '#12b886', '#f08c00', '#e03131', '#7048e8', '#495057'];
  b.stages.forEach((s, i) => {
    const frac = b.subtotal > 0 ? s.total / b.subtotal : 0;
    doc.text(s.name, bx, by + 3, 2.2);
    p.setFillColor('#eef1f5');
    p.rect(bx + bw * 0.42, by, bw * 0.45, 4, 'F');
    p.setFillColor(colors[i % colors.length]);
    p.rect(bx + bw * 0.42, by, bw * 0.45 * frac, 4, 'F');
    doc.text(`${(frac * 100).toFixed(0)}%`, bx + bw, by + 3, 2.2, { align: 'right' });
    by += 7;
  });
  const notes = [
    'Estimativa preliminar: quantidades calculadas pelo projeto e preços do perfil escolhido.',
    'Não inclui instalações elétricas e hidráulicas, esquadrias, revestimentos cerâmicos, louças e metais, salvo se lançados em "outros custos".',
    'Confirme preços com fornecedores locais e a composição de mão de obra com o empreiteiro.',
  ];
  if (b.missing.length) notes.push(`Itens sem preço no perfil (valor zero): ${b.missing.slice(0, 8).join(', ')}${b.missing.length > 8 ? '…' : ''}.`);
  notes.forEach((t, k) => doc.text(`• ${t}`, a.x, Math.max(y + 8, by + 6) + k * 5, 2.1, { color: '#495057', maxWidth: a.w }));

  for (const st of b.stages) {
    if (!st.lines.length && !st.labor) continue;
    doc.newSheet(`Orçamento - ${st.name}`);
    a = doc.area;
    y = doc.heading(`Orçamento - ${st.name}`, a.x, a.y + 2);
    const W = a.w;
    const more = () => {
      doc.newSheet(`Orçamento - ${st.name} (cont.)`);
      return doc.area.y;
    };
    doc.table(
      a.x,
      y,
      [W * 0.46, W * 0.12, W * 0.08, W * 0.16, W * 0.18],
      ['Item', 'Quantidade', 'Un', 'Valor unitário', 'Total'],
      [...st.lines.map((l) => [l.item, n2(l.qty), l.unit, brl(l.price), brl(l.total)]), ['Mão de obra (' + st.laborText + ')', '', '', '', brl(st.labor)]],
      { align: ['left', 'right', 'center', 'right', 'right'], rowH: 6.2, foot: [`Total da etapa`, '', '', '', brl(st.total)], onPage: more },
    );
  }
}
