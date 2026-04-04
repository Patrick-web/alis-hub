import { Icon } from '@iconify/react';

interface BreadcrumbItem {
  label: string;
  lowercase?: boolean;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <div className="flex-[1_0_0] h-[30px] min-h-px min-w-px relative">
      <div aria-hidden="true" className="absolute border-[#464646] border-b border-r border-solid border-t inset-0 pointer-events-none" />
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex items-center px-[10px] relative size-full space-x-1">
          <Icon icon="solar:folder-linear" className="text-white text-base" />
          {items.map((item, index) => (
            <div key={index} className="flex items-center">
              <Icon icon="solar:alt-arrow-right-linear" className="text-white text-sm mx-1" />
              <p className={`font-['JetBrains_Mono',sans-serif] leading-[normal] not-italic relative shrink-0 text-[${index === 0 ? '11px' : '12px'}] text-white whitespace-nowrap ${
                item.lowercase ? 'lowercase' : ''
              }`}>
                {item.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
