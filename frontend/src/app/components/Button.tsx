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
  const baseStyles = "content-stretch flex items-center justify-center gap-[5px] relative rounded-[5px] font-['JetBrains_Mono',sans-serif] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none";
  
  const variants = {
    primary: 'bg-[#f881a9] text-[#6f0025] px-[10px] py-[5px] hover:bg-[#ff94ba]',
    secondary: 'bg-[#2c2c2c] border border-[#464646] text-white px-[10px] py-[5px] hover:bg-[#3a3a3a]',
    ghost: 'text-white px-[5px] py-[4px] hover:bg-[rgba(255,255,255,0.1)]',
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
