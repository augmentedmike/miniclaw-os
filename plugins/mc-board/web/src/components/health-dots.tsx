"use client";

interface ServiceStatus {
  status: "ok" | "down" | "unconfigured";
}

interface HealthDotsProps {
  services?: {
    web: ServiceStatus;
    chat: ServiceStatus;
    telegram: ServiceStatus;
  };
}

function dotColor(s?: ServiceStatus): string {
  if (!s) return "#71717a"; // gray — loading
  if (s.status === "ok") return "#4ade80";
  if (s.status === "down") return "#ef4444";
  return "#71717a"; // unconfigured
}

function dotLabel(s?: ServiceStatus): string {
  if (!s) return "checking...";
  if (s.status === "ok") return "connected";
  if (s.status === "down") return "unreachable";
  return "not configured";
}

export function HealthDots({ services }: HealthDotsProps) {
  const dots: { key: string; label: string; svc?: ServiceStatus }[] = [
    { key: "Web", label: "Web", svc: services?.web },
    { key: "Chat", label: "Chat", svc: services?.chat },
    { key: "TG", label: "TG", svc: services?.telegram },
  ];

  return (
    <div className="health-dots">
      {dots.map(({ key, label, svc }) => (
        <span key={key} className="health-dot-item" title={`${label}: ${dotLabel(svc)}`}>
          <span
            className="health-dot"
            style={{ background: dotColor(svc) }}
          />
          <span className="health-dot-label">{label}</span>
        </span>
      ))}
    </div>
  );
}
