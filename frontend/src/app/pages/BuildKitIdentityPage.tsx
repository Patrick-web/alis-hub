import { useNavigate } from 'react-router';
import { Browser } from '@wailsio/runtime';
import { Icon } from '@iconify/react';
import { PageLayout } from '../components/PageLayout';
import { Button } from '../components/Button';
import { StageCard } from '../components/StageCard';

const GOOGLE_OAUTH_URL = 'https://console.cloud.google.com/auth/clients/create';
const MICROSOFT_OAUTH_URL = 'https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/CreateApplicationBlade';

export function BuildKitIdentityPage() {
  const navigate = useNavigate();

  return (
    <PageLayout
      title="Identity"
      subtitle="Manage identity, access, and application integrations for agent and enterprise workflows."
      parentRoute="/buildkit"
      actions={
        <Button variant="secondary" onClick={() => navigate('/builds')}>
          <Icon icon="solar:hammer-linear" className="text-sm mr-[4px]" />
          Build
        </Button>
      }
    >
      <div className="px-[24px] py-[20px] max-w-[900px] mx-auto w-full">
        <div className="flex flex-col gap-[16px]">
          <p className="text-[12px] text-[rgba(255,255,255,0.7)] leading-[1.6]">
            The Identity flow guides you through deploying and configuring an Identity service for your product. It
            handles OAuth authentication, session management, and application integrations for agents and enterprise
            workflows.
          </p>

          {/* Overview */}
          <StageCard
            step={1}
            title="Deploy Identity Service"
            subtitle="Install and deploy the Identity codeblock to your environment"
          >
            <p className="text-[11px] text-[rgba(255,255,255,0.6)] mb-[12px] leading-[1.5]">
              The Identity service is deployed as a standard Alis Build service. Install the Identity codeblock via
              the VS Code extension, then build and deploy it.
            </p>
            <div className="flex flex-col gap-[8px] mb-[14px]">
              {[
                { label: 'SUPER_ADMINS', desc: 'Comma-separated list of super admin email addresses.' },
                { label: 'IDENTITY_SERVICE_URL', desc: 'Public URL of the deployed Identity service (e.g. https://users-v1-{project}.{region}.run.app).' },
                { label: 'COOKIE_DOMAIN', desc: 'Base domain for session cookies (e.g. .{your-launchpad-domain}).' },
              ].map((env) => (
                <div key={env.label} className="px-[12px] py-[10px] bg-[#252525] border border-[#464646] rounded-[4px]">
                  <p className="text-[11px] font-bold text-white font-['JetBrains_Mono',sans-serif] mb-[2px]">{env.label}</p>
                  <p className="text-[10px] text-[rgba(255,255,255,0.5)]">{env.desc}</p>
                </div>
              ))}
            </div>
            <Button variant="primary" onClick={() => navigate('/builds')}>
              <Icon icon="solar:hammer-linear" className="text-sm mr-[4px]" />
              Build & Deploy
            </Button>
          </StageCard>

          {/* Google OAuth */}
          <StageCard
            step={2}
            title="Configure Google OAuth"
            subtitle="Create a Google OAuth 2.0 Web Client for the Identity service"
            action={
              <Button variant="secondary" onClick={() => Browser.OpenURL(GOOGLE_OAUTH_URL)}>
                <Icon icon="solar:arrow-right-up-linear" className="text-sm mr-[4px]" />
                GCP Console
              </Button>
            }
          >
            <p className="text-[11px] text-[rgba(255,255,255,0.6)] mb-[12px] leading-[1.5]">
              Create a <strong className="text-white">Web application</strong> OAuth 2.0 client in the Google Cloud
              Console. Set the following authorised redirect URIs:
            </p>
            <div className="flex flex-col gap-[4px]">
              {[
                'https://{identity-service-url}/callback/google',
                'http://localhost:8080/callback/google',
              ].map((uri) => (
                <div key={uri} className="flex items-center gap-[8px] px-[10px] py-[6px] bg-[#252525] border border-[#464646] rounded-[4px]">
                  <Icon icon="solar:link-linear" className="text-[rgba(255,255,255,0.35)] text-[12px] shrink-0" />
                  <span className="text-[10px] text-white font-['JetBrains_Mono',sans-serif]">{uri}</span>
                </div>
              ))}
            </div>
          </StageCard>

          {/* Microsoft OAuth */}
          <StageCard
            step={3}
            title="Configure Microsoft OAuth"
            subtitle="Register an application in Microsoft Entra ID"
            action={
              <Button variant="secondary" onClick={() => Browser.OpenURL(MICROSOFT_OAUTH_URL)}>
                <Icon icon="solar:arrow-right-up-linear" className="text-sm mr-[4px]" />
                Azure Portal
              </Button>
            }
          >
            <p className="text-[11px] text-[rgba(255,255,255,0.6)] mb-[12px] leading-[1.5]">
              Register a new application in Microsoft Entra ID (Azure AD) with the following settings:
            </p>
            <div className="flex flex-col gap-[8px]">
              {[
                { label: 'Supported account types', value: 'Any Entra ID Tenant + Personal Microsoft accounts' },
                { label: 'Redirect platform', value: 'Web' },
                { label: 'Redirect URI', value: 'https://{identity-service-url}/callback/microsoft' },
                { label: 'Local redirect URI', value: 'http://localhost:8080/callback/microsoft' },
              ].map((item) => (
                <div key={item.label} className="flex items-start gap-[10px] px-[12px] py-[8px] bg-[#252525] border border-[#464646] rounded-[4px]">
                  <span className="text-[10px] text-[rgba(255,255,255,0.45)] font-['JetBrains_Mono',sans-serif] w-[160px] shrink-0">{item.label}</span>
                  <span className="text-[10px] text-white font-['JetBrains_Mono',sans-serif]">{item.value}</span>
                </div>
              ))}
            </div>
          </StageCard>

          <div className="flex items-start gap-[10px] px-[14px] py-[12px] bg-[rgba(248,129,169,0.06)] border border-[rgba(248,129,169,0.2)] rounded-[4px]">
            <Icon icon="solar:info-circle-linear" className="text-[#f881a9] text-[15px] shrink-0 mt-[1px]" />
            <p className="text-[11px] text-[rgba(255,255,255,0.6)] leading-[1.5]">
              Full Identity setup with automated service selection is available in the VS Code extension.
              Use the Alis Build extension for the complete interactive workflow.
            </p>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
