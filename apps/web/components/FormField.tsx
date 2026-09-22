export function FormField({
  label,
  name,
  type = "text",
  required = true,
  defaultValue,
  min,
  step,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string | number;
  min?: number;
  step?: number;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-semibold text-ink">
        {label}
        {!required && <span className="font-normal text-ink-muted"> (opcional)</span>}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        min={min}
        step={step}
        placeholder={placeholder}
        minLength={type === "password" ? 8 : undefined}
        className="rounded-brand border border-border bg-surface-page px-3 py-2 text-ink placeholder:text-ink-muted"
      />
    </label>
  );
}

export function SelectField({
  label,
  name,
  options,
  required = true,
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-semibold text-ink">{label}</span>
      <select
        name={name}
        required={required}
        defaultValue=""
        className="rounded-brand border border-border bg-surface-page px-3 py-2 text-ink"
      >
        <option value="" disabled>
          Selecione
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TextAreaField({
  label,
  name,
  required = true,
  minLength,
}: {
  label: string;
  name: string;
  required?: boolean;
  minLength?: number;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-semibold text-ink">{label}</span>
      <textarea
        name={name}
        required={required}
        minLength={minLength}
        rows={4}
        className="rounded-brand border border-border bg-surface-page px-3 py-2 text-ink placeholder:text-ink-muted"
      />
    </label>
  );
}
