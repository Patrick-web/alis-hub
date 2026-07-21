import { InputHTMLAttributes, ReactNode, Ref } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode;
  containerClassName?: string;
  inputRef?: Ref<HTMLInputElement>;
}

export function Input({
  icon,
  className = "",
  containerClassName = "",
  inputRef,
  ...props
}: InputProps) {
  return (
    <div className={`relative flex items-center ${containerClassName}`}>
      <div
        className={`content-stretch flex gap-[10px] items-center px-[10px] py-[8px] relative bg-background border border-border border-solid rounded-[4px] h-full w-full focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-background ${className}`}
      >
        {icon && (
          <div className="relative shrink-0 size-[15px] flex items-center justify-center">
            {icon}
          </div>
        )}
        <input
          ref={inputRef}
          className="bg-transparent font-mono leading-[normal] not-italic text-[12px] text-foreground outline-none placeholder:text-foreground/50 w-full"
          {...props}
        />
      </div>
    </div>
  );
}
