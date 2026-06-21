import { Browser } from '@wailsio/runtime';
import { Icon } from '@iconify/react';
import { PageLayout } from '../components/PageLayout';
import { Button } from '../components/Button';
import { StageCard } from '../components/StageCard';

const GEMINI_ENTERPRISE_URL = 'https://console.cloud.google.com/gemini-enterprise/apps';

const stages = [
  {
    step: 1,
    title: 'Create Gemini Enterprise App',
    subtitle: 'Set up a Gemini Enterprise application in Google Cloud',
    description: 'Open the Google Cloud Console to create and configure your Gemini Enterprise application. This is the foundation for granting your organisation access to Gemini Enterprise capabilities.',
    icon: 'solar:star-shine-linear',
    action: 'Open GCP Console',
    actionUrl: GEMINI_ENTERPRISE_URL,
  },
  {
    step: 2,
    title: 'Configure Subscriptions',
    subtitle: 'Assign Gemini Enterprise subscriptions to your users',
    description: 'Set up and manage subscriptions to control which users in your organisation have access to Gemini Enterprise. Configure seat allocations and access tiers as required.',
    icon: 'solar:users-group-rounded-linear',
    action: 'Manage Subscriptions',
    actionUrl: GEMINI_ENTERPRISE_URL,
  },
  {
    step: 3,
    title: 'Workforce Federation',
    subtitle: 'Connect your identity provider to Google Cloud',
    description: 'Configure Workforce Identity Federation to allow your organisation\'s users to authenticate with Google Cloud using your existing identity provider (Google Workspace, Microsoft Entra, etc.).',
    icon: 'solar:shield-keyhole-linear',
    action: 'Configure Identity',
    actionUrl: 'https://console.cloud.google.com/iam-admin/workforce-identity-pools',
  },
  {
    step: 4,
    title: 'Data Connectors',
    subtitle: 'Connect your data sources to Gemini Enterprise',
    description: 'Set up data connectors to allow Gemini Enterprise to access your organisation\'s data sources. This enables grounded responses and enterprise-specific knowledge in Gemini interactions.',
    icon: 'solar:database-linear',
    action: 'Configure Connectors',
    actionUrl: GEMINI_ENTERPRISE_URL,
  },
];

export function BuildKitGeminiEnterprisePage() {
  return (
    <PageLayout
      title="Gemini Enterprise"
      subtitle="Configure Gemini Enterprise access, subscriptions, workforce federation, and data connectors."
      parentRoute="/buildkit"
      actions={
        <Button variant="secondary" onClick={() => Browser.OpenURL(GEMINI_ENTERPRISE_URL)}>
          <Icon icon="solar:arrow-right-up-linear" className="text-sm mr-[4px]" />
          GCP Console
        </Button>
      }
    >
      <div className="px-[24px] py-[20px] max-w-[900px] mx-auto w-full">
        <div className="flex flex-col gap-[16px]">
          <p className="text-[12px] text-foreground/70 leading-[1.6]">
            The Gemini Enterprise flow walks you through setting up Google Gemini Enterprise for your organisation.
            This includes creating an enterprise application, managing subscriptions, configuring identity federation,
            and connecting your data sources.
          </p>

          {stages.map((stage) => (
            <StageCard
              key={stage.step}
              step={stage.step}
              title={stage.title}
              subtitle={stage.subtitle}
              icon={<Icon icon={stage.icon} className="text-brand" />}
              action={
                <Button variant="secondary" onClick={() => Browser.OpenURL(stage.actionUrl)}>
                  <Icon icon="solar:arrow-right-up-linear" className="text-sm mr-[4px]" />
                  {stage.action}
                </Button>
              }
            >
              <p className="text-[11px] text-foreground/60 leading-[1.5]">{stage.description}</p>
            </StageCard>
          ))}
        </div>
      </div>
    </PageLayout>
  );
}
