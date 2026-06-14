import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Browser } from '@wailsio/runtime';
import { Icon } from '@iconify/react';
import { PageLayout } from '../components/PageLayout';
import { CodeBlock } from '../components/CodeBlock';
import { Button } from '../components/Button';
import { StageCard } from '../components/StageCard';

const defineServiceCode = `// Your service responsible for various calculators.
service CalculationsService {
 ...
}`;

const defineMethodCode = `// Your service responsible for various calculators.
service CalculationsService {
  // Generates a random number within a specified inclusive range.
  rpc CalculateRandomNumber(CalculateRandomNumberRequest) returns (CalculateRandomNumberResponse) {}
}`;

const defineMessageCode = `// Request to generate a random number
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

const deployTerraformCode = `resource "google_cloud_run_v2_service" "default" {
  name     = "hello-v1"
  ...
}`;

const tryItOutCode = `func Test_Example(t *testing.T) {
    // Make a hit to the method.
    res, _ := HelloService.CalculateRandomNumber(t.Context(), &pb.CalculateRandomNumberRequest{
        Min: 2,
        Max: 170,
    })
    // Print the result
    fmt.Println(res)
}`;

function DbdDiagram() {
  const stages = [
    { label: 'Define', icon: 'solar:pen-linear', color: '#f881a9' },
    { label: 'Build', icon: 'solar:hammer-linear', color: '#f881a9' },
    { label: 'Deploy', icon: 'solar:cloud-upload-linear', color: '#f881a9' },
  ];
  return (
    <div className="flex items-center gap-0 my-[8px]">
      {stages.map((s, i) => (
        <div key={s.label} className="flex items-center">
          <div className="flex flex-col items-center gap-[6px] px-[16px] py-[12px] bg-[#2c2c2c] border border-[#464646] rounded-[4px]">
            <Icon icon={s.icon} className="text-[#f881a9] text-[18px]" />
            <span className="text-[10px] font-bold text-white font-['JetBrains_Mono',sans-serif] uppercase">{s.label}</span>
          </div>
          {i < stages.length - 1 && (
            <Icon icon="solar:alt-arrow-right-linear" className="text-[rgba(255,255,255,0.2)] text-[18px] mx-[8px]" />
          )}
        </div>
      ))}
    </div>
  );
}

function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      onClick={onChange}
      className="flex items-center gap-[8px] text-left py-[4px] group"
    >
      <div className={`size-[14px] rounded-[3px] border flex items-center justify-center shrink-0 transition-colors ${
        checked ? 'bg-[#f881a9] border-[#f881a9]' : 'border-[#555] group-hover:border-[#888]'
      }`}>
        {checked && <Icon icon="solar:check-linear" className="text-[#6f0025] text-[10px]" />}
      </div>
      <span className="text-[11px] text-[rgba(255,255,255,0.7)] leading-[1.4]">{label}</span>
    </button>
  );
}

function ActionAlert({ icon, title, description, action }: { icon: string; title: string; description: string; action: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-[12px] px-[14px] py-[12px] bg-[rgba(248,129,169,0.06)] border border-[rgba(248,129,169,0.2)] rounded-[4px] mt-[16px]">
      <div className="flex items-center gap-[12px]">
        <Icon icon={icon} className="text-[#f881a9] text-[18px] shrink-0" />
        <div>
          <p className="text-[11px] font-bold text-white font-['JetBrains_Mono',sans-serif]">{title}</p>
          <p className="text-[10px] text-[rgba(255,255,255,0.55)] mt-[1px]">{description}</p>
        </div>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

export function BuildKitCustomApisPage() {
  const navigate = useNavigate();
  const [defineUpdated, setDefineUpdated] = useState(false);
  const [defineCommitted, setDefineCommitted] = useState(false);
  const [buildUpdated, setBuildUpdated] = useState(false);
  const [buildCommitted, setBuildCommitted] = useState(false);
  const [deployReviewed, setDeployReviewed] = useState(false);

  return (
    <PageLayout
      title="Build Custom APIs"
      subtitle="Master the core Alis Build workflow to define, build, and deploy your own APIs."
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
            The core workflow of the Alis Build Platform revolves around the Define, Build, and Deploy (DBD)
            process. This cycle ensures your services are strictly defined, consistently built, and reliably deployed.
          </p>

          <DbdDiagram />

          {/* Quick Start */}
          <StageCard title="Quick Start" icon={<Icon icon="solar:rocket-launch-linear" className="text-[#f881a9]" />}>
            <p className="text-[11px] text-[rgba(255,255,255,0.6)] mb-[12px]">
              Your environment will be set up in three simple steps:
            </p>
            <div className="flex flex-col gap-[8px] mb-[16px]">
              {[
                { n: 1, title: 'A New Service is Created', sub: 'This gives your application a unique, dedicated place on the platform.' },
                { n: 2, title: 'Starter Code is Added', sub: 'We automatically fetch all the files and boilerplate code you need to begin.' },
                { n: 3, title: 'Your Workspace is Prepared', sub: 'Your local file system is automatically updated with your new service and starter code.' },
              ].map(({ n, title, sub }) => (
                <div key={n} className="flex gap-[10px]">
                  <div className="size-[20px] rounded-full bg-[rgba(248,129,169,0.15)] border border-[#f881a9] flex items-center justify-center shrink-0 mt-[1px]">
                    <span className="text-[9px] font-bold text-[#f881a9] font-['JetBrains_Mono',sans-serif]">{n}</span>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-white">{title}</p>
                    <p className="text-[10px] text-[rgba(255,255,255,0.5)] mt-[1px]">{sub}</p>
                  </div>
                </div>
              ))}
            </div>
            <ActionAlert
              icon="solar:rocket-launch-outline"
              title="Start the Demo!"
              description="Click Initialise Demo to set up your environment in the Alis console."
              action={
                <Button variant="primary" onClick={() => Browser.OpenURL('https://console.alisx.com')}>
                  Open Console
                </Button>
              }
            />
          </StageCard>

          {/* Define */}
          <StageCard
            step={1}
            title="Define: Defining Your API"
            subtitle="Define your API contract using Protocol Buffers"
          >
            <p className="text-[11px] text-[rgba(255,255,255,0.6)] mb-[12px] leading-[1.6]">
              In this step, you define your service's API contract using the{' '}
              <button onClick={() => Browser.OpenURL('https://protobuf.dev/')} className="text-[#f881a9] hover:underline">
                Protocol Buffers
              </button>{' '}
              (<code className="font-['JetBrains_Mono',sans-serif] text-[rgba(255,255,255,0.8)]">.proto</code>) language.
              Examine the contents of the <code className="font-['JetBrains_Mono',sans-serif] text-[rgba(255,255,255,0.8)]">hello.proto</code> file in your workspace.
            </p>

            <p className="text-[10px] font-bold text-[rgba(255,255,255,0.4)] uppercase font-['JetBrains_Mono',sans-serif] mb-[4px] mt-[12px]">
              1. The Service: CalculationsService
            </p>
            <p className="text-[11px] text-[rgba(255,255,255,0.55)] mb-[6px]">
              The <code className="font-['JetBrains_Mono',sans-serif]">service</code> block is the container for all related functions, similar to a class or interface in other languages.
            </p>
            <CodeBlock code={defineServiceCode} language="protobuf" />

            <p className="text-[10px] font-bold text-[rgba(255,255,255,0.4)] uppercase font-['JetBrains_Mono',sans-serif] mb-[4px] mt-[16px]">
              2. The Method (RPC): CalculateRandomNumber
            </p>
            <p className="text-[11px] text-[rgba(255,255,255,0.55)] mb-[6px]">
              The <code className="font-['JetBrains_Mono',sans-serif]">rpc</code> keyword defines a Remotely Callable Function (a method on the service).
            </p>
            <CodeBlock code={defineMethodCode} language="protobuf" />

            <p className="text-[10px] font-bold text-[rgba(255,255,255,0.4)] uppercase font-['JetBrains_Mono',sans-serif] mb-[4px] mt-[16px]">
              3. The Messages (Data Contract)
            </p>
            <p className="text-[11px] text-[rgba(255,255,255,0.55)] mb-[6px]">
              <code className="font-['JetBrains_Mono',sans-serif]">message</code> blocks define the strongly-typed data structures (request and response) that travel to and from the service.
            </p>
            <CodeBlock code={defineMessageCode} language="protobuf" />

            <div className="flex flex-col gap-[4px] mt-[16px]">
              <Checkbox
                checked={defineUpdated}
                onChange={() => setDefineUpdated(!defineUpdated)}
                label="I have updated my .proto file with the relevant definitions"
              />
              <Checkbox
                checked={defineCommitted}
                onChange={() => setDefineCommitted(!defineCommitted)}
                label="I have committed the changes to git"
              />
            </div>
            <ActionAlert
              icon="solar:lock-linear"
              title="Lock in your Definition!"
              description="Run the Define command to scaffold the proto definition."
              action={
                <Button
                  variant="primary"
                  disabled={!defineUpdated || !defineCommitted}
                  onClick={() => Browser.OpenURL('https://console.alisx.com')}
                >
                  Define
                </Button>
              }
            />
          </StageCard>

          {/* Build */}
          <StageCard
            step={2}
            title="Build: Implementing the Logic"
            subtitle="Write the code that fulfils the API contract"
          >
            <p className="text-[11px] text-[rgba(255,255,255,0.6)] mb-[12px] leading-[1.6]">
              In the previous Define step, we created the service definitions. Now, we use those definitions
              (in this case, in <code className="font-['JetBrains_Mono',sans-serif]">golang</code>) as the blueprint for our logic.
            </p>
            <p className="text-[11px] text-[rgba(255,255,255,0.55)] mb-[6px]">
              Example: implementing the business logic to calculate the random number.
            </p>
            <CodeBlock code={buildGoCode} language="go" />

            <div className="flex flex-col gap-[4px] mt-[16px]">
              <Checkbox
                checked={buildUpdated}
                onChange={() => setBuildUpdated(!buildUpdated)}
                label="I have updated my 'methods.go' file with the relevant business logic"
              />
              <Checkbox
                checked={buildCommitted}
                onChange={() => setBuildCommitted(!buildCommitted)}
                label="I have committed the changes to git"
              />
            </div>
            <ActionAlert
              icon="solar:hammer-wrench-linear"
              title="Build your service!"
              description="After committing, click Build to transform your code into a deployable artifact."
              action={
                <Button
                  variant="primary"
                  disabled={!buildUpdated || !buildCommitted}
                  onClick={() => navigate('/builds')}
                >
                  Build
                </Button>
              }
            />
          </StageCard>

          {/* Deploy */}
          <StageCard
            step={3}
            title="Deploy: Configure & Deploy Infrastructure"
            subtitle="Use Terraform to provision and deploy your service"
          >
            <p className="text-[11px] text-[rgba(255,255,255,0.6)] mb-[12px] leading-[1.6]">
              The Deploy step is where you configure the infrastructure for your service. We use{' '}
              <button onClick={() => Browser.OpenURL('https://developer.hashicorp.com/terraform')} className="text-[#f881a9] hover:underline">
                Terraform
              </button>{' '}
              to define our infrastructure as code, ensuring a consistent and repeatable deployment.
              Your service infrastructure is defined in the{' '}
              <code className="font-['JetBrains_Mono',sans-serif] text-[rgba(255,255,255,0.8)]">cloudrun.tf</code> file.
            </p>
            <CodeBlock code={deployTerraformCode} language="hcl" />

            <div className="flex flex-col gap-[4px] mt-[16px]">
              <Checkbox
                checked={deployReviewed}
                onChange={() => setDeployReviewed(!deployReviewed)}
                label="I have reviewed the infrastructure files in my 'Deploy' workspace"
              />
            </div>
            <ActionAlert
              icon="solar:cloud-upload-linear"
              title="Deploy your service!"
              description="Click Deploy to provision the specified infrastructure."
              action={
                <Button
                  variant="primary"
                  disabled={!deployReviewed}
                  onClick={() => navigate('/builds')}
                >
                  Deploy
                </Button>
              }
            />
          </StageCard>

          {/* Try it Out */}
          <StageCard
            step={4}
            title="Try it Out: The Playground"
            subtitle="Confirm your deployed service works end-to-end"
          >
            <p className="text-[11px] text-[rgba(255,255,255,0.6)] mb-[12px] leading-[1.6]">
              Your service is now deployed to Google Cloud Run! The final step is to confirm that your implemented
              logic works end-to-end. Navigate to the{' '}
              <code className="font-['JetBrains_Mono',sans-serif] text-[rgba(255,255,255,0.8)]">.playground</code> folder in your workspace.
              Inside, the file{' '}
              <code className="font-['JetBrains_Mono',sans-serif] text-[rgba(255,255,255,0.8)]">main_test.go</code> contains boilerplate code to call the deployed service. Add the following:
            </p>
            <CodeBlock code={tryItOutCode} language="go" />

            <div className="mt-[12px] text-[11px] text-[rgba(255,255,255,0.55)] leading-[1.6]">
              This test will:
              <ol className="ml-[16px] mt-[6px] flex flex-col gap-[3px] list-decimal">
                <li>Connect to your live Cloud Run endpoint</li>
                <li>Send the <code className="font-['JetBrains_Mono',sans-serif]">CalculateRandomNumberRequest</code> with your configured min and max values</li>
                <li>Receive and print the resulting random number</li>
              </ol>
            </div>

            <div className="mt-[16px] px-[14px] py-[12px] bg-[rgba(52,199,89,0.06)] border border-[rgba(52,199,89,0.2)] rounded-[4px]">
              <div className="flex items-center gap-[8px]">
                <Icon icon="solar:check-circle-linear" className="text-[#34C759] text-[18px] shrink-0" />
                <div>
                  <p className="text-[11px] font-bold text-white font-['JetBrains_Mono',sans-serif]">Congratulations!</p>
                  <p className="text-[10px] text-[rgba(255,255,255,0.55)] mt-[1px]">
                    Once you see a successful result, you've completed the full Define, Build, and Deploy workflow.
                  </p>
                </div>
              </div>
            </div>
          </StageCard>
        </div>
      </div>
    </PageLayout>
  );
}
