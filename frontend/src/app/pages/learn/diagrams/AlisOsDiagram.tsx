export function AlisOsDiagram() {
  return (
    <svg viewBox="0 0 640 260" className="w-full max-w-[600px]" aria-hidden="true">
      {/* Organisation */}
      <rect
        x="220"
        y="10"
        width="200"
        height="44"
        rx="4"
        fill="#2c2c2c"
        stroke="var(--brand-fill)"
        strokeWidth="1.5"
      />
      <text
        x="320"
        y="30"
        textAnchor="middle"
        fill="var(--brand-fill)"
        fontSize="9"
        fontFamily="JetBrains Mono, monospace"
        fontWeight="bold"
        textLength="110"
        lengthAdjust="spacing"
      >
        ORGANISATION
      </text>
      <text
        x="320"
        y="46"
        textAnchor="middle"
        fill="rgba(255,255,255,0.5)"
        fontSize="8"
        fontFamily="JetBrains Mono, monospace"
      >
        e.g. acme-os
      </text>

      {/* Arrow org → products */}
      <line x1="320" y1="54" x2="320" y2="80" stroke="#464646" strokeWidth="1.5" />
      <polygon points="320,84 315,76 325,76" fill="#464646" />

      {/* Products row */}
      <rect
        x="80"
        y="88"
        width="160"
        height="44"
        rx="4"
        fill="#2c2c2c"
        stroke="#464646"
        strokeWidth="1"
      />
      <text
        x="160"
        y="108"
        textAnchor="middle"
        fill="rgba(255,255,255,0.85)"
        fontSize="9"
        fontFamily="JetBrains Mono, monospace"
        fontWeight="bold"
      >
        PRODUCT A
      </text>
      <text
        x="160"
        y="124"
        textAnchor="middle"
        fill="rgba(255,255,255,0.4)"
        fontSize="8"
        fontFamily="JetBrains Mono, monospace"
      >
        e.g. payments-os
      </text>

      <rect
        x="400"
        y="88"
        width="160"
        height="44"
        rx="4"
        fill="#2c2c2c"
        stroke="#464646"
        strokeWidth="1"
      />
      <text
        x="480"
        y="108"
        textAnchor="middle"
        fill="rgba(255,255,255,0.85)"
        fontSize="9"
        fontFamily="JetBrains Mono, monospace"
        fontWeight="bold"
      >
        PRODUCT B
      </text>
      <text
        x="480"
        y="124"
        textAnchor="middle"
        fill="rgba(255,255,255,0.4)"
        fontSize="8"
        fontFamily="JetBrains Mono, monospace"
      >
        e.g. identity-os
      </text>

      {/* Connector lines org → products */}
      <line
        x1="220"
        y1="84"
        x2="160"
        y2="88"
        stroke="#464646"
        strokeWidth="1"
        strokeDasharray="4,3"
      />
      <line
        x1="420"
        y1="84"
        x2="480"
        y2="88"
        stroke="#464646"
        strokeWidth="1"
        strokeDasharray="4,3"
      />

      {/* Arrow product A → neurons */}
      <line x1="160" y1="132" x2="160" y2="158" stroke="#464646" strokeWidth="1.5" />
      <polygon points="160,162 155,154 165,154" fill="#464646" />

      {/* Neurons row under Product A */}
      <rect
        x="30"
        y="166"
        width="120"
        height="40"
        rx="4"
        fill="#252525"
        stroke="#464646"
        strokeWidth="1"
      />
      <text
        x="90"
        y="184"
        textAnchor="middle"
        fill="rgba(255,255,255,0.7)"
        fontSize="8"
        fontFamily="JetBrains Mono, monospace"
        fontWeight="bold"
      >
        NEURON
      </text>
      <text
        x="90"
        y="198"
        textAnchor="middle"
        fill="rgba(255,255,255,0.35)"
        fontSize="7"
        fontFamily="JetBrains Mono, monospace"
      >
        users-v1
      </text>

      <rect
        x="168"
        y="166"
        width="120"
        height="40"
        rx="4"
        fill="#252525"
        stroke="#464646"
        strokeWidth="1"
      />
      <text
        x="228"
        y="184"
        textAnchor="middle"
        fill="rgba(255,255,255,0.7)"
        fontSize="8"
        fontFamily="JetBrains Mono, monospace"
        fontWeight="bold"
      >
        NEURON
      </text>
      <text
        x="228"
        y="198"
        textAnchor="middle"
        fill="rgba(255,255,255,0.35)"
        fontSize="7"
        fontFamily="JetBrains Mono, monospace"
      >
        billing-v1
      </text>

      {/* Connector lines product A → neurons */}
      <line
        x1="120"
        y1="162"
        x2="90"
        y2="166"
        stroke="#464646"
        strokeWidth="1"
        strokeDasharray="3,3"
      />
      <line
        x1="200"
        y1="162"
        x2="228"
        y2="166"
        stroke="#464646"
        strokeWidth="1"
        strokeDasharray="3,3"
      />

      {/* Environments label under neuron */}
      <rect
        x="30"
        y="218"
        width="120"
        height="30"
        rx="3"
        fill="var(--brand-fill)"
        fill-opacity="0.06"
        stroke="var(--brand-fill)"
        stroke-opacity="0.2"
        strokeWidth="1"
      />
      <text
        x="90"
        y="231"
        textAnchor="middle"
        fill="var(--brand-fill)"
        fill-opacity="0.7"
        fontSize="7"
        fontFamily="JetBrains Mono, monospace"
        fontWeight="bold"
      >
        ENVIRONMENTS
      </text>
      <text
        x="90"
        y="243"
        textAnchor="middle"
        fill="rgba(255,255,255,0.3)"
        fontSize="7"
        fontFamily="JetBrains Mono, monospace"
      >
        dev · staging · prod
      </text>

      <line
        x1="90"
        y1="206"
        x2="90"
        y2="218"
        stroke="var(--brand-fill)"
        stroke-opacity="0.3"
        strokeWidth="1"
        strokeDasharray="3,2"
      />

      {/* Legend */}
      <text
        x="380"
        y="190"
        fill="rgba(255,255,255,0.35)"
        fontSize="8"
        fontFamily="JetBrains Mono, monospace"
      >
        Each product gets its
      </text>
      <text
        x="380"
        y="202"
        fill="rgba(255,255,255,0.35)"
        fontSize="8"
        fontFamily="JetBrains Mono, monospace"
      >
        own GCP project.
      </text>
      <text
        x="380"
        y="218"
        fill="rgba(255,255,255,0.35)"
        fontSize="8"
        fontFamily="JetBrains Mono, monospace"
      >
        Neurons are deployed
      </text>
      <text
        x="380"
        y="230"
        fill="rgba(255,255,255,0.35)"
        fontSize="8"
        fontFamily="JetBrains Mono, monospace"
      >
        as Cloud Run services.
      </text>
    </svg>
  );
}
