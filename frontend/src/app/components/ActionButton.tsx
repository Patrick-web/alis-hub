import { ButtonHTMLAttributes } from 'react';

interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: 'default' | 'ghost';
}

export function ActionButton({ 
  children, 
  variant = 'default',
  className = '', 
  ...props 
}: ActionButtonProps) {
  const baseStyles = "content-stretch flex items-center justify-center px-[8px] py-[4px] relative rounded-[4px] font-['JetBrains_Mono',sans-serif] transition-colors";
  
  const variants = {
    default: 'bg-[#2c2c2c] border border-[#464646] text-white hover:bg-[#3a3a3a]',
    ghost: 'text-white hover:bg-[rgba(255,255,255,0.05)]',
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${className}`}
      {...props}
    >
      <p className="font-['JetBrains_Mono',sans-serif] leading-[normal] not-italic text-[10px] text-white whitespace-nowrap">
        {children}
      </p>
    </button>
  );
}
