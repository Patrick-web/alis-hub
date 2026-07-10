import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Browser } from '@wailsio/runtime';
import { Icon } from '@iconify/react';
import { PageLayout } from '../components/PageLayout';
import { Button } from '../components/Button';
import { StageCard } from '../components/StageCard';

type StageId = 'overview' | 'prerequisites' | 'service' | 'next';

const SKILLS_REPO_URL = 'https://github.com/alis-build/skills';

const stages: Array<{ id: StageId; title: string; eyebrow: string; description: string; icon: string }> = [
  {
    id: 'overview',
    title: 'Overview',
    eyebrow: 'Skill Registry',
    description: 'Understand how Skills are packaged, discovered, and synchronised into the deployment registry.',
    icon: 'solar:layers-linear',
  },
  {
    id: 'prerequisites',
    title: 'Prerequisites',
    eyebrow: 'Inputs',
    description: 'Confirm the product and target service for the Skills codeblock.',
    icon: 'solar:checklist-linear',
  },
  {
    id: 'service',
    title: 'Skills Service',
    eyebrow: 'Service setup',
    description: 'Install, define, build, and deploy the Skills codeblock.',
    icon: 'solar:book-2-linear',
  },
  {
    id: 'next',
    title: 'Next Steps',
    eyebrow: 'Suggested prompts',
    description: 'Use the deployed Skills registry with agents and Alis Build MCP guidance.',
    icon: 'solar:lightbulb-linear',
  },
];

const suggestedPrompts = [
  {
    title: 'Add skills to an agent',
    prompt: 'Use the Alis Build MCP and the deployed Skills registry to add the relevant skills to my agent. Start by listing available skills, then recommend which ones should be enabled for this agent.',
  },
  {
    title: 'Add a skill to an agent project',
    prompt: 'Use the Alis Build MCP guidance to add a skill to this agent project. Inspect the agent structure, identify where the skill should be wired in, and make the minimal code changes.',
  },
  {
    title: 'Add skills to an MCP server',
    prompt: 'Use the dedicated Alis Build skill from the Skills registry to add Skills support to my MCP server. Guide me through connecting the MCP server to the deployed Skills service and exposing dynamic discovery and loading tools.',
  },
  {
    title: 'Create a new skill',
    prompt: 'Help me create a new skill package for this workflow. Generate a SKILL.md with clear metadata and instructions, suggest useful references or scripts, and prepare it for the skills repository sync.',
  },
];

export function BuildKitSkillsPage() {
  const navigate = useNavigate();
  const [selectedStage, setSelectedStage] = useState<StageId>('overview');
  const [copied, setCopied] = useState<string | null>(null);

  const copyPrompt = async (title: string, prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      // Clipboard may not be available in webview
    }
    setCopied(title);
    setTimeout(() => setCopied(null), 1600);
  };

  return (
    <PageLayout
      title="Skills"
      subtitle="Build and deploy a Skills service for reusable Alis Build guidance and codeblock knowledge."
      parentRoute="/buildkit"
      actions={
        <div className="flex items-center gap-[6px]">
          <Button variant="secondary" onClick={() => Browser.OpenURL(SKILLS_REPO_URL)} icon={<Icon icon="solar:arrow-right-up-linear" className="text-sm" />}>
            Skills Registry
          </Button>
          <Button variant="secondary" onClick={() => navigate('/builds')} icon={<Icon icon="solar:hammer-linear" className="text-sm" />}>
            Build
          </Button>
        </div>
      }
    >
      <div className="px-[24px] py-[20px] max-w-[900px] mx-auto w-full">
        <div className="flex flex-col gap-[16px]">
          <p className="text-[12px] text-foreground/70 leading-[1.6]">
            The Skills service packages reusable Alis Build workflows as structured skills — discoverable by coding
            agents via MCP. Skills provide step-by-step guidance that agents follow to implement Alis Build patterns.
          </p>

          {/* Stage nav */}
          <div className="flex items-stretch gap-0 border border-border rounded-[4px] overflow-hidden">
            {stages.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setSelectedStage(s.id)}
                className={`flex-1 flex flex-col items-start px-[14px] py-[10px] transition-all border-r last:border-r-0 border-border ${
                  selectedStage === s.id ? 'bg-brand-fill/8' : 'bg-card hover:bg-accent'
                }`}
              >
                <div className="flex items-center gap-[6px] mb-[2px]">
                  <div className={`size-[16px] rounded-full border flex items-center justify-center shrink-0 ${
                    selectedStage === s.id ? 'bg-brand-fill/20 border-brand-fill' : 'border-border'
                  }`}>
                    <span className={`text-[8px] font-bold font-mono ${selectedStage === s.id ? 'text-brand' : 'text-foreground/40'}`}>{i + 1}</span>
                  </div>
                  <span className={`text-[9px] font-bold uppercase font-mono ${selectedStage === s.id ? 'text-brand' : 'text-foreground/35'}`}>{s.eyebrow}</span>
                </div>
                <span className={`text-[11px] font-bold font-mono ${selectedStage === s.id ? 'text-foreground' : 'text-foreground/60'}`}>{s.title}</span>
              </button>
            ))}
          </div>

          {selectedStage === 'overview' && (
            <StageCard title="Skill Registry" icon={<Icon icon="solar:layers-linear" className="text-brand" />}>
              <p className="text-[11px] text-foreground/60 mb-[12px] leading-[1.5]">
                Skills are structured SKILL.md files stored in a Git repository. The Skills service syncs this
                repository into a registry that coding agents can query via MCP to discover and load skills on demand.
              </p>
              <div className="flex flex-col gap-[8px]">
                {[
                  { icon: 'solar:document-text-linear', title: 'Skills are SKILL.md files', desc: 'Each skill is a markdown file with metadata, step-by-step instructions, and optional scripts or references.' },
                  { icon: 'solar:refresh-linear', title: 'Synced from a Git repo', desc: 'The Skills service watches a Git repository and syncs skills into a queryable registry.' },
                  { icon: 'solar:server-minimalistic-linear', title: 'Exposed via MCP', desc: 'Agents use the Skills MCP tools to list, load, and follow skill instructions at runtime.' },
                ].map((item) => (
                  <div key={item.title} className="flex items-start gap-[10px] px-[12px] py-[10px] bg-muted border border-border rounded-[4px]">
                    <Icon icon={item.icon} className="text-brand text-[14px] shrink-0 mt-[1px]" />
                    <div>
                      <p className="text-[11px] font-bold text-foreground">{item.title}</p>
                      <p className="text-[10px] text-foreground/50 mt-[2px]">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-[12px] flex items-center gap-[8px]">
                <Button variant="secondary" onClick={() => Browser.OpenURL(SKILLS_REPO_URL)} icon={<Icon icon="solar:arrow-right-up-linear" className="text-sm" />}>
                  Browse Skills Registry
                </Button>
                <Button variant="ghost" onClick={() => setSelectedStage('prerequisites')} icon={<Icon icon="solar:alt-arrow-right-linear" className="text-sm" />} iconPosition="trailing">
                  Continue
                </Button>
              </div>
            </StageCard>
          )}

          {selectedStage === 'prerequisites' && (
            <StageCard step={2} title="Prerequisites" subtitle="Confirm the product and service for your Skills deployment" icon={<Icon icon="solar:checklist-linear" className="text-brand" />}>
              <p className="text-[11px] text-foreground/60 mb-[12px] leading-[1.5]">
                Before deploying a Skills service, confirm:
              </p>
              <div className="flex flex-col gap-[8px] mb-[14px]">
                {[
                  'You have an active product with a build repository',
                  'You have a skills repository (or will create one) following the SKILL.md format',
                  'Your target service has network access to the skills Git repository',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-[8px]">
                    <Icon icon="solar:point-on-map-linear" className="text-brand text-[12px] shrink-0 mt-[2px]" />
                    <span className="text-[11px] text-foreground/60">{item}</span>
                  </div>
                ))}
              </div>
              <Button variant="primary" onClick={() => setSelectedStage('service')} icon={<Icon icon="solar:alt-arrow-right-linear" className="text-sm" />} iconPosition="trailing">
                Continue to Service Setup
              </Button>
            </StageCard>
          )}

          {selectedStage === 'service' && (
            <StageCard step={3} title="Skills Service" subtitle="Install, define, build, and deploy the Skills codeblock" icon={<Icon icon="solar:book-2-linear" className="text-brand" />}>
              <p className="text-[11px] text-foreground/60 mb-[12px] leading-[1.5]">
                Install the Skills codeblock into your service via the VS Code extension, then use the standard Alis
                Build workflow to define, build, and deploy.
              </p>
              <div className="flex flex-col gap-[8px] mb-[14px]">
                {[
                  { n: 1, label: 'Install Skills codeblock', desc: 'Add the Skills codeblock to your service via the VS Code extension.' },
                  { n: 2, label: 'Configure repository URL', desc: 'Set the SKILL_REPOSITORY_URL environment variable to point to your skills Git repo.' },
                  { n: 3, label: 'Build & Deploy', desc: 'Build the service image and deploy it to your environment.' },
                ].map((item) => (
                  <div key={item.n} className="flex gap-[10px]">
                    <div className="size-[20px] rounded-full bg-brand-fill/15 border border-brand-fill flex items-center justify-center shrink-0 mt-[1px]">
                      <span className="text-[9px] font-bold text-brand font-mono">{item.n}</span>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-foreground">{item.label}</p>
                      <p className="text-[10px] text-foreground/50">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-[8px]">
                <Button variant="primary" onClick={() => navigate('/builds')} icon={<Icon icon="solar:hammer-linear" className="text-sm" />}>
                  Build & Deploy
                </Button>
                <Button variant="ghost" onClick={() => setSelectedStage('next')} icon={<Icon icon="solar:alt-arrow-right-linear" className="text-sm" />} iconPosition="trailing">
                  Next Steps
                </Button>
              </div>
            </StageCard>
          )}

          {selectedStage === 'next' && (
            <StageCard step={4} title="Next Steps" subtitle="Suggested agent prompts for using your Skills service" icon={<Icon icon="solar:lightbulb-linear" className="text-brand" />}>
              <p className="text-[11px] text-foreground/60 mb-[12px] leading-[1.5]">
                Once deployed, use these prompts with your coding agent (Claude Code, Gemini CLI, etc.) to leverage the
                Skills registry:
              </p>
              <div className="flex flex-col gap-[8px]">
                {suggestedPrompts.map((p) => (
                  <div key={p.title} className="p-[12px] bg-muted border border-border rounded-[4px]">
                    <div className="flex items-center justify-between mb-[6px]">
                      <p className="text-[11px] font-bold text-foreground font-mono">{p.title}</p>
                      <button
                        onClick={() => copyPrompt(p.title, p.prompt)}
                        className="flex items-center gap-[4px] text-[10px] text-foreground/40 hover:text-foreground transition-colors px-[6px] py-[2px] rounded-[3px] hover:bg-foreground/5"
                      >
                        <Icon icon={copied === p.title ? 'solar:check-linear' : 'solar:copy-linear'} className="text-[11px]" />
                        {copied === p.title ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <p className="text-[10px] text-foreground/55 leading-[1.5]">{p.prompt}</p>
                  </div>
                ))}
              </div>
            </StageCard>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
