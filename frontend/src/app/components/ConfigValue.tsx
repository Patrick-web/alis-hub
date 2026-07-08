interface ConfigValueProps {
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
}

export function ConfigValue({ label, value, mono = true, copyable = false }: ConfigValueProps) {
  const handleCopy = () => {
    if (copyable) {
      navigator.clipboard.writeText(value);
    }
  };

  return (
    <div className="flex flex-col gap-[4px]">
      <p className="text-[9px] text-foreground/50 uppercase font-bold font-mono">
        {label}
      </p>
      <div
        className={`bg-background border border-border rounded-[4px] px-[10px] py-[6px] ${
          copyable ? 'cursor-pointer hover:border-brand-fill transition-colors' : ''
        }`}
        onClick={handleCopy}
      >
        <p
          className={`text-[11px] text-foreground ${
            mono ? "font-mono" : ''
          }`}
        >
          {value}
        </p>
      </div>
    </div>
  );
}
