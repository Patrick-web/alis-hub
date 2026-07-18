export function CloudBuildDiagram() {
  return (
    <svg viewBox="0 0 640 180" className="w-full max-w-[600px]" aria-hidden="true">
      {/* Developer */}
      <rect
        x="20"
        y="68"
        width="110"
        height="44"
        rx="4"
        fill="#2c2c2c"
        stroke="#464646"
        strokeWidth="1"
      />
      <text
        x="75"
        y="87"
        textAnchor="middle"
        fill="rgba(255,255,255,0.8)"
        fontSize="9"
        fontFamily="JetBrains Mono, monospace"
        fontWeight="bold"
      >
        DEVELOPER
      </text>
      <text
        x="75"
        y="103"
        textAnchor="middle"
        fill="rgba(255,255,255,0.35)"
        fontSize="8"
        fontFamily="JetBrains Mono, monospace"
      >
        alis build
      </text>

      {/* Arrow */}
      <line x1="130" y1="90" x2="163" y2="90" stroke="#464646" strokeWidth="1.5" />
      <polygon points="166,90 160,86 160,94" fill="#464646" />

      {/* Cloud Build */}
      <rect
        x="166"
        y="54"
        width="130"
        height="72"
        rx="4"
        fill="#2c2c2c"
        stroke="var(--brand-fill)"
        strokeWidth="1.5"
      />
      <text
        x="231"
        y="74"
        textAnchor="middle"
        fill="var(--brand-fill)"
        fontSize="9"
        fontFamily="JetBrains Mono, monospace"
        fontWeight="bold"
      >
        CLOUD BUILD
      </text>
      <line x1="178" y1="80" x2="284" y2="80" stroke="#464646" strokeWidth="1" />
      <text
        x="231"
        y="94"
        textAnchor="middle"
        fill="rgba(255,255,255,0.5)"
        fontSize="8"
        fontFamily="JetBrains Mono, monospace"
      >
        fetch source
      </text>
      <text
        x="231"
        y="107"
        textAnchor="middle"
        fill="rgba(255,255,255,0.5)"
        fontSize="8"
        fontFamily="JetBrains Mono, monospace"
      >
        run Dockerfile
      </text>
      <text
        x="231"
        y="120"
        textAnchor="middle"
        fill="rgba(255,255,255,0.5)"
        fontSize="8"
        fontFamily="JetBrains Mono, monospace"
      >
        tag image
      </text>

      {/* Arrow */}
      <line x1="296" y1="90" x2="329" y2="90" stroke="#464646" strokeWidth="1.5" />
      <polygon points="332,90 326,86 326,94" fill="#464646" />

      {/* Docker image */}
      <rect
        x="332"
        y="68"
        width="110"
        height="44"
        rx="4"
        fill="#252525"
        stroke="#464646"
        strokeWidth="1"
      />
      <text
        x="387"
        y="87"
        textAnchor="middle"
        fill="rgba(255,255,255,0.8)"
        fontSize="9"
        fontFamily="JetBrains Mono, monospace"
        fontWeight="bold"
      >
        DOCKER IMAGE
      </text>
      <text
        x="387"
        y="103"
        textAnchor="middle"
        fill="rgba(255,255,255,0.35)"
        fontSize="8"
        fontFamily="JetBrains Mono, monospace"
      >
        your service binary
      </text>

      {/* Arrow */}
      <line x1="442" y1="90" x2="475" y2="90" stroke="#464646" strokeWidth="1.5" />
      <polygon points="478,90 472,86 472,94" fill="#464646" />

      {/* Artifact Registry */}
      <rect
        x="478"
        y="54"
        width="140"
        height="72"
        rx="4"
        fill="#2c2c2c"
        stroke="#464646"
        strokeWidth="1"
      />
      <text
        x="548"
        y="74"
        textAnchor="middle"
        fill="rgba(255,255,255,0.8)"
        fontSize="9"
        fontFamily="JetBrains Mono, monospace"
        fontWeight="bold"
      >
        ARTIFACT
      </text>
      <text
        x="548"
        y="86"
        textAnchor="middle"
        fill="rgba(255,255,255,0.8)"
        fontSize="9"
        fontFamily="JetBrains Mono, monospace"
        fontWeight="bold"
      >
        REGISTRY
      </text>
      <line x1="490" y1="92" x2="606" y2="92" stroke="#464646" strokeWidth="1" />
      <text
        x="548"
        y="106"
        textAnchor="middle"
        fill="rgba(255,255,255,0.35)"
        fontSize="8"
        fontFamily="JetBrains Mono, monospace"
      >
        versioned &amp; tagged
      </text>
      <text
        x="548"
        y="118"
        textAnchor="middle"
        fill="rgba(255,255,255,0.35)"
        fontSize="8"
        fontFamily="JetBrains Mono, monospace"
      >
        image store
      </text>

      {/* Source label above */}
      <text
        x="75"
        y="52"
        textAnchor="middle"
        fill="rgba(255,255,255,0.25)"
        fontSize="8"
        fontFamily="JetBrains Mono, monospace"
      >
        local
      </text>
      <text
        x="231"
        y="40"
        textAnchor="middle"
        fill="rgba(255,255,255,0.25)"
        fontSize="8"
        fontFamily="JetBrains Mono, monospace"
      >
        GCP
      </text>
      <text
        x="387"
        y="52"
        textAnchor="middle"
        fill="rgba(255,255,255,0.25)"
        fontSize="8"
        fontFamily="JetBrains Mono, monospace"
      >
        build output
      </text>
      <text
        x="548"
        y="40"
        textAnchor="middle"
        fill="rgba(255,255,255,0.25)"
        fontSize="8"
        fontFamily="JetBrains Mono, monospace"
      >
        GCP
      </text>
    </svg>
  );
}
