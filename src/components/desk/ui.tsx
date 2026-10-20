import type { Answers } from "@/lib/desk/types";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Field({
  name,
  label,
  value,
  onChange,
  placeholder,
  className = "",
  inputMode = "text",
  readOnly = false,
  multiline = false,
  hint,
  required = false,
}: {
  name: string;
  label: string;
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputMode?: "text" | "decimal" | "email" | "tel";
  readOnly?: boolean;
  multiline?: boolean;
  hint?: string;
  required?: boolean;
}) {
  const id = `f-${name}`;
  const empty = required && !value.trim();
  const shared = `mt-1 w-full rounded-md border bg-card px-3 text-sm text-ink placeholder:text-muted focus-visible:border-red focus-visible:outline-none ${
    empty ? "border-red bg-red-soft" : "border-line"
  }`;
  return (
    <label htmlFor={id} className={`block ${className}`}>
      <span className="text-sm text-ink-soft">
        {label}
        {required ? <span className="ml-1.5 font-semibold text-red">Required</span> : null}
      </span>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          readOnly={readOnly}
          rows={4}
          placeholder={placeholder}
          onChange={(event) => onChange?.(event.target.value)}
          className={`${shared} py-2`}
        />
      ) : (
        <input
          id={id}
          value={value}
          readOnly={readOnly}
          inputMode={inputMode}
          placeholder={placeholder}
          autoComplete={name === "address" ? "street-address" : "off"}
          onChange={(event) => onChange?.(event.target.value)}
          className={`${shared} h-11 ${readOnly ? "bg-paper text-ink" : ""}`}
        />
      )}
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

function toIsoDate(value: string): string {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return "";
  const month = match[1].padStart(2, "0");
  const day = match[2].padStart(2, "0");
  return `${match[3]}-${month}-${day}`;
}

function fromIsoDate(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  return `${match[2]}/${match[3]}/${match[1]}`;
}

export function DateField({
  name,
  label,
  value,
  onChange,
  className = "",
}: {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const id = `f-${name}`;
  return (
    <div className={className}>
      <label htmlFor={id} className="text-sm text-ink-soft">
        {label}
      </label>
      <div className="mt-1 flex gap-2">
        <input
          id={id}
          value={value}
          placeholder="MM/DD/YYYY"
          inputMode="numeric"
          autoComplete="off"
          onChange={(event) => onChange(event.target.value)}
          className="h-11 min-w-0 flex-1 rounded-md border border-line bg-card px-3 text-sm text-ink placeholder:text-muted focus-visible:border-red focus-visible:outline-none"
        />
        <input
          type="date"
          aria-label={`Calendar for ${label}`}
          value={toIsoDate(value)}
          onChange={(event) => onChange(fromIsoDate(event.target.value))}
          className="h-11 w-11 shrink-0 cursor-pointer rounded-md border border-line bg-card px-1 text-ink"
        />
      </div>
    </div>
  );
}

export function Choice({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <fieldset>
      <legend className="text-sm text-ink-soft">{label}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(selected ? "" : option.value)}
              className={`h-11 rounded-md border px-3 text-sm font-medium ${
                selected
                  ? "border-red bg-red-soft text-red-deep"
                  : "border-line bg-card text-ink hover:border-line-strong"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function Checks({
  items,
  answers,
  onChange,
}: {
  items: { key: string; label: string }[];
  answers: Answers;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {items.map((item) => {
        const on = answers[item.key] === "1";
        return (
          <li key={item.key}>
            <label
              className={`flex min-h-11 items-start gap-3 rounded-md border px-3 py-2.5 text-sm ${
                on ? "border-red bg-red-soft" : "border-line bg-card"
              }`}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={(event) => onChange(item.key, event.target.checked ? "1" : "")}
                className="mt-0.5 size-4 accent-red"
              />
              <span>{item.label}</span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

export function Card({
  title,
  eyebrow,
  children,
  action,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-card p-4 sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          {eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-widest text-red">{eyebrow}</p>
          ) : null}
          <h2 className="font-serif text-2xl text-ink">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function PrimaryButton({
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-md bg-red px-4 text-sm font-semibold text-card hover:bg-red-deep disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

export function SecondaryButton({
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-md border border-line-strong bg-card px-4 text-sm font-semibold text-ink hover:border-ink disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

export function read(answers: Answers, key: string): string {
  return answers[key] ?? "";
}
