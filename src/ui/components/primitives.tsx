/** Peças reaproveitadas pelas telas: campos, diálogo, etiquetas, vazios. */

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react';

import { formatAmount, parseMoney } from '../../domain/money.ts';
import type { SeriesColor } from '../../domain/types.ts';

export function colorVar(color: SeriesColor | undefined): string {
  return `var(--series-${color ?? 'blue'})`;
}

export function Card({
  title,
  action,
  children,
  tight,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  tight?: boolean;
}) {
  return (
    <section className="card">
      {title && (
        <header className="card-head">
          <h2>{title}</h2>
          {action}
        </header>
      )}
      <div className={tight ? 'card-body tight' : 'card-body'}>{children}</div>
    </section>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {error ? <span className="error">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

/**
 * Campo de dinheiro. Guarda o texto enquanto o usuário digita — travar o
 * valor formatado a cada tecla atrapalha quem escreve "12,5" da esquerda
 * para a direita — e só normaliza ao sair do campo.
 */
export function MoneyInput({
  id,
  value,
  onChange,
  autoFocus,
  invalid,
}: {
  id?: string;
  value: number | null;
  onChange: (cents: number | null) => void;
  autoFocus?: boolean;
  invalid?: boolean;
}) {
  const [text, setText] = useState(() => (value === null ? '' : formatAmount(value)));
  const editing = useRef(false);

  useEffect(() => {
    if (!editing.current) setText(value === null ? '' : formatAmount(value));
  }, [value]);

  return (
    <input
      id={id}
      className="input money"
      inputMode="decimal"
      autoFocus={autoFocus}
      aria-invalid={invalid || undefined}
      placeholder="0,00"
      value={text}
      onFocus={() => {
        editing.current = true;
      }}
      onChange={(event: ChangeEvent<HTMLInputElement>) => {
        setText(event.target.value);
        onChange(parseMoney(event.target.value));
      }}
      onBlur={() => {
        editing.current = false;
        const parsed = parseMoney(text);
        setText(parsed === null ? '' : formatAmount(parsed));
        onChange(parsed);
      }}
    />
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  tone,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  tone?: Partial<Record<T, string>>;
}) {
  return (
    <div className="segmented">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          data-tone={tone?.[option.value]}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Dialog({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Trava a rolagem do fundo enquanto o diálogo está aberto.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      className="overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={wide ? 'dialog wide' : 'dialog'} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} ref={ref}>
        <header className="dialog-head">
          <h2>{title}</h2>
          <button type="button" className="btn ghost icon" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </header>
        <div className="dialog-body">{children}</div>
        {footer && <footer className="dialog-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Apagar',
  onConfirm,
  onCancel,
}: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      title={title}
      onClose={onCancel}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className="btn danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="muted">{message}</p>
    </Dialog>
  );
}

export function EmptyState({
  emoji,
  title,
  children,
  action,
}: {
  emoji: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="emoji" aria-hidden="true">
        {emoji}
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Dot({ color }: { color: SeriesColor | undefined }) {
  return <span className="dot" style={{ background: colorVar(color) }} aria-hidden="true" />;
}
