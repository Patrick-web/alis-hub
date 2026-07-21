import { ButtonHTMLAttributes } from "react";

interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: "default" | "ghost";
}

export function ActionButton({
  children,
  variant = "default",
  className = "",
  ...props
}: ActionButtonProps) {
  const baseStyles =
    "content-stretch flex items-center justify-center px-[8px] py-[4px] relative rounded-[4px] font-mono transition-colors";

  const variants = {
    default: "bg-card border border-border text-foreground hover:bg-accent",
    ghost: "text-foreground hover:bg-foreground/5",
  };

  return (
    <button className={`${baseStyles} ${variants[variant]} ${className}`} {...props}>
      <p className="font-mono leading-[normal] not-italic text-[10px] text-foreground whitespace-nowrap">
        {children}
      </p>
    </button>
  );
}
