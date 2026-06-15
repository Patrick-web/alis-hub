export function GcpProvisioningDiagram() {
  return (
    <svg viewBox="0 0 640 260" className="w-full max-w-[600px]" aria-hidden="true">
      {/* alis deploy command */}
      <rect x="20" y="108" width="110" height="44" rx="4" fill="#2c2c2c" stroke="#f881a9" strokeWidth="1.5" />
      <text x="75" y="127" textAnchor="middle" fill="#f881a9" fontSize="9" fontFamily="JetBrains Mono, monospace" fontWeight="bold">alis deploy</text>
      <text x="75" y="143" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="8" fontFamily="JetBrains Mono, monospace">provisions GCP</text>

      {/* Arrow */}
      <line x1="130" y1="130" x2="165" y2="130" stroke="#464646" strokeWidth="1.5" />
      <polygon points="168,130 162,126 162,134" fill="#464646" />

      {/* GCP boundary box */}
      <rect x="168" y="20" width="450" height="220" rx="6" fill="rgba(255,255,255,0.02)" stroke="#464646" strokeWidth="1" strokeDasharray="6,4" />
      <text x="193" y="36" fill="rgba(255,255,255,0.2)" fontSize="8" fontFamily="JetBrains Mono, monospace">GCP PROJECT</text>

      {/* Cloud Run */}
      <rect x="188" y="50" width="130" height="60" rx="4" fill="#2c2c2c" stroke="#464646" strokeWidth="1" />
      <text x="253" y="70" textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize="9" fontFamily="JetBrains Mono, monospace" fontWeight="bold">CLOUD RUN</text>
      <line x1="198" y1="76" x2="308" y2="76" stroke="#464646" strokeWidth="1" />
      <text x="253" y="90" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="8" fontFamily="JetBrains Mono, monospace">runs your container</text>
      <text x="253" y="103" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="8" fontFamily="JetBrains Mono, monospace">auto-scales to 0</text>

      {/* Cloud Endpoints */}
      <rect x="348" y="50" width="130" height="60" rx="4" fill="#2c2c2c" stroke="#464646" strokeWidth="1" />
      <text x="413" y="70" textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize="9" fontFamily="JetBrains Mono, monospace" fontWeight="bold">ENDPOINTS</text>
      <line x1="358" y1="76" x2="468" y2="76" stroke="#464646" strokeWidth="1" />
      <text x="413" y="90" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="8" fontFamily="JetBrains Mono, monospace">API gateway + auth</text>
      <text x="413" y="103" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="8" fontFamily="JetBrains Mono, monospace">validates JWT tokens</text>

      {/* IAM */}
      <rect x="188" y="148" width="130" height="60" rx="4" fill="#2c2c2c" stroke="#464646" strokeWidth="1" />
      <text x="253" y="168" textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize="9" fontFamily="JetBrains Mono, monospace" fontWeight="bold">IAM</text>
      <line x1="198" y1="174" x2="308" y2="174" stroke="#464646" strokeWidth="1" />
      <text x="253" y="188" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="8" fontFamily="JetBrains Mono, monospace">service accounts</text>
      <text x="253" y="201" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="8" fontFamily="JetBrains Mono, monospace">access controls</text>

      {/* Service APIs */}
      <rect x="348" y="148" width="130" height="60" rx="4" fill="#2c2c2c" stroke="#464646" strokeWidth="1" />
      <text x="413" y="168" textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize="9" fontFamily="JetBrains Mono, monospace" fontWeight="bold">SERVICE APIs</text>
      <line x1="358" y1="174" x2="468" y2="174" stroke="#464646" strokeWidth="1" />
      <text x="413" y="188" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="8" fontFamily="JetBrains Mono, monospace">enable required</text>
      <text x="413" y="201" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="8" fontFamily="JetBrains Mono, monospace">GCP APIs</text>

      {/* alis deploy → GCP box entries */}
      <line x1="168" y1="80" x2="188" y2="80" stroke="#464646" strokeWidth="1" />
      <line x1="168" y1="178" x2="188" y2="178" stroke="#464646" strokeWidth="1" />
      <line x1="168" y1="80" x2="168" y2="178" stroke="#464646" strokeWidth="1" />

      {/* Right columns entry */}
      <line x1="318" y1="80" x2="348" y2="80" stroke="#464646" strokeWidth="1" strokeDasharray="3,3" />
      <line x1="318" y1="178" x2="348" y2="178" stroke="#464646" strokeWidth="1" strokeDasharray="3,3" />

      {/* Pink highlight on Cloud Run (main output) */}
      <rect x="188" y="50" width="130" height="60" rx="4" fill="transparent" stroke="#f881a9" strokeWidth="1" opacity="0.4" />
    </svg>
  );
}
