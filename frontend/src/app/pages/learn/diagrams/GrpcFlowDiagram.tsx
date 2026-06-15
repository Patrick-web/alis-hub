export function GrpcFlowDiagram() {
  return (
    <svg viewBox="0 0 640 200" className="w-full max-w-[600px]" aria-hidden="true">
      {/* Proto file */}
      <rect x="20" y="78" width="120" height="44" rx="4" fill="#2c2c2c" stroke="#f881a9" strokeWidth="1.5" />
      <text x="80" y="97" textAnchor="middle" fill="#f881a9" fontSize="9" fontFamily="JetBrains Mono, monospace" fontWeight="bold">.proto FILE</text>
      <text x="80" y="113" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="8" fontFamily="JetBrains Mono, monospace">service + messages</text>

      {/* Arrow → protoc */}
      <line x1="140" y1="100" x2="175" y2="100" stroke="#464646" strokeWidth="1.5" />
      <polygon points="178,100 172,96 172,104" fill="#464646" />

      {/* protoc */}
      <rect x="178" y="78" width="100" height="44" rx="4" fill="#252525" stroke="#464646" strokeWidth="1" />
      <text x="228" y="97" textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize="9" fontFamily="JetBrains Mono, monospace" fontWeight="bold">protoc</text>
      <text x="228" y="113" textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="8" fontFamily="JetBrains Mono, monospace">compiler</text>

      {/* Arrow → stubs */}
      <line x1="278" y1="100" x2="315" y2="100" stroke="#464646" strokeWidth="1.5" />
      <polygon points="318,100 312,96 312,104" fill="#464646" />

      {/* Generated stubs box */}
      <rect x="318" y="54" width="130" height="92" rx="4" fill="#252525" stroke="#464646" strokeWidth="1" />
      <text x="383" y="72" textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="8" fontFamily="JetBrains Mono, monospace">GENERATED</text>

      <rect x="330" y="78" width="106" height="28" rx="3" fill="#2c2c2c" stroke="#464646" strokeWidth="1" />
      <text x="383" y="90" textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize="8" fontFamily="JetBrains Mono, monospace">Client Stub</text>
      <text x="383" y="102" textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="7" fontFamily="JetBrains Mono, monospace">Go / TS / Python</text>

      <rect x="330" y="112" width="106" height="28" rx="3" fill="#2c2c2c" stroke="#464646" strokeWidth="1" />
      <text x="383" y="124" textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize="8" fontFamily="JetBrains Mono, monospace">Server Interface</text>
      <text x="383" y="136" textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="7" fontFamily="JetBrains Mono, monospace">Go implementation</text>

      {/* Arrow client stub → client */}
      <line x1="448" y1="92" x2="496" y2="68" stroke="#464646" strokeWidth="1.5" />
      <polygon points="499,67 491,67 494,74" fill="#464646" />

      {/* Arrow server interface → server */}
      <line x1="448" y1="126" x2="496" y2="150" stroke="#464646" strokeWidth="1.5" />
      <polygon points="499,152 491,148 494,156" fill="#464646" />

      {/* Client box */}
      <rect x="498" y="46" width="110" height="40" rx="4" fill="#2c2c2c" stroke="#464646" strokeWidth="1" />
      <text x="553" y="63" textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize="9" fontFamily="JetBrains Mono, monospace" fontWeight="bold">CLIENT</text>
      <text x="553" y="78" textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="7" fontFamily="JetBrains Mono, monospace">calls your API</text>

      {/* Server box */}
      <rect x="498" y="132" width="110" height="40" rx="4" fill="#2c2c2c" stroke="#f881a9" strokeWidth="1.5" />
      <text x="553" y="149" textAnchor="middle" fill="#f881a9" fontSize="9" fontFamily="JetBrains Mono, monospace" fontWeight="bold">YOUR SERVICE</text>
      <text x="553" y="164" textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="7" fontFamily="JetBrains Mono, monospace">implements interface</text>

      {/* gRPC call arrow between client and server */}
      <line x1="553" y1="86" x2="553" y2="132" stroke="rgba(248,129,169,0.4)" strokeWidth="1" strokeDasharray="4,3" />
      <text x="558" y="113" fill="rgba(248,129,169,0.6)" fontSize="7" fontFamily="JetBrains Mono, monospace">gRPC</text>
    </svg>
  );
}
