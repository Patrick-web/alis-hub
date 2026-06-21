import { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@iconify/react';

export interface PageLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
  parentRoute?: string;
}

export function PageLayout({ title, subtitle, children, actions, parentRoute }: PageLayoutProps) {
  const navigate = useNavigate();

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      <div className="border-b border-border px-[20px] py-[10px] flex items-center justify-between shrink-0 h-[51px]">
        <div className="flex items-center gap-[12px]">
          <button
            onClick={() => (parentRoute ? navigate(parentRoute) : navigate(-1))}
            className="text-white opacity-50 hover:opacity-100 transition-opacity flex items-center"
          >
            <Icon icon="solar:alt-arrow-left-linear" className="text-xl" />
          </button>
          <div className="flex flex-col">
            <h1 className="font-mono font-bold text-[13px] text-white uppercase leading-[1.2]">
              {title}
            </h1>
            {subtitle && (
              <p className="text-[10px] text-[rgba(255,255,255,0.5)] leading-[1.2]">{subtitle}</p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex items-center gap-[10px]">{actions}</div>
        )}
      </div>
      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  );
}
