import type { Incident } from "./types";

const TAG: Record<Incident["severity"], string> = {
  info: "INFO",
  caution: "CAUTION",
  brake: "BRAKE",
};

export function AdvisoryBanner({
  incident,
  advisory,
  overridden,
}: {
  incident: Incident | null;
  advisory: string | null;
  overridden: boolean;
}) {
  if (!incident) {
    return <div className="banner cleared">No active incident</div>;
  }
  const severity = overridden ? "caution" : incident.severity;
  const tag = overridden ? "OVERRIDDEN" : TAG[incident.severity];
  const text = advisory ?? "Awaiting advisory from local agent…";
  return (
    <div className={`banner ${severity}`}>
      <span className="banner-tag">{tag}</span>
      <span className="banner-text">{text}</span>
    </div>
  );
}
