interface LoaderProps {
  size?: number;
  color?: string;
}

export function Loader({ size = 40, color = 'var(--brand)' }: LoaderProps) {
  const bar = `no-repeat linear-gradient(${color} 0 0)`;
  const scale = size / 40;
  const barW = Math.round(8 * scale);
  const ballSize = Math.round(8 * scale);

  return (
    <div style={{ position: 'relative', width: size, height: size, overflow: 'hidden', flexShrink: 0 }}>
      <div
        style={{
          width: '100%',
          height: '100%',
          background: `${bar} 0 0, ${bar} 0 100%, ${bar} 50% 0, ${bar} 50% 100%, ${bar} 100% 0, ${bar} 100% 100%`,
          backgroundSize: `${barW}px 50%`,
          animation: 'l7-0 1s infinite',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            content: '""',
            position: 'absolute',
            width: ballSize,
            height: ballSize,
            borderRadius: '50%',
            background: color,
            top: `calc(50% - ${ballSize / 2}px)`,
            left: -ballSize,
            animation: 'l7-0 1s infinite, l7-1 1s infinite',
            animationName: 'l7-1',
          }}
        />
      </div>
    </div>
  );
}
