'use client';

import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as RadioPrimitive from '@radix-ui/react-radio-group';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown, AlertCircle, Upload } from 'lucide-react';
import { cn } from '../lib/cn';

/*
 * FORM INFRASTRUCTURE.
 *
 * The design goal is that an inaccessible field should be hard to build.
 *
 *   - A visible label is REQUIRED. There is no placeholder-as-label path: a
 *     placeholder disappears on focus, fails contrast, and is not a label.
 *   - Error and description are wired through aria-describedby AUTOMATICALLY
 *     by Field via context, so a developer cannot forget the association.
 *   - Errors are announced (role="alert") and marked with an icon as well as
 *     colour, because colour alone is not an error indicator.
 *   - The control boundary uses --input, the only border token meeting the 3:1
 *     non-text contrast requirement. --border is decorative and never used here.
 */

type FieldContextValue = {
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
  required: boolean;
  disabled: boolean;
};

const FieldContext = React.createContext<FieldContextValue | null>(null);

function useField() {
  return React.useContext(FieldContext);
}

export interface FieldProps {
  label: string;
  /** Supporting text shown under the label. Always associated, never floating. */
  description?: string;
  /** Validation message. Presence marks the control invalid. */
  error?: string;
  required?: boolean;
  disabled?: boolean;
  /** Text appended to the label for optional fields, e.g. "(optional)". */
  optionalLabel?: string;
  /** Visually hide the label. The label still exists for assistive technology. */
  hideLabel?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function Field({
  label, description, error, required = false, disabled = false,
  optionalLabel, hideLabel = false, className, children
}: FieldProps) {
  const reactId = React.useId();
  const id = 'f' + reactId.replace(/:/g, '');
  const descriptionId = description ? id + '-desc' : undefined;
  const errorId = error ? id + '-err' : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <FieldContext.Provider value={{ id, describedBy, invalid: Boolean(error), required, disabled }}>
      <div className={cn('flex flex-col gap-1.5', className)}>
        <label
          htmlFor={id}
          className={cn(
            'text-label font-[var(--font-weight-medium)] text-foreground',
            hideLabel && 'sr-only',
            disabled && 'text-muted-foreground'
          )}
        >
          {label}
          {required ? (
            // The asterisk is decorative; `required` on the control is what
            // assistive technology actually announces.
            <span aria-hidden="true" className="ml-0.5 text-[var(--destructive)]">*</span>
          ) : optionalLabel ? (
            <span className="ml-1 font-[var(--font-weight-regular)] text-muted-foreground">{optionalLabel}</span>
          ) : null}
        </label>

        {description && (
          <p id={descriptionId} className="text-caption text-muted-foreground">
            {description}
          </p>
        )}

        {children}

        {error && (
          <p
            id={errorId}
            role="alert"
            className="flex items-start gap-1.5 text-caption text-[var(--input-error-fg)]"
          >
            <AlertCircle aria-hidden="true" className="size-3.5 shrink-0 translate-y-px" />
            {error}
          </p>
        )}
      </div>
    </FieldContext.Provider>
  );
}

/* Shared control chrome. */
const controlBase = [
  'w-full bg-[var(--input-background)] text-[var(--input-fg)]',
  'rounded-[var(--input-radius)] border border-[var(--input)]',
  'px-[var(--input-padding-x)] text-body',
  'transition-colors duration-[var(--duration-fast)]',
  'placeholder:text-[var(--input-placeholder)]',
  'hover:border-[var(--input-border-hover)]',
  'outline-none focus-visible:outline-[length:var(--focus-ring-width)]',
  'focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-[var(--focus-ring-offset)]',
  'focus-visible:border-[var(--input-border-focus)]',
  'aria-[invalid=true]:border-[var(--input-border-error)]',
  'disabled:bg-[var(--input-readonly-bg)] disabled:text-muted-foreground disabled:cursor-not-allowed'
].join(' ');

/** Props a Field-managed control receives automatically. */
function fieldProps(ctx: FieldContextValue | null) {
  if (!ctx) return {};
  return {
    id: ctx.id,
    'aria-describedby': ctx.describedBy,
    'aria-invalid': ctx.invalid || undefined,
    required: ctx.required,
    disabled: ctx.disabled
  };
}

/* ── Input ──────────────────────────────────────────────────────────── */
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    const ctx = useField();
    return (
      <input
        ref={ref}
        className={cn(controlBase, 'h-[var(--input-height)]', className)}
        {...fieldProps(ctx)}
        {...props}
      />
    );
  }
);

/* ── Textarea ───────────────────────────────────────────────────────── */
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, rows = 4, ...props }, ref) {
    const ctx = useField();
    return (
      <textarea
        ref={ref}
        rows={rows}
        className={cn(controlBase, 'py-2 min-h-[var(--input-height)] resize-y', className)}
        {...fieldProps(ctx)}
        {...props}
      />
    );
  }
);

/* ── Date input ─────────────────────────────────────────────────────────
 * A native date input is used deliberately: it is keyboard accessible, it is
 * localised by the platform, and it works with the user's assistive technology
 * without a custom calendar widget re-implementing all of that badly.
 */
export const DateInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function DateInput({ className, ...props }, ref) {
    const ctx = useField();
    return (
      <input
        ref={ref}
        type="date"
        className={cn(controlBase, 'h-[var(--input-height)]', className)}
        {...fieldProps(ctx)}
        {...props}
      />
    );
  }
);

/* ── File input ─────────────────────────────────────────────────────── */
export interface FileInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  buttonLabel: string;
  /** Rendered next to the control, e.g. "PDF up to 10 MB". */
  hint?: string;
}
export const FileInput = React.forwardRef<HTMLInputElement, FileInputProps>(
  function FileInput({ className, buttonLabel, hint, ...props }, ref) {
    const ctx = useField();
    return (
      <div className={cn('flex flex-col gap-1.5', className)}>
        <div
          className={cn(
            'flex items-center gap-3 rounded-[var(--input-radius)] border border-[var(--input)]',
            'bg-[var(--input-background)] p-2'
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              'inline-flex items-center gap-2 rounded-[var(--btn-radius)] px-3',
              'h-[var(--control-height-sm)] bg-[var(--btn-secondary-bg)]',
              'text-[var(--btn-secondary-fg)] text-[length:var(--btn-font-size)]',
              'border border-[var(--btn-secondary-border)]'
            )}
          >
            <Upload className="size-4" />
            {buttonLabel}
          </span>
          {/* The native input stays in the accessibility tree and keyboard order;
              it is the real control, merely styled to fill the row. */}
          <input
            ref={ref}
            type="file"
            className="min-w-0 flex-1 text-body-sm file:hidden"
            {...fieldProps(ctx)}
            {...props}
          />
        </div>
        {hint && <span className="text-caption text-muted-foreground">{hint}</span>}
      </div>
    );
  }
);

/* ── Select ─────────────────────────────────────────────────────────── */
export interface SelectOption { value: string; label: string; disabled?: boolean }

export interface SelectProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  name?: string;
}

export function Select({ value, defaultValue, onValueChange, options, placeholder, className, name }: SelectProps) {
  const ctx = useField();
  return (
    <SelectPrimitive.Root
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      name={name}
      required={ctx?.required}
      disabled={ctx?.disabled}
    >
      <SelectPrimitive.Trigger
        id={ctx?.id}
        aria-describedby={ctx?.describedBy}
        aria-invalid={ctx?.invalid || undefined}
        className={cn(controlBase, 'h-[var(--input-height)] flex items-center justify-between gap-2 text-left', className)}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className={cn(
            'z-[var(--z-dropdown)] min-w-[var(--radix-select-trigger-width)] overflow-hidden p-1',
            'rounded-[var(--radius-md)] border border-border bg-popover text-popover-foreground',
            'shadow-[var(--shadow-md)]'
          )}
        >
          <SelectPrimitive.Viewport className="max-h-[300px]">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className={cn(
                  'relative flex cursor-default select-none items-center gap-2 rounded-[var(--radius-sm)]',
                  'py-1.5 pl-2 pr-8 text-body-sm outline-none',
                  'data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground',
                  'data-[disabled]:pointer-events-none data-[disabled]:text-[var(--btn-disabled-fg)]'
                )}
              >
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="absolute right-2">
                  <Check aria-hidden="true" className="size-4" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

/* ── Checkbox / Radio / Switch ──────────────────────────────────────────
 * These take their own label rather than sitting inside Field, because the
 * label belongs BESIDE the control and clicking it must toggle the control.
 */
export interface ToggleProps {
  label: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}

export function Checkbox({
  label, description, disabled, className, ...props
}: ToggleProps & React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>) {
  const reactId = React.useId();
  const id = 'c' + reactId.replace(/:/g, '');
  const descId = description ? id + '-desc' : undefined;
  return (
    <div className={cn('flex items-start gap-2.5', className)}>
      <CheckboxPrimitive.Root
        id={id}
        disabled={disabled}
        aria-describedby={descId}
        className={cn(
          'peer shrink-0 mt-0.5 size-[var(--control-box-size)]',
          // The visual box is the token size; the TARGET is expanded to the 24px
          // minimum with a transparent overlay (WCAG 2.2 SC 2.5.8). Growing the box
          // itself would override a Design System decision to fix an ergonomics one.
          'relative before:absolute before:-inset-1 before:content-[""]',
          'rounded-[var(--radius-xs)] border border-[var(--input)] bg-[var(--input-background)]',
          'transition-colors duration-[var(--duration-fast)]',
          'data-[state=checked]:bg-primary data-[state=checked]:border-primary',
          'data-[state=indeterminate]:bg-primary data-[state=indeterminate]:border-primary',
          'outline-none focus-visible:outline-[length:var(--focus-ring-width)]',
          'focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-[var(--focus-ring-offset)]',
          'disabled:bg-[var(--btn-disabled-bg)] disabled:border-[var(--btn-disabled-border)] disabled:cursor-not-allowed'
        )}
        {...props}
      >
        <CheckboxPrimitive.Indicator className="flex items-center justify-center text-[var(--primary-foreground)]">
          <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <div className="flex flex-col gap-0.5">
        <label
          htmlFor={id}
          className={cn(
            'text-body-sm cursor-pointer select-none',
            disabled && 'text-muted-foreground cursor-not-allowed'
          )}
        >
          {label}
        </label>
        {description && <span id={descId} className="text-caption text-muted-foreground">{description}</span>}
      </div>
    </div>
  );
}

export const RadioGroup = RadioPrimitive.Root;

export function Radio({ label, description, disabled, className, value }: ToggleProps & { value: string }) {
  const reactId = React.useId();
  const id = 'r' + reactId.replace(/:/g, '');
  const descId = description ? id + '-desc' : undefined;
  return (
    <div className={cn('flex items-start gap-2.5', className)}>
      <RadioPrimitive.Item
        id={id}
        value={value}
        disabled={disabled}
        aria-describedby={descId}
        className={cn(
          'shrink-0 mt-0.5 size-[var(--control-box-size)] rounded-full',
          // The visual box is the token size; the TARGET is expanded to the 24px
          // minimum with a transparent overlay (WCAG 2.2 SC 2.5.8). Growing the box
          // itself would override a Design System decision to fix an ergonomics one.
          'relative before:absolute before:-inset-1 before:content-[""]',
          'border border-[var(--input)] bg-[var(--input-background)]',
          'transition-colors duration-[var(--duration-fast)]',
          'data-[state=checked]:border-primary data-[state=checked]:bg-primary',
          'outline-none focus-visible:outline-[length:var(--focus-ring-width)]',
          'focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-[var(--focus-ring-offset)]',
          'disabled:bg-[var(--btn-disabled-bg)] disabled:border-[var(--btn-disabled-border)] disabled:cursor-not-allowed'
        )}
      >
        <RadioPrimitive.Indicator className="flex size-full items-center justify-center">
          <span className="size-1.5 rounded-full bg-[var(--primary-foreground)]" />
        </RadioPrimitive.Indicator>
      </RadioPrimitive.Item>
      <div className="flex flex-col gap-0.5">
        <label
          htmlFor={id}
          className={cn('text-body-sm cursor-pointer select-none', disabled && 'text-muted-foreground cursor-not-allowed')}
        >
          {label}
        </label>
        {description && <span id={descId} className="text-caption text-muted-foreground">{description}</span>}
      </div>
    </div>
  );
}

export function Switch({
  label, description, disabled, className, ...props
}: ToggleProps & React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>) {
  const reactId = React.useId();
  const id = 's' + reactId.replace(/:/g, '');
  const descId = description ? id + '-desc' : undefined;
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="flex flex-col gap-0.5">
        <label
          htmlFor={id}
          className={cn('text-body-sm cursor-pointer select-none', disabled && 'text-muted-foreground cursor-not-allowed')}
        >
          {label}
        </label>
        {description && <span id={descId} className="text-caption text-muted-foreground">{description}</span>}
      </div>
      <SwitchPrimitive.Root
        id={id}
        disabled={disabled}
        aria-describedby={descId}
        className={cn(
          'peer inline-flex h-5 w-9 shrink-0 items-center rounded-full',
          'border border-transparent bg-[var(--input)]',
          'transition-colors duration-[var(--duration-fast)]',
          'data-[state=checked]:bg-primary',
          'outline-none focus-visible:outline-[length:var(--focus-ring-width)]',
          'focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-[var(--focus-ring-offset)]',
          'disabled:bg-[var(--btn-disabled-bg)] disabled:cursor-not-allowed'
        )}
        {...props}
      >
        <SwitchPrimitive.Thumb
          className={cn(
            'block size-4 rounded-full bg-[var(--card)] shadow-[var(--shadow-xs)]',
            'transition-transform duration-[var(--duration-fast)] motion-reduce:transition-none',
            'translate-x-0.5 data-[state=checked]:translate-x-[18px]'
          )}
        />
      </SwitchPrimitive.Root>
    </div>
  );
}

/**
 * Groups related fields with a legend, so they are announced as a set.
 *
 * LAYOUT NOTE, because this is a trap that looks like a styling nit and renders
 * as overlapping text:
 *
 * A `<legend>` is NOT a flex item. Browsers pull it out of the fieldset's
 * formatting context so it can sit in the border, which means `gap` never
 * applies between the legend and whatever follows it. A negative margin added
 * to "tighten" that non-existent gap does not tighten anything — it drags the
 * description straight up over the legend. That is exactly what happened here:
 * an 8px overlap, in both themes, that no axe rule and no overflow assertion
 * can see.
 *
 * So the legend is spaced with its own margin, and nothing below it compensates
 * for a gap that was never there.
 */
export function FieldGroup({
  legend, description, className, children
}: { legend: string; description?: string; className?: string; children: React.ReactNode }) {
  return (
    <fieldset className={cn('flex flex-col gap-4 border-0 p-0 m-0', className)}>
      <legend className="mb-1 p-0 text-label font-[var(--font-weight-semibold)] text-foreground">
        {legend}
      </legend>
      {description && <p className="text-caption text-muted-foreground">{description}</p>}
      {children}
    </fieldset>
  );
}
