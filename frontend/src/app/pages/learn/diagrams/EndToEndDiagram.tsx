export function EndToEndDiagram() {
  return (
    <svg viewBox="0 0 700 320" className="w-full max-w-[660px]" aria-hidden="true">
      {/* Stage labels */}
      <text
        x="60"
        y="18"
        textAnchor="middle"
        fill="rgba(255,255,255,0.25)"
        fontSize="8"
        fontFamily="JetBrains Mono, monospace"
      >
        DEFINE
      </text>
      <text
        x="220"
        y="18"
        textAnchor="middle"
        fill="rgba(255,255,255,0.25)"
        fontSize="8"
        fontFamily="JetBrains Mono, monospace"
      >
        BUILD
      </text>
      <text
        x="400"
        y="18"
        textAnchor="middle"
        fill="rgba(255,255,255,0.25)"
        fontSize="8"
        fontFamily="JetBrains Mono, monospace"
      >
        DEPLOY
      </text>
      <text
        x="590"
        y="18"
        textAnchor="middle"
        fill="rgba(255,255,255,0.25)"
        fontSize="8"
        fontFamily="JetBrains Mono, monospace"
      >
        RUNTIME
      </text>

      {/* Vertical stage separators */}
      <line x1="135" y1="10" x2="135" y2="310" stroke="#2c2c2c" strokeWidth="1" />
      <line x1="305" y1="10" x2="305" y2="310" stroke="#2c2c2c" strokeWidth="1" />
      <line x1="495" y1="10" x2="495" y2="310" stroke="#2c2c2c" strokeWidth="1" />

      {/* === DEFINE stage === */}
      {/* .proto file */}
      <rect
        x="10"
        y="100"
        width="100"
        height="50"
        rx="4"
        fill="#2c2c2c"
        stroke="#f881a9"
        strokeWidth="1.5"
      />
      <text
        x="60"
        y="120"
        textAnchor="middle"
        fill="#f881a9"
        fontSize="9"
        fontFamily="JetBrains Mono, monospace"
        fontWeight="bold"
      >
        .proto FILE
      </text>
      <text
        x="60"
        y="134"
        textAnchor="middle"
        fill="rgba(255,255,255,0.4)"
        fontSize="7"
        fontFamily="JetBrains Mono, monospace"
      >
        service definition
      </text>
      <text
        x="60"
        y="145"
        textAnchor="middle"
        fill="rgba(255,255,255,0.4)"
        fontSize="7"
        fontFamily="JetBrains Mono, monospace"
      >
        + message types
      </text>

      {/* alis generate */}
      <rect
        x="10"
        y="180"
        width="100"
        height="36"
        rx="4"
        fill="#252525"
        stroke="#464646"
        strokeWidth="1"
      />
      <text
        x="60"
        y="197"
        textAnchor="middle"
        fill="rgba(255,255,255,0.6)"
        fontSize="8"
        fontFamily="JetBrains Mono, monospace"
        fontWeight="bold"
      >
        alis generate
      </text>
      <text
        x="60"
        y="210"
        textAnchor="middle"
        fill="rgba(255,255,255,0.3)"
        fontSize="7"
        fontFamily="JetBrains Mono, monospace"
      >
        code stubs
      </text>

      <line x1="60" y1="150" x2="60" y2="180" stroke="#464646" strokeWidth="1" />
      <polygon points="60,183 56,176 64,176" fill="#464646" />

      {/* → BUILD */}
      <line x1="110" y1="125" x2="150" y2="125" stroke="#464646" strokeWidth="1.5" />
      <polygon points="153,125 147,121 147,129" fill="#464646" />

      {/* === BUILD stage === */}
      {/* Cloud Build */}
      <rect
        x="153"
        y="80"
        width="120"
        height="90"
        rx="4"
        fill="#2c2c2c"
        stroke="#464646"
        strokeWidth="1"
      />
      <text
        x="213"
        y="100"
        textAnchor="middle"
        fill="rgba(255,255,255,0.8)"
        fontSize="9"
        fontFamily="JetBrains Mono, monospace"
        fontWeight="bold"
      >
        CLOUD BUILD
      </text>
      <line x1="163" y1="106" x2="263" y2="106" stroke="#464646" strokeWidth="1" />
      <text
        x="213"
        y="120"
        textAnchor="middle"
        fill="rgba(255,255,255,0.4)"
        fontSize="7"
        fontFamily="JetBrains Mono, monospace"
      >
        compile source
      </text>
      <text
        x="213"
        y="132"
        textAnchor="middle"
        fill="rgba(255,255,255,0.4)"
        fontSize="7"
        fontFamily="JetBrains Mono, monospace"
      >
        build Docker image
      </text>
      <text
        x="213"
        y="144"
        textAnchor="middle"
        fill="rgba(255,255,255,0.4)"
        fontSize="7"
        fontFamily="JetBrains Mono, monospace"
      >
        push to registry
      </text>
      <text
        x="213"
        y="156"
        textAnchor="middle"
        fill="rgba(255,255,255,0.4)"
        fontSize="7"
        fontFamily="JetBrains Mono, monospace"
      >
        Artifact Registry
      </text>

      {/* → DEPLOY */}
      <line x1="273" y1="125" x2="315" y2="125" stroke="#464646" strokeWidth="1.5" />
      <polygon points="318,125 312,121 312,129" fill="#464646" />

      {/* === DEPLOY stage === */}
      {/* Cloud Run */}
      <rect
        x="318"
        y="60"
        width="120"
        height="50"
        rx="4"
        fill="#2c2c2c"
        stroke="#f881a9"
        strokeWidth="1.5"
      />
      <text
        x="378"
        y="80"
        textAnchor="middle"
        fill="#f881a9"
        fontSize="9"
        fontFamily="JetBrains Mono, monospace"
        fontWeight="bold"
      >
        CLOUD RUN
      </text>
      <text
        x="378"
        y="95"
        textAnchor="middle"
        fill="rgba(255,255,255,0.4)"
        fontSize="7"
        fontFamily="JetBrains Mono, monospace"
      >
        your service running
      </text>
      <text
        x="378"
        y="106"
        textAnchor="middle"
        fill="rgba(255,255,255,0.4)"
        fontSize="7"
        fontFamily="JetBrains Mono, monospace"
      >
        as a container
      </text>

      {/* Endpoints */}
      <rect
        x="318"
        y="130"
        width="120"
        height="50"
        rx="4"
        fill="#2c2c2c"
        stroke="#464646"
        strokeWidth="1"
      />
      <text
        x="378"
        y="150"
        textAnchor="middle"
        fill="rgba(255,255,255,0.8)"
        fontSize="9"
        fontFamily="JetBrains Mono, monospace"
        fontWeight="bold"
      >
        ENDPOINTS
      </text>
      <text
        x="378"
        y="165"
        textAnchor="middle"
        fill="rgba(255,255,255,0.4)"
        fontSize="7"
        fontFamily="JetBrains Mono, monospace"
      >
        gateway + auth
      </text>
      <text
        x="378"
        y="176"
        textAnchor="middle"
        fill="rgba(255,255,255,0.4)"
        fontSize="7"
        fontFamily="JetBrains Mono, monospace"
      >
        + rate limiting
      </text>

      {/* IAM */}
      <rect
        x="318"
        y="200"
        width="120"
        height="40"
        rx="4"
        fill="#252525"
        stroke="#464646"
        strokeWidth="1"
      />
      <text
        x="378"
        y="218"
        textAnchor="middle"
        fill="rgba(255,255,255,0.6)"
        fontSize="8"
        fontFamily="JetBrains Mono, monospace"
        fontWeight="bold"
      >
        IAM
      </text>
      <text
        x="378"
        y="232"
        textAnchor="middle"
        fill="rgba(255,255,255,0.3)"
        fontSize="7"
        fontFamily="JetBrains Mono, monospace"
      >
        access controls
      </text>

      {/* → RUNTIME */}
      <line x1="438" y1="125" x2="510" y2="125" stroke="#464646" strokeWidth="1.5" />
      <polygon points="513,125 507,121 507,129" fill="#464646" />

      {/* === RUNTIME stage === */}
      {/* Client */}
      <rect
        x="513"
        y="60"
        width="110"
        height="40"
        rx="4"
        fill="#252525"
        stroke="#464646"
        strokeWidth="1"
      />
      <text
        x="568"
        y="78"
        textAnchor="middle"
        fill="rgba(255,255,255,0.8)"
        fontSize="9"
        fontFamily="JetBrains Mono, monospace"
        fontWeight="bold"
      >
        CLIENT
      </text>
      <text
        x="568"
        y="93"
        textAnchor="middle"
        fill="rgba(255,255,255,0.35)"
        fontSize="7"
        fontFamily="JetBrains Mono, monospace"
      >
        gRPC / REST call
      </text>

      {/* Your live API */}
      <rect
        x="513"
        y="120"
        width="110"
        height="50"
        rx="4"
        fill="#2c2c2c"
        stroke="#f881a9"
        strokeWidth="1.5"
      />
      <text
        x="568"
        y="140"
        textAnchor="middle"
        fill="#f881a9"
        fontSize="9"
        fontFamily="JetBrains Mono, monospace"
        fontWeight="bold"
      >
        LIVE API
      </text>
      <text
        x="568"
        y="155"
        textAnchor="middle"
        fill="rgba(255,255,255,0.4)"
        fontSize="7"
        fontFamily="JetBrains Mono, monospace"
      >
        public endpoint
      </text>
      <text
        x="568"
        y="166"
        textAnchor="middle"
        fill="rgba(255,255,255,0.4)"
        fontSize="7"
        fontFamily="JetBrains Mono, monospace"
      >
        *.run.app
      </text>

      {/* Client → Live API */}
      <line
        x1="568"
        y1="100"
        x2="568"
        y2="120"
        stroke="rgba(248,129,169,0.5)"
        strokeWidth="1.5"
        strokeDasharray="4,3"
      />
      <polygon points="568,123 564,116 572,116" fill="rgba(248,129,169,0.5)" />

      {/* Bottom note */}
      <text
        x="350"
        y="290"
        textAnchor="middle"
        fill="rgba(255,255,255,0.2)"
        fontSize="8"
        fontFamily="JetBrains Mono, monospace"
      >
        Every step is tracked and repeatable — alis manages the state machine.
      </text>
    </svg>
  );
}
