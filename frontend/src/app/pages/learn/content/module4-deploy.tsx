import { LearningModule } from '../types';
import { GcpProvisioningDiagram } from '../diagrams/GcpProvisioningDiagram';

const endpointsConfigExample = `# Generated Endpoints config (grpc-service.yaml)
type: google.api.Service
config_version: 3

name: users-v1-abc123-uc.a.run.app

apis:
  - name: acme.payments.v1.PaymentsService

authentication:
  providers:
    - id: google_service_account
      jwks_uri: https://www.googleapis.com/robot/v1/metadata/x509/...
      issuer: your-service-account@project.iam.gserviceaccount.com
  rules:
    - selector: "*"
      requirements:
        - provider_id: google_service_account`;

export const module4: LearningModule = {
  id: 'module4',
  title: 'Deploy',
  subtitle: 'Provisioning GCP resources',
  icon: 'solar:cloud-upload-linear',
  steps: [
    {
      id: 'm4-s0',
      title: 'What alis deploy provisions',
      body: (
        <div className="flex flex-col gap-[12px]">
          <p className="text-[12px] text-[rgba(255,255,255,0.7)] leading-[1.7]">
            <code className="text-[#f881a9] text-[11px]">alis deploy</code> is a declarative operation.
            You describe the desired state (which image version, which environment) and alis figures out which
            GCP resources need to be created, updated, or left alone.
          </p>
          <p className="text-[12px] text-[rgba(255,255,255,0.7)] leading-[1.7]">
            A single deploy operation touches four categories of GCP resources:
          </p>
          <div className="flex flex-col gap-[8px]">
            {[
              {
                name: 'Cloud Run',
                colour: '#f881a9',
                desc: 'Creates or updates the Cloud Run service that runs your container. Configures CPU, memory limits, concurrency, and min/max instances.',
              },
              {
                name: 'Cloud Endpoints',
                colour: 'rgba(255,255,255,0.7)',
                desc: 'Deploys an Endpoints service configuration that acts as the API gateway. Handles JWT validation, request routing, and transcoding between HTTP/REST and gRPC.',
              },
              {
                name: 'IAM Bindings',
                colour: 'rgba(255,255,255,0.7)',
                desc: 'Grants the Cloud Run service account the minimum permissions it needs: read secrets, call downstream services, write logs.',
              },
              {
                name: 'Service APIs',
                colour: 'rgba(255,255,255,0.7)',
                desc: 'Enables required GCP APIs (Cloud Run, Cloud Build, Artifact Registry, etc.) if they are not already active in the project.',
              },
            ].map(({ name, colour, desc }) => (
              <div key={name} className="px-[14px] py-[12px] bg-[#252525] border border-[#464646] rounded-[4px]">
                <p className="text-[11px] font-bold font-['JetBrains_Mono',sans-serif] mb-[4px]" style={{ color: colour }}>
                  {name}
                </p>
                <p className="text-[11px] text-[rgba(255,255,255,0.55)] leading-[1.5]">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      ),
      diagram: <GcpProvisioningDiagram />,
    },
    {
      id: 'm4-s1',
      title: 'Cloud Run — the runtime',
      body: (
        <div className="flex flex-col gap-[12px]">
          <p className="text-[12px] text-[rgba(255,255,255,0.7)] leading-[1.7]">
            <strong className="text-white">Cloud Run</strong> is Google's serverless container runtime. Your Docker
            image is deployed as a Cloud Run service — a managed HTTPS endpoint that scales automatically
            from zero instances (when there's no traffic) to hundreds (under load).
          </p>
          <p className="text-[12px] text-[rgba(255,255,255,0.7)] leading-[1.7]">
            Key properties of a Cloud Run service deployed by alis:
          </p>
          <div className="flex flex-col gap-[6px]">
            {[
              { label: 'URL pattern', value: 'https://{neuron}-{hash}-{region}.run.app' },
              { label: 'Protocol', value: 'HTTP/2 (gRPC) and HTTP/1.1 (REST via transcoding)' },
              { label: 'Scaling', value: 'Min 0 (dev/staging) or 1 (production), max configurable' },
              { label: 'Region', value: 'Matches the environment region — set at product creation time' },
              { label: 'Identity', value: 'Runs as a dedicated service account with least-privilege IAM' },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-start gap-[10px] px-[10px] py-[8px] bg-[#1e1e1e] border border-[#464646] rounded-[4px]">
                <span className="text-[10px] font-['JetBrains_Mono',sans-serif] text-[rgba(255,255,255,0.4)] w-[110px] shrink-0">{label}</span>
                <span className="text-[10px] font-['JetBrains_Mono',sans-serif] text-[rgba(255,255,255,0.7)]">{value}</span>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: 'm4-s2',
      title: 'Cloud Endpoints — the API gateway',
      body: (
        <div className="flex flex-col gap-[12px]">
          <p className="text-[12px] text-[rgba(255,255,255,0.7)] leading-[1.7]">
            Every alis service sits behind{' '}
            <strong className="text-white">Google Cloud Endpoints</strong> (specifically the ESP — Extensible Service Proxy).
            The ESP is a sidecar container that runs alongside your Cloud Run service and intercepts every request.
          </p>
          <p className="text-[12px] text-[rgba(255,255,255,0.7)] leading-[1.7]">
            The ESP handles:
          </p>
          <div className="flex flex-col gap-[6px]">
            {[
              { task: 'Authentication', detail: 'Validates Google service account JWTs before requests reach your code.' },
              { task: 'Transcoding', detail: 'Converts REST/JSON requests to gRPC and responses back to JSON.' },
              { task: 'API metrics', detail: 'Reports latency, error rates, and quota usage to Cloud Monitoring.' },
              { task: 'Rate limiting', detail: 'Can enforce per-consumer quotas defined in your Endpoints config.' },
            ].map(({ task, detail }) => (
              <div key={task} className="flex items-start gap-[10px] px-[10px] py-[8px] bg-[#252525] border border-[#464646] rounded-[4px]">
                <div className="size-[6px] rounded-full bg-[#f881a9] mt-[5px] shrink-0" />
                <div>
                  <span className="text-[11px] font-bold text-white font-['JetBrains_Mono',sans-serif]">{task} </span>
                  <span className="text-[11px] text-[rgba(255,255,255,0.5)]">— {detail}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="px-[12px] py-[10px] bg-[#1e1e1e] border border-[#464646] rounded-[4px]">
            <div className="pb-[6px] mb-[6px] border-b border-[#464646]">
              <p className="text-[9px] text-[rgba(255,255,255,0.35)] uppercase font-bold font-['JetBrains_Mono',sans-serif]">
                Endpoints config (generated)
              </p>
            </div>
            <pre className="text-[10px] font-['JetBrains_Mono',sans-serif] text-[rgba(255,255,255,0.75)] leading-[1.6] whitespace-pre overflow-x-auto">
              {endpointsConfigExample}
            </pre>
          </div>
        </div>
      ),
    },
    {
      id: 'm4-s3',
      title: 'IAM — who can call what',
      body: (
        <div className="flex flex-col gap-[12px]">
          <p className="text-[12px] text-[rgba(255,255,255,0.7)] leading-[1.7]">
            <strong className="text-white">Identity and Access Management</strong> (IAM) is Google Cloud's
            permission system. alis configures IAM so that each service can only access what it needs —
            a principle called <em className="text-white">least privilege</em>.
          </p>
          <p className="text-[12px] text-[rgba(255,255,255,0.7)] leading-[1.7]">
            Each neuron gets its own <strong className="text-white">service account</strong> — a Google-managed
            identity used to authenticate service-to-service calls. When service A calls service B, it presents
            a short-lived JWT signed by its service account. Service B's Endpoints proxy validates the JWT
            against Google's key servers.
          </p>
          <div className="flex flex-col gap-[8px]">
            <p className="text-[11px] text-[rgba(255,255,255,0.45)] uppercase font-bold font-['JetBrains_Mono',sans-serif] tracking-wide">
              Common IAM roles alis assigns:
            </p>
            {[
              { role: 'roles/run.invoker', desc: 'Allows other services to invoke this Cloud Run service.' },
              { role: 'roles/secretmanager.secretAccessor', desc: 'Allows the service to read its secrets (API keys, DB passwords).' },
              { role: 'roles/logging.logWriter', desc: 'Allows the service to write structured logs to Cloud Logging.' },
              { role: 'roles/cloudtrace.agent', desc: 'Allows the service to emit distributed traces to Cloud Trace.' },
            ].map(({ role, desc }) => (
              <div key={role} className="flex items-start gap-[10px] px-[10px] py-[8px] bg-[#1e1e1e] border border-[#464646] rounded-[4px]">
                <code className="text-[9px] font-['JetBrains_Mono',sans-serif] text-[#f881a9] shrink-0 w-[220px] leading-[1.4]">{role}</code>
                <p className="text-[10px] text-[rgba(255,255,255,0.5)] leading-[1.4]">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      ),
    },
  ],
};
