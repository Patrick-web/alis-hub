import { Icon } from "@iconify/react";

interface CheckCircleProps {
  selected: boolean;
  size?: number;
}

export function CheckCircle({ selected, size = 14 }: CheckCircleProps) {
  return selected ? (
    <Icon
      icon="solar:check-circle-bold"
      className="shrink-0 text-brand-fill"
      style={{ fontSize: size }}
    />
  ) : (
    <span
      className="shrink-0 rounded-full border border-border"
      style={{ width: size, height: size }}
    />
  );
}
