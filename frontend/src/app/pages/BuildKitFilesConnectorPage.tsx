import { Icon } from '@iconify/react';
import { PageLayout } from '../components/PageLayout';

export function BuildKitFilesConnectorPage() {
  return (
    <PageLayout
      title="Files Connector"
      subtitle="Deploy a custom Gemini Enterprise connector for structured and unstructured file data."
      parentRoute="/buildkit"
    >
      <div className="px-[24px] py-[20px] max-w-[900px] mx-auto w-full">
        <div className="p-[20px] bg-card border border-border rounded-[4px]">
          <div className="flex items-center gap-[8px] mb-[10px]">
            <div className="px-[6px] py-[2px] border border-border rounded-[2px]">
              <span className="text-[9px] font-bold text-foreground/40 uppercase font-mono">
                Private Preview
              </span>
            </div>
          </div>
          <div className="flex items-center gap-[12px] mb-[12px]">
            <div className="size-[36px] rounded-[4px] bg-[rgba(248,129,169,0.1)] border border-[rgba(248,129,169,0.2)] flex items-center justify-center shrink-0">
              <Icon icon="solar:file-text-linear" className="text-brand text-[18px]" />
            </div>
            <div>
              <p className="text-[13px] font-bold text-foreground font-mono">Files Connector</p>
              <p className="text-[11px] text-foreground/50">This flow is in private preview.</p>
            </div>
          </div>
          <div className="flex items-start gap-[10px] px-[14px] py-[12px] bg-[rgba(248,129,169,0.06)] border border-[rgba(248,129,169,0.2)] rounded-[4px]">
            <Icon icon="solar:info-circle-linear" className="text-brand text-[15px] shrink-0 mt-[1px]" />
            <p className="text-[11px] text-foreground/65 leading-[1.5]">
              This flow is in private preview. Please contact your Build partner for access.
            </p>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
