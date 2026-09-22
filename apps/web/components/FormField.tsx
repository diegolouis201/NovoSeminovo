export function FormField({
  label,
  name,
  type = "text",
}: {
  label: string;
  name: string;
  type?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-semibold text-ink">{label}</span>
      <input
        name={name}
        type={type}
        required
        minLength={type === "password" ? 8 : undefined}
        className="rounded-brand border border-border bg-surface-page px-3 py-2 text-ink placeholder:text-ink-muted"
      />
    </label>
  );
}
