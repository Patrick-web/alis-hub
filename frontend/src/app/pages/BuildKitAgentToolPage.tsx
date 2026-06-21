import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@iconify/react';
import { PageLayout } from '../components/PageLayout';
import { CodeBlock } from '../components/CodeBlock';
import { Button } from '../components/Button';
import { StageCard } from '../components/StageCard';

const defineProtoCode = `syntax = "proto3";

package myorg.myproduct.tools.v1;

// CalculatorService is responsible for providing specific calculations to your agent.
service CalculatorService {
  // Generates a random number within a specified inclusive range.
  rpc CalculateRandomNumber(CalculateRandomNumberRequest) returns (CalculateRandomNumberResponse) {}
}

// Request to generate a random number
message CalculateRandomNumberRequest {
  // The minimum value
  double min = 1;
  // The maximum value
  double max = 2;
}

// Response containing the random number
message CalculateRandomNumberResponse {
  // The random number generated
  double result = 1;
}`;

const buildGoCode = `func (s *server) CalculateRandomNumber(ctx context.Context, req *pb.CalculateRandomNumberRequest) (*pb.CalculateRandomNumberResponse, error) {

    // Generate a random number between min and max (inclusive)
    randomNumber := rand.Float64()*(req.GetMax()-req.GetMin()) + req.GetMin()

    return &pb.CalculateRandomNumberResponse{
        Result: randomNumber,
    }, nil
}`;

const deployTfCode = `resource "google_cloud_run_v2_service" "default" {
  name     = "hello-v1"
  ...
}`;

const registerToolsCode = `func RetrieveUsersByEmailTool() tool.Tool {
    return rpctool.NewUnary(functiontool.Config{
        Name:          pbUsers.UsersService_RetrieveUserByEmail_FullMethodName,
        Description:   pbUsers.UsersService_RetrieveUserByEmail_FullMethodDescription,
        InputSchema:   (&pbUsers.RetrieveUserByEmailRequest{}).JsonSchema(),
        OutputSchema:  (&pbUsers.User{}).JsonSchema(),
        IsLongRunning: false,
    }, clients.Users.RetrieveUserByEmail, nil)
}`;

const registerAgentCode = `// In your agent.go file, register your new tool:
return llmagent.New(llmagent.Config{
    Name:  appName,
    Model: model,
    Tools: []tool.Tool{
        RetrieveUsersByEmailTool(), // ← your new tool
    },
})`;

function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button onClick={onChange} className="flex items-center gap-[8px] text-left py-[4px] group">
      <div className={`size-[14px] rounded-[3px] border flex items-center justify-center shrink-0 transition-colors ${
        checked ? 'bg-brand border-brand' : 'border-border group-hover:border-border'
      }`}>
        {checked && <Icon icon="solar:check-linear" className="text-brand-foreground text-[10px]" />}
      </div>
      <span className="text-[11px] text-[rgba(255,255,255,0.7)] leading-[1.4]">{label}</span>
    </button>
  );
}

function ActionAlert({ icon, title, description, action }: { icon: string; title: string; description: string; action: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-[12px] px-[14px] py-[12px] bg-[rgba(248,129,169,0.06)] border border-[rgba(248,129,169,0.2)] rounded-[4px] mt-[16px]">
      <div className="flex items-center gap-[12px]">
        <Icon icon={icon} className="text-brand text-[18px] shrink-0" />
        <div>
          <p className="text-[11px] font-bold text-white font-mono">{title}</p>
          <p className="text-[10px] text-[rgba(255,255,255,0.55)] mt-[1px]">{description}</p>
        </div>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

function AddToolDiagram() {
  const stages = [
    { n: 1, label: 'Define', icon: 'solar:pen-linear' },
    { n: 2, label: 'Build', icon: 'solar:hammer-linear' },
    { n: 3, label: 'Deploy', icon: 'solar:cloud-upload-linear' },
    { n: 4, label: 'Register', icon: 'solar:link-linear' },
  ];
  return (
    <div className="flex items-center gap-0 my-[8px]">
      {stages.map((s, i) => (
        <div key={s.label} className="flex items-center">
          <div className="flex flex-col items-center gap-[6px] px-[14px] py-[10px] bg-card border border-border rounded-[4px]">
            <div className="flex items-center gap-[6px]">
              <div className="size-[18px] rounded-full bg-[rgba(248,129,169,0.15)] border border-brand flex items-center justify-center shrink-0">
                <span className="text-[8px] font-bold text-brand font-mono">{s.n}</span>
              </div>
              <Icon icon={s.icon} className="text-brand text-[14px]" />
            </div>
            <span className="text-[9px] font-bold text-white font-mono uppercase">{s.label}</span>
          </div>
          {i < stages.length - 1 && (
            <Icon icon="solar:alt-arrow-right-linear" className="text-[rgba(255,255,255,0.2)] text-[16px] mx-[6px]" />
          )}
        </div>
      ))}
    </div>
  );
}

export function BuildKitAgentToolPage() {
  const navigate = useNavigate();
  const [defineUpdated, setDefineUpdated] = useState(false);
  const [defineCommitted, setDefineCommitted] = useState(false);
  const [buildUpdated, setBuildUpdated] = useState(false);
  const [buildCommitted, setBuildCommitted] = useState(false);
  const [toolRegistered, setToolRegistered] = useState(false);
  const [toolCommitted, setToolCommitted] = useState(false);

  return (
    <PageLayout
      title="Develop an Agent Tool"
      subtitle="Weave Capability into your Agent"
      parentRoute="/buildkit"
      actions={
        <div className="flex items-center gap-[6px]">
          <Button variant="secondary" onClick={() => navigate('/builds')}>
            <Icon icon="solar:hammer-linear" className="text-sm mr-[4px]" />
            Build
          </Button>
          <Button variant="secondary" onClick={() => navigate('/builds')}>
            <Icon icon="solar:cloud-upload-linear" className="text-sm mr-[4px]" />
            Deploy
          </Button>
        </div>
      }
    >
      <div className="px-[24px] py-[20px] max-w-[900px] mx-auto w-full">
        <div className="flex flex-col gap-[16px]">
          <p className="text-[12px] text-[rgba(255,255,255,0.7)] leading-[1.6]">
            Unlock the full potential of your AI Agent by transforming it into a versatile operator capable of
            interacting with the world. By giving it Tools, you equip your Agent with callable methods that it can
            autonomously invoke to perform complex actions, retrieve real-time data, or interact with external systems.
          </p>

          <div>
            <p className="text-[11px] font-bold text-white uppercase font-mono mb-[8px]">The 4-Stage Process</p>
            <AddToolDiagram />
          </div>

          {/* Prerequisites */}
          <StageCard
            title="Prerequisites"
            icon={<Icon icon="solar:checklist-linear" className="text-brand" />}
          >
            <p className="text-[11px] text-[rgba(255,255,255,0.6)] mb-[12px] leading-[1.6]">
              Note that a Tool is <strong>not built within the Agent service</strong>, but rather built in its own
              service independently from the Agent, and then registered with the Agent only once deployed.
            </p>
            <div className="flex flex-col gap-[8px] mb-[16px]">
              <div className="flex gap-[10px]">
                <div className="size-[20px] rounded-full bg-[rgba(248,129,169,0.15)] border border-brand flex items-center justify-center shrink-0 mt-[1px]">
                  <span className="text-[9px] font-bold text-brand font-mono">1</span>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-white">Confirm/Configure the Host Service</p>
                  <p className="text-[10px] text-[rgba(255,255,255,0.5)]">Create a new service with boilerplate code or select an existing one to host your tool's logic.</p>
                </div>
              </div>
              <div className="flex gap-[10px]">
                <div className="size-[20px] rounded-full bg-[rgba(248,129,169,0.15)] border border-brand flex items-center justify-center shrink-0 mt-[1px]">
                  <span className="text-[9px] font-bold text-brand font-mono">2</span>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-white">Prepare your Workspace</p>
                  <p className="text-[10px] text-[rgba(255,255,255,0.5)]">Your local file system is automatically updated with the necessary services and code.</p>
                </div>
              </div>
            </div>
            <ActionAlert
              icon="solar:rocket-launch-outline"
              title="Start Building your Tool!"
              description="Click Get Started to prepare your environment."
              action={
                <Button variant="primary" onClick={() => navigate('/agents')}>
                  Get Started
                </Button>
              }
            />
          </StageCard>

          {/* Define */}
          <StageCard
            step={1}
            title="Define your Tool: Laying the Foundation"
            subtitle="Define inputs, outputs, and documentation in .proto"
          >
            <p className="text-[11px] text-[rgba(255,255,255,0.6)] mb-[12px] leading-[1.6]">
              Every powerful tool begins with a clear definition. You precisely define the tool's interface and
              capabilities in your Protocol Buffer (.proto) file. Specify what data the tool requires (inputs) and the
              structure of the information it will return (outputs). Embed rich, descriptive comments — these are vital
              instructions that explain the tool's purpose to the Agent.
            </p>
            <p className="text-[10px] font-bold text-[rgba(255,255,255,0.4)] uppercase font-mono mb-[4px]">Example</p>
            <CodeBlock code={defineProtoCode} language="protobuf" />

            <div className="flex flex-col gap-[4px] mt-[16px]">
              <Checkbox checked={defineUpdated} onChange={() => setDefineUpdated(!defineUpdated)} label="I have updated my .proto file with the relevant definitions" />
              <Checkbox checked={defineCommitted} onChange={() => setDefineCommitted(!defineCommitted)} label="I have committed the changes to git" />
            </div>
            <ActionAlert
              icon="solar:lock-linear"
              title="Lock in your Definition!"
              description="Click Define to scaffold the proto definition."
              action={
                <Button variant="primary" disabled={!defineUpdated || !defineCommitted} onClick={() => navigate('/builds')}>
                  Define
                </Button>
              }
            />
          </StageCard>

          {/* Build */}
          <StageCard
            step={2}
            title="Build your Tool: Implement the Logic"
            subtitle="Write the backend code that performs the tool's task"
          >
            <p className="text-[11px] text-[rgba(255,255,255,0.6)] mb-[12px] leading-[1.6]">
              With the tool's interface defined, the next step is to write the actual code that performs its designated
              task. This involves developing the backend logic in your chosen server-side language (e.g., Go).
            </p>
            <p className="text-[10px] font-bold text-[rgba(255,255,255,0.4)] uppercase font-mono mb-[4px]">Example</p>
            <CodeBlock code={buildGoCode} language="go" />

            <div className="flex flex-col gap-[4px] mt-[16px]">
              <Checkbox checked={buildUpdated} onChange={() => setBuildUpdated(!buildUpdated)} label="I have updated my methods.go file with the relevant business logic" />
              <Checkbox checked={buildCommitted} onChange={() => setBuildCommitted(!buildCommitted)} label="I have committed the changes to git" />
            </div>
            <ActionAlert
              icon="solar:hammer-wrench-linear"
              title="Build your Tool!"
              description="Click Build to start building artefacts with your business logic."
              action={
                <Button variant="primary" disabled={!buildUpdated || !buildCommitted} onClick={() => navigate('/builds')}>
                  Build
                </Button>
              }
            />
          </StageCard>

          {/* Deploy */}
          <StageCard
            step={3}
            title="Deploy your Tool: Making Your Tool Accessible"
            subtitle="Package and deploy your service to the cloud"
          >
            <p className="text-[11px] text-[rgba(255,255,255,0.6)] mb-[12px] leading-[1.6]">
              Once the tool's logic is fully implemented and tested, it's ready for deployment. This involves packaging
              your code as a service and deploying it to your chosen cloud environment, ensuring your tool is always
              available and scalable.
            </p>
            <p className="text-[10px] font-bold text-[rgba(255,255,255,0.4)] uppercase font-mono mb-[4px]">Example</p>
            <CodeBlock code={deployTfCode} language="hcl" />

            <ActionAlert
              icon="solar:cloud-upload-linear"
              title="Deploy your Tool!"
              description="Click Deploy to ship your service."
              action={
                <Button variant="primary" onClick={() => navigate('/builds')}>
                  Deploy
                </Button>
              }
            />
          </StageCard>

          {/* Register */}
          <StageCard
            step={4}
            title="Register your Tool: Weave the Capability"
            subtitle="Connect your deployed tool to your Agent"
          >
            <p className="text-[11px] text-[rgba(255,255,255,0.6)] mb-[12px] leading-[1.6]">
              The final step connects your new, deployed tool directly to your Agent. You register this new capability
              within your Agent's configuration. This crucial registration allows your Agent to discover the tool's
              existence, understand its purpose (from your .proto documentation), and intelligently determine when and
              how to invoke it.
            </p>
            <p className="text-[10px] font-bold text-[rgba(255,255,255,0.4)] uppercase font-mono mb-[4px]">In your tools.go file:</p>
            <CodeBlock code={registerToolsCode} language="go" className="mb-[12px]" />
            <p className="text-[10px] font-bold text-[rgba(255,255,255,0.4)] uppercase font-mono mb-[4px]">In your agent.go file:</p>
            <CodeBlock code={registerAgentCode} language="go" />

            <div className="flex flex-col gap-[4px] mt-[16px]">
              <Checkbox checked={toolRegistered} onChange={() => setToolRegistered(!toolRegistered)} label="I have registered my Tool with my Agent as per the above example" />
              <Checkbox checked={toolCommitted} onChange={() => setToolCommitted(!toolCommitted)} label="I have committed my Agent changes to git" />
            </div>
            <ActionAlert
              icon="solar:magic-stick-linear"
              title="Register your Tool!"
              description="Click Build & Deploy to add it to your agent."
              action={
                <Button variant="primary" disabled={!toolRegistered || !toolCommitted} onClick={() => navigate('/builds')}>
                  Build & Deploy
                </Button>
              }
            />
          </StageCard>
        </div>
      </div>
    </PageLayout>
  );
}
