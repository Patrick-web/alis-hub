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
      <p className="text-[9px] text-[rgba(255,255,255,0.5)] uppercase font-bold font-['JetBrains_Mono',sans-serif]">
        {label}
      </p>
      <div
        className={`bg-[#1e1e1e] border border-[#464646] rounded-[4px] px-[10px] py-[6px] ${
          copyable ? 'cursor-pointer hover:border-[#f881a9] transition-colors' : ''
        }`}
        onClick={handleCopy}
      >
        <p
          className={`text-[11px] text-white ${
            mono ? "font-['JetBrains_Mono',sans-serif]" : ''
          }`}
        >
          {value}
        </p>
      </div>
    </div>
  );
}
