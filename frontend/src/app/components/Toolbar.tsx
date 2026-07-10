import { ReactNode } from 'react';

interface ToolbarProps {
  children: ReactNode;
  className?: string;
}

export function Toolbar({ children, className = '' }: ToolbarProps) {
  return (
    <div className={`border-b border-border px-[20px] py-[8px] flex items-center ${className}`}>
      {children}
    </div>
  );
}
