import { useEffect, useState } from 'react';
import { fmtNumber, parseNumber } from './format';

/** Campo numérico que só aplica o valor ao sair do campo ou apertar Enter (um passo no desfazer). */
export function NumberField({
  label,
  value,
  onCommit,
  suffix = 'm',
  min = -Infinity,
  max = Infinity,
  digits = 2,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  suffix?: string;
  min?: number;
  max?: number;
  digits?: number;
}) {
  const [text, setText] = useState(fmtNumber(value, digits));
  useEffect(() => setText(fmtNumber(value, digits)), [value, digits]);
  const commit = () => {
    const v = parseNumber(text);
    if (Number.isFinite(v)) {
      const c = Math.min(max, Math.max(min, v));
      if (Math.abs(c - value) > 1e-9) onCommit(c);
      setText(fmtNumber(c, digits));
    } else setText(fmtNumber(value, digits));
  };
  return (
    <label className="field">
      <span>{label}</span>
      <input
        value={text}
        inputMode="decimal"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setText(fmtNumber(value, digits));
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      <em>{suffix}</em>
    </label>
  );
}

export function TextField({ label, value, onCommit }: { label: string; value: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <label className="field">
      <span>{label}</span>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text.trim() && text !== value && onCommit(text.trim())}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </label>
  );
}
