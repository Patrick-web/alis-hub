import { useState } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Command as CommandPrimitive } from "cmdk";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "./utils";

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Select…",
  disabled,
  className,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  function toggle(val: string) {
    onChange(value.includes(val) ? value.filter((v) => v !== val) : [...value, val]);
  }

  const selectedLabels = value.map((v) => options.find((o) => o.value === v)?.label ?? v);

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(o) => {
        if (!disabled) setOpen(o);
      }}
    >
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex items-start gap-1.5 min-h-[34px] w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-left transition-colors hover:border-foreground/30 focus:outline-none focus:border-brand-fill disabled:opacity-50 disabled:cursor-not-allowed",
            open && "border-brand-fill",
            className,
          )}
        >
          <div className="flex-1 flex flex-wrap gap-1 min-w-0 pt-px">
            {selectedLabels.length === 0 ? (
              <span className="text-xs text-foreground/30 leading-5">{placeholder}</span>
            ) : (
              selectedLabels.map((label, i) => (
                <span
                  key={i}
                  className="inline-flex items-center text-[10px] bg-brand-fill/10 text-brand rounded px-1.5 py-0.5 font-mono leading-4"
                >
                  {label}
                </span>
              ))
            )}
          </div>
          <ChevronDown
            size={13}
            className={cn(
              "shrink-0 text-foreground/30 mt-1 transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          sideOffset={4}
          align="start"
          style={{ width: "var(--radix-popover-trigger-width)" }}
          className="z-50 rounded-md bg-background border border-border shadow-xl overflow-hidden"
        >
          <CommandPrimitive shouldFilter={false}>
            <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border">
              <Search size={11} className="text-foreground/30 shrink-0" />
              <CommandPrimitive.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Search…"
                className="flex-1 bg-transparent text-[11px] text-foreground/80 placeholder:text-foreground/30 outline-none"
              />
            </div>
            <CommandPrimitive.List className="max-h-[200px] overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <CommandPrimitive.Empty className="py-4 text-center text-[11px] text-foreground/30">
                  No options
                </CommandPrimitive.Empty>
              ) : (
                filtered.map((opt) => {
                  const checked = value.includes(opt.value);
                  return (
                    <CommandPrimitive.Item
                      key={opt.value}
                      value={opt.value}
                      onSelect={() => toggle(opt.value)}
                      className="flex items-center gap-2.5 px-2.5 py-2 cursor-pointer text-[12px] text-foreground hover:bg-foreground/5 aria-selected:bg-foreground/5 outline-none"
                    >
                      <div
                        className={cn(
                          "size-3.5 rounded-sm border flex items-center justify-center flex-shrink-0 transition-colors",
                          checked ? "bg-brand-fill border-brand-fill" : "border-border",
                        )}
                      >
                        {checked && <Check size={9} className="text-white" strokeWidth={3} />}
                      </div>
                      <span className="truncate">{opt.label}</span>
                    </CommandPrimitive.Item>
                  );
                })
              )}
            </CommandPrimitive.List>
          </CommandPrimitive>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
