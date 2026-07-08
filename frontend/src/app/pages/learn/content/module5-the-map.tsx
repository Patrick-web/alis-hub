import { LearningModule } from '../types';
import { EndToEndDiagram } from '../diagrams/EndToEndDiagram';

export const module5: LearningModule = {
  id: 'module5',
  title: 'The Map',
  subtitle: 'End-to-end from .proto to live API',
  icon: 'solar:map-point-linear',
  steps: [
    {
      id: 'm5-s0',
      title: 'The full pipeline',
      body: (
        <div className="flex flex-col gap-[12px]">
          <p className="text-[12px] text-foreground/70 leading-[1.7]">
            Now that you've seen each stage in isolation, here's how they connect. Every service you build
            on alis follows this exact pipeline — from a text file on your machine to a live, authenticated,
            auto-scaling API on Google Cloud.
          </p>
          <div className="flex flex-col gap-[6px]">
            {[
              { stage: 'Define', cmd: 'alis define', desc: 'Write a .proto file. alis generate compiles it into Go interfaces and client stubs.' },
              { stage: 'Implement', cmd: '(your code)', desc: 'Fill in the Go server interface with your business logic. The compiler enforces the contract.' },
              { stage: 'Build', cmd: 'alis build', desc: 'Cloud Build compiles and containerises your service. The image lands in Artifact Registry.' },
              { stage: 'Deploy', cmd: 'alis deploy', desc: 'Cloud Run, Endpoints, and IAM are provisioned. Your service gets a live HTTPS endpoint.' },
            ].map(({ stage, cmd, desc }, i) => (
              <div key={stage} className="flex items-start gap-[12px] px-[12px] py-[10px] bg-muted border border-border rounded-[4px]">
                <div className="size-[22px] rounded-full bg-[rgba(248,129,169,0.15)] border border-brand-fill flex items-center justify-center shrink-0 mt-[1px]">
                  <span className="text-[10px] font-bold text-brand font-mono">{i + 1}</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-[8px] mb-[4px]">
                    <span className="text-[11px] font-bold text-foreground font-mono">{stage}</span>
                    <code className="text-[9px] text-foreground/35 bg-background px-[6px] py-[1px] rounded">{cmd}</code>
                  </div>
                  <p className="text-[11px] text-foreground/55 leading-[1.5]">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ),
      diagram: <EndToEndDiagram />,
    },
    {
      id: 'm5-s1',
      title: 'A request\'s journey',
      body: (
        <div className="flex flex-col gap-[12px]">
          <p className="text-[12px] text-foreground/70 leading-[1.7]">
            Once deployed, here's what happens when a client calls your service:
          </p>
          <div className="flex flex-col gap-[4px]">
            {[
              {
                n: '1',
                title: 'Client sends request',
                detail: 'The client uses the generated stub (or makes an HTTP call). The request is sent to the Cloud Run HTTPS endpoint.',
              },
              {
                n: '2',
                title: 'ESP intercepts',
                detail: 'The Endpoints Service Proxy (sidecar) receives the request first. It validates the JWT bearer token against Google\'s key servers.',
              },
              {
                n: '3',
                title: 'Transcoding (if REST)',
                detail: 'If the request is REST/JSON, ESP transcodes it to gRPC (matching the proto method) before passing it to your service.',
              },
              {
                n: '4',
                title: 'Your handler runs',
                detail: 'Your Go implementation receives a typed protobuf request. It runs your business logic, queries databases, calls other services.',
              },
              {
                n: '5',
                title: 'Response returned',
                detail: 'Your handler returns a proto message. ESP serialises it (to JSON for REST, to protobuf for gRPC) and sends it back to the client.',
              },
            ].map(({ n, title, detail }) => (
              <div key={n} className="flex items-start gap-[10px] px-[10px] py-[8px] bg-muted border border-border rounded-[4px]">
                <span className="text-[9px] font-bold text-brand font-mono shrink-0 w-[14px]">{n}</span>
                <div>
                  <span className="text-[11px] font-bold text-foreground font-mono">{title} </span>
                  <span className="text-[11px] text-foreground/50">— {detail}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-foreground/40 leading-[1.5]">
            End-to-end latency overhead from the ESP layer is typically under 2 ms. The cost is authentication
            security and free transcoding, both worth the trade.
          </p>
        </div>
      ),
    },
    {
      id: 'm5-s2',
      title: 'Where to go from here',
      body: (
        <div className="flex flex-col gap-[12px]">
          <p className="text-[12px] text-foreground/70 leading-[1.7]">
            You've covered the core mental model. Here's how the rest of the hub maps to what you've learned:
          </p>
          <div className="flex flex-col gap-[8px]">
            {[
              {
                tab: 'Services',
                icon: 'solar:layers-linear',
                desc: 'Lists all neurons in the current product. Click a service to see its proto definition, deployed version, and endpoint URL.',
              },
              {
                tab: 'Builds',
                icon: 'solar:box-linear',
                desc: 'Live and historical Cloud Build logs. Trigger a new build or check why a previous one failed.',
              },
              {
                tab: 'Deployments',
                icon: 'solar:cloud-upload-linear',
                desc: 'The deploy history for each service. See which image version is live in each environment.',
              },
              {
                tab: 'Environments',
                icon: 'solar:server-linear',
                desc: 'Create, configure, and manage dev/staging/production environments for the current product.',
              },
              {
                tab: 'Build Kit',
                icon: 'solar:rocket-launch-linear',
                desc: 'Advanced capabilities: Identity (OAuth), MCP servers, AI Launchpad, custom APIs, and more.',
              },
            ].map(({ tab, desc }) => (
              <div key={tab} className="px-[12px] py-[10px] bg-muted border border-border rounded-[4px]">
                <p className="text-[11px] font-bold text-foreground font-mono mb-[3px]">{tab}</p>
                <p className="text-[11px] text-foreground/50 leading-[1.4]">{desc}</p>
              </div>
            ))}
          </div>
          <div className="flex items-start gap-[10px] px-[14px] py-[12px] bg-[rgba(248,129,169,0.06)] border border-[rgba(248,129,169,0.2)] rounded-[4px]">
            <p className="text-[11px] text-foreground/70 leading-[1.5]">
              <span className="text-brand font-bold">You're ready. </span>
              Go define your first service — start with a simple{' '}
              <code className="text-foreground/80 text-[10px]">GetX</code> method on a resource
              you know well. The first deploy is the steepest part of the curve.
            </p>
          </div>
        </div>
      ),
    },
  ],
};
