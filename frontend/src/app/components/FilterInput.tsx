import { InputHTMLAttributes, useEffect, useRef, useState } from "react";
import { Input } from "./Input";

interface FilterInputProps extends InputHTMLAttributes<HTMLInputElement> {
  width?: string;
}

export function FilterInput({
  width = "w-[260px]",
  className = "",
  onFocus,
  onBlur,
  ...props
}: FilterInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) {
        return;
      }

      e.preventDefault();
      inputRef.current?.focus();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="flex items-center h-[34px]">
      <div
        className={`bg-card border px-[12px] h-full flex items-center justify-center border-r-0 rounded-l-[4px] transition-colors ${focused ? "border-ring" : "border-border"}`}
      >
        <p className={`text-[12px] transition-colors ${focused ? "text-ring" : "text-foreground"}`}>
          /
        </p>
      </div>
      <Input
        inputRef={inputRef}
        className={`${width} border-l-0 rounded-l-none h-full transition-colors ${focused ? "!border-ring" : ""} ${className}`}
        containerClassName="h-full"
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...props}
      />
    </div>
  );
}
