import { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  children: ReactNode;
  icon?: ReactNode;
}

export function Button({ 
  variant = 'primary', 
  children, 
  icon,
  className = '',
  ...props 
}: ButtonProps) {
  const baseStyles = "content-stretch flex items-center justify-center gap-[5px] relative rounded-[5px] font-mono transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none";
  
  const variants = {
    primary: 'bg-brand-fill text-brand-foreground px-[10px] py-[5px] hover:bg-[#ff94ba]',
    secondary: 'bg-card border border-border text-foreground px-[10px] py-[5px] hover:bg-accent',
    ghost: 'text-foreground px-[5px] py-[4px] hover:bg-foreground/10',
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${className}`}
      {...props}
    >
      {icon && <div className="flex items-center justify-center shrink-0">{icon}</div>}
      <span className="text-[10px] uppercase leading-[normal] not-italic whitespace-nowrap">{children}</span>
    </button>
  );
}
