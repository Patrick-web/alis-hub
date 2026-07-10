import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@iconify/react';
import { Browser } from '@wailsio/runtime';
import { PageLayout } from '../components/PageLayout';
import { CodeBlock } from '../components/CodeBlock';
import { Button } from '../components/Button';
import { StageCard } from '../components/StageCard';

const registerToolsCode = `// This method converts your tool into something the Agent can understand
func RetrieveUsersByEmailTool() tool.Tool {
    return rpctool.NewUnary(functiontool.Config{
        Name:          pbUsers.UsersService_RetrieveUserByEmail_FullMethodName,
        Description:   pbUsers.UsersService_RetrieveUserByEmail_FullMethodDescription,
        InputSchema:   (&pbUsers.RetrieveUserByEmailRequest{}).JsonSchema(),
        OutputSchema:  (&pbUsers.User{}).JsonSchema(),
        IsLongRunning: false,
    }, clients.Users.RetrieveUserByEmail, nil)
}`;

const registerAgentCode = `// Builds an Agent using Agent Development Kit (ADK)
func buildAgent(ctx context.Context) (agent.Agent, error) {
    model, err := gemini.NewModel(ctx, "gemini-2.5-flash", &genai.ClientConfig{
        Backend:  genai.BackendVertexAI,
        Project:  os.Getenv("ALIS_OS_PROJECT"),
        Location: os.Getenv("GOOGLE_CLOUD_LOCATION"),
    })
    if err != nil {
        return nil, err
    }

    return llmagent.New(llmagent.Config{
        Name:        appName,
        Model:       model,
        Description: "Help users with time related queries",
        Instruction: "You are an intelligent assistant...",
        Tools: []tool.Tool{
            RetrieveUsersByEmailTool(),
        },
    })
}`;

function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button onClick={onChange} className="flex items-center gap-[8px] text-left py-[4px] group">
      <div className={`size-[14px] rounded-[3px] border flex items-center justify-center shrink-0 transition-colors ${
        checked ? 'bg-brand-fill border-brand-fill' : 'border-border group-hover:border-border'
      }`}>
        {checked && <Icon icon="solar:check-linear" className="text-brand-foreground text-[10px]" />}
      </div>
      <span className="text-[11px] text-foreground/70 leading-[1.4]">{label}</span>
    </button>
  );
}

function ActionAlert({ icon, title, description, action }: { icon: string; title: string; description: string; action: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-[12px] px-[14px] py-[12px] bg-brand-fill/6 border border-brand-fill/20 rounded-[4px] mt-[16px]">
      <div className="flex items-center gap-[12px]">
        <Icon icon={icon} className="text-brand text-[18px] shrink-0" />
        <div>
          <p className="text-[11px] font-bold text-foreground font-mono">{title}</p>
          <p className="text-[10px] text-foreground/55 mt-[1px]">{description}</p>
        </div>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

export function BuildKitAgentPage() {
  const navigate = useNavigate();
  const [toolRegistered, setToolRegistered] = useState(false);
  const [toolCommitted, setToolCommitted] = useState(false);

  return (
    <PageLayout
      title="Manage your Agent"
      subtitle="Automated Scaffolding, Total Control"
      parentRoute="/buildkit"
      actions={
        <Button variant="primary" onClick={() => navigate('/agents')} icon={<Icon icon="solar:rocket-launch-linear" className="text-sm" />}>
          Initialise Agent
        </Button>
      }
    >
      <div className="px-[24px] py-[20px] max-w-[900px] mx-auto w-full">
        <div className="flex flex-col gap-[16px]">

          {/* Section 1: Initialise Agent */}
          <div>
            <h2 className="text-[16px] font-bold text-foreground mb-[12px]">Don't have an agent?</h2>
            <div className="border-b border-border mb-[16px]" />

            <p className="text-[12px] text-foreground/70 leading-[1.6] mb-[16px]">
              Begin your journey by creating a new Agent within the Alis Build ecosystem. This process is designed to be
              transparent and automated, giving you a powerful starting point without hiding the details. The
              initialisation process takes a few minutes as the system automatically creates your dedicated agent service,
              scaffolds the necessary infrastructure code, and verifies dependencies. This is a one-time setup.
            </p>

            <StageCard
              title="Establish your Agent's Identity"
              icon={<Icon icon="solar:user-id-linear" className="text-brand" />}
            >
              <p className="text-[11px] text-foreground/60 mb-[10px]">You will be prompted to provide:</p>
              <div className="flex flex-col gap-[8px]">
                <div className="flex gap-[10px]">
                  <Icon icon="solar:user-circle-linear" className="text-brand text-[16px] shrink-0 mt-[1px]" />
                  <div>
                    <p className="text-[11px] font-bold text-foreground">Name</p>
                    <p className="text-[10px] text-foreground/50">A unique identifier for your agent (e.g., <code className="font-mono">joe</code>).</p>
                  </div>
                </div>
                <div className="flex gap-[10px]">
                  <Icon icon="solar:tag-linear" className="text-brand text-[16px] shrink-0 mt-[1px]" />
                  <div>
                    <p className="text-[11px] font-bold text-foreground">Tagline</p>
                    <p className="text-[10px] text-foreground/50">A tagline outlining your agent's capabilities and purpose.</p>
                  </div>
                </div>
              </div>
            </StageCard>

            <div className="mt-[12px]">
              <StageCard
                title="Infrastructure & Visibility"
                icon={<Icon icon="solar:eye-linear" className="text-brand" />}
              >
                <div className="flex flex-col gap-[8px]">
                  <div className="flex gap-[10px]">
                    <Icon icon="solar:eye-linear" className="text-brand text-[16px] shrink-0 mt-[1px]" />
                    <div>
                      <p className="text-[11px] font-bold text-foreground">Total Control</p>
                      <p className="text-[10px] text-foreground/50">All generated files are visible in your file explorer. You own the code.</p>
                    </div>
                  </div>
                  <div className="flex gap-[10px]">
                    <Icon icon="solar:code-square-linear" className="text-brand text-[16px] shrink-0 mt-[1px]" />
                    <div>
                      <p className="text-[11px] font-bold text-foreground">No Black Boxes</p>
                      <p className="text-[10px] text-foreground/50">Glass Box development — you can inspect, modify, and extend every part of the generated setup.</p>
                    </div>
                  </div>
                </div>
              </StageCard>
            </div>

            <div className="mt-[12px]">
              <StageCard
                title="Automated Build & Deploy"
                icon={<Icon icon="solar:rocket-launch-linear" className="text-brand" />}
              >
                <div className="flex flex-col gap-[8px]">
                  <div className="flex gap-[10px]">
                    <Icon icon="solar:box-minimalistic-linear" className="text-brand text-[16px] shrink-0 mt-[1px]" />
                    <div>
                      <p className="text-[11px] font-bold text-foreground">Artifact Build</p>
                      <p className="text-[10px] text-foreground/50">We automatically compile and prepare the deployment artifacts.</p>
                    </div>
                  </div>
                  <div className="flex gap-[10px]">
                    <Icon icon="solar:rocket-launch-linear" className="text-brand text-[16px] shrink-0 mt-[1px]" />
                    <div>
                      <p className="text-[11px] font-bold text-foreground">Deployment</p>
                      <p className="text-[10px] text-foreground/50">Your agent is immediately deployed to the development environment, making it live and testable.</p>
                    </div>
                  </div>
                </div>
              </StageCard>
            </div>

            <ActionAlert
              icon="solar:rocket-launch-linear"
              title="Create your Agent!"
              description="Click Initialise Agent to begin the setup process."
              action={
                <Button variant="primary" onClick={() => navigate('/agents')}>
                  Initialise Agent
                </Button>
              }
            />
          </div>

          {/* Section 2: Add Tool to Agent */}
          <div>
            <h2 className="text-[16px] font-bold text-foreground mb-[12px] mt-[16px]">Add your Tool to your Agent</h2>
            <div className="border-b border-border mb-[16px]" />

            <StageCard
              title="Weave the Capability"
              icon={<Icon icon="solar:link-linear" className="text-brand" />}
            >
              <p className="text-[11px] text-foreground/60 mb-[12px] leading-[1.6]">
                This step connects your new, deployed tool directly to your Agent. You register this new capability
                within your Agent's configuration. This crucial registration allows your Agent to discover the tool's
                existence, understand its purpose (from your .proto documentation), and intelligently determine when
                and how to invoke it.
              </p>

              <p className="text-[10px] font-bold text-foreground/40 uppercase font-mono mb-[4px]">
                In your agent's tools.go file:
              </p>
              <CodeBlock code={registerToolsCode} language="go" className="mb-[12px]" />

              <p className="text-[10px] font-bold text-foreground/40 uppercase font-mono mb-[4px]">
                In your agent's agent.go file:
              </p>
              <CodeBlock code={registerAgentCode} language="go" />

              <div className="flex flex-col gap-[4px] mt-[16px]">
                <Checkbox
                  checked={toolRegistered}
                  onChange={() => setToolRegistered(!toolRegistered)}
                  label="I have registered my Tool with my Agent as per the above example"
                />
                <Checkbox
                  checked={toolCommitted}
                  onChange={() => setToolCommitted(!toolCommitted)}
                  label="I have committed my Agent changes to git"
                />
              </div>

              <ActionAlert
                icon="solar:magic-stick-linear"
                title="Register your Tool!"
                description="Click Build & Deploy to update your agent with the new tool."
                action={
                  <Button
                    variant="primary"
                    disabled={!toolRegistered || !toolCommitted}
                    onClick={() => navigate('/builds')}
                  >
                    Build & Deploy
                  </Button>
                }
              />
            </StageCard>
          </div>

          {/* Publish to Gemini Enterprise */}
          <div>
            <h2 className="text-[16px] font-bold text-foreground mb-[12px] mt-[16px]">Publish to Gemini Enterprise</h2>
            <div className="border-b border-border mb-[16px]" />

            <StageCard
              title="Deploy, Scale, and Integrate"
              icon={<Icon icon="solar:stars-linear" className="text-brand" />}
            >
              <p className="text-[11px] text-foreground/60 mb-[12px] leading-[1.6]">
                Once your agent is initialized, built, and thoroughly tested, the final step is to make it
                operational and accessible across your organization by publishing it to Gemini Enterprise.
              </p>
              <div className="flex flex-col gap-[8px] mb-[16px]">
                {[
                  { icon: 'solar:layers-linear', title: 'Containerization', desc: 'Your agent code is packaged into a secure, production-ready container image.' },
                  { icon: 'solar:server-square-linear', title: 'Serverless Hosting', desc: 'Deployed to scalable serverless infrastructure with automatic scaling and zero-downtime.' },
                  { icon: 'solar:buildings-linear', title: 'Enterprise Registration', desc: 'Your agent is registered within the Gemini Enterprise platform for secure invocation.' },
                ].map(({ icon, title, desc }) => (
                  <div key={title} className="flex gap-[10px]">
                    <Icon icon={icon} className="text-brand text-[16px] shrink-0 mt-[1px]" />
                    <div>
                      <p className="text-[11px] font-bold text-foreground">{title}</p>
                      <p className="text-[10px] text-foreground/50">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <ActionAlert
                icon="solar:rocket-launch-linear"
                title="Publish to Gemini Enterprise"
                description="Make your agent available across your organization."
                action={
                  <Button variant="primary" onClick={() => Browser.OpenURL('https://console.alisx.com')}>
                    Publish
                  </Button>
                }
              />
            </StageCard>
          </div>

        </div>
      </div>
    </PageLayout>
  );
}
