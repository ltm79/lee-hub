import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { twMerge } from "tailwind-merge";

const fieldClass =
  "mt-1.5 h-10 w-full rounded-sm border border-line bg-surface px-3 text-base font-normal text-ink outline-none transition duration-150 ease-smooth-out placeholder:text-faint focus:border-crimson";

const variants = {
  primary: "bg-crimson text-on-crimson shadow-[0_1px_0_rgb(151_1_45/0.35)] hover:bg-deep",
  secondary: "border border-line bg-surface text-ink hover:border-teal hover:bg-mist",
  ghost: "text-ink hover:bg-blush",
  danger: "border border-line bg-surface text-deep hover:bg-blush",
} as const;

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants }) {
  return (
    <button
      type={type}
      {...props}
      className={twMerge(
        "inline-flex h-10 items-center justify-center gap-1.5 rounded-sm px-3 text-sm font-medium transition duration-150 ease-smooth-out motion-safe:active:not-disabled:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        className,
      )}
    />
  );
}

export function TextField({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block text-sm font-medium text-ink">
      {label}
      <input {...props} className={twMerge(fieldClass, props.className)} />
    </label>
  );
}

export function TextArea({
  label,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <label className="block text-sm font-medium text-ink">
      {label}
      <textarea {...props} className={twMerge(fieldClass, "h-24 py-2", props.className)} />
    </label>
  );
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-screen overflow-y-auto rounded-t-lg bg-surface p-4 shadow-card outline-none sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg font-semibold text-ink">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1 text-sm text-muted">
                  {description}
                </Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
            <Dialog.Close className="grid size-11 place-items-center rounded-sm text-ink hover:bg-blush" aria-label="Close">
              <X className="size-5" />
            </Dialog.Close>
          </div>
          <div className="mt-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
