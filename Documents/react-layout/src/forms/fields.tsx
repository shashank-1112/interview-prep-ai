import type { ReactNode } from 'react';
import type { FieldPath, FieldValues, UseFormReturn } from 'react-hook-form';
import { Field, Input, Select } from '../components/ui';

interface BaseProps<T extends FieldValues> {
  form: UseFormReturn<T>;
  name: FieldPath<T>;
  label: string;
  hint?: ReactNode;
  className?: string;
  disabled?: boolean;
}

function errorOf<T extends FieldValues>(form: UseFormReturn<T>, name: FieldPath<T>): string | undefined {
  const parts = name.split('.');
  let cur: unknown = form.formState.errors;
  for (const p of parts) cur = (cur as Record<string, unknown> | undefined)?.[p];
  return (cur as { message?: string } | undefined)?.message;
}

export function TextField<T extends FieldValues>({ form, name, label, hint, className, disabled, placeholder, autoFocus }: BaseProps<T> & { placeholder?: string; autoFocus?: boolean }) {
  const error = errorOf(form, name);
  return (
    <Field label={label} error={error} hint={hint} className={className}>
      {(id, describedBy) => (
        <Input
          id={id}
          aria-describedby={describedBy}
          invalid={!!error}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          data-autofocus={autoFocus || undefined}
          {...form.register(name)}
        />
      )}
    </Field>
  );
}

export function NumberField<T extends FieldValues>({
  form,
  name,
  label,
  hint,
  className,
  disabled,
  step = 'any',
  min,
  onValueChange,
}: BaseProps<T> & { step?: number | 'any'; min?: number; onValueChange?: () => void }) {
  const error = errorOf(form, name);
  const reg = form.register(name, { valueAsNumber: true });
  return (
    <Field label={label} error={error} hint={hint} className={className}>
      {(id, describedBy) => (
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          aria-describedby={describedBy}
          invalid={!!error}
          disabled={disabled}
          {...reg}
          onChange={(e) => {
            void reg.onChange(e);
            onValueChange?.();
          }}
        />
      )}
    </Field>
  );
}

export function SelectField<T extends FieldValues>({
  form,
  name,
  label,
  hint,
  className,
  disabled,
  options,
  asNumber,
  onValueChange,
}: BaseProps<T> & {
  options: ReadonlyArray<{ value: string | number; label: string }>;
  asNumber?: boolean;
  onValueChange?: (value: string) => void;
}) {
  const error = errorOf(form, name);
  const reg = form.register(name, asNumber ? { valueAsNumber: true } : {});
  return (
    <Field label={label} error={error} hint={hint} className={className}>
      {(id, describedBy) => (
        <Select
          id={id}
          aria-describedby={describedBy}
          invalid={!!error}
          disabled={disabled}
          {...reg}
          onChange={(e) => {
            void reg.onChange(e);
            onValueChange?.(e.target.value);
          }}
        >
          {options.map((o) => (
            <option key={String(o.value)} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

export function FormError({ message }: { message?: string | undefined }) {
  if (!message) return null;
  return (
    <div role="alert" className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="col-span-full mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</h3>;
}
