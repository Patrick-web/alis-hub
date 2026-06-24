import { useState } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Command as CommandPrimitive } from 'cmdk';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from './utils';

interface SearchableSelectProps {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
}

export function SearchableSelect({
  value,
  options,
  onChange,
  placeholder = 'Select…',
  label,
  className,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = query.trim()
    ? options.filter(o => o.toLowerCase().includes(query.toLowerCase()))
    : options;

  function handleSelect(opt: string) {
    onChange(opt);
    setOpen(false);
    setQuery('');
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          className={cn(
            'flex items-center gap-1 text-[10px] bg-foreground/5 border border-foreground/15 rounded px-1.5 py-1 text-foreground/70 hover:border-foreground/25 transition-colors',
            open && 'border-foreground/30',
            className,
          )}
        >
          {label && <span className="text-foreground/30 shrink-0">{label}</span>}
          <span className="font-mono truncate flex-1 text-left">{value || placeholder}</span>
          <ChevronDown size={9} className={cn('shrink-0 text-foreground/30 transition-transform', open && 'rotate-180')} />
        </button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          sideOffset={4}
          align="start"
          className="z-50 w-[200px] rounded-md bg-background border border-foreground/10 shadow-xl overflow-hidden"
        >
          <CommandPrimitive shouldFilter={false}>
            <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-foreground/10">
              <Search size={11} className="text-foreground/30 shrink-0" />
              <CommandPrimitive.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Search…"
                className="flex-1 bg-transparent text-[11px] text-foreground/80 placeholder:text-foreground/30 outline-none font-mono"
              />
            </div>
            <CommandPrimitive.List className="max-h-[180px] overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <CommandPrimitive.Empty className="py-4 text-center text-[11px] text-foreground/30">
                  No results
                </CommandPrimitive.Empty>
              ) : (
                filtered.map(opt => (
                  <CommandPrimitive.Item
                    key={opt}
                    value={opt}
                    onSelect={() => handleSelect(opt)}
                    className="flex items-center gap-2 px-2 py-1.5 cursor-pointer text-[11px] text-foreground/70 font-mono hover:bg-foreground/5 aria-selected:bg-foreground/5 outline-none"
                  >
                    <Check
                      size={10}
                      className={cn('shrink-0 text-pink-400', opt === value ? 'opacity-100' : 'opacity-0')}
                    />
                    <span className="truncate">{opt}</span>
                  </CommandPrimitive.Item>
                ))
              )}
            </CommandPrimitive.List>
          </CommandPrimitive>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
