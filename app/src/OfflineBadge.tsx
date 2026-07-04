import { useOnline } from "./useNetwork";

export function OfflineBadge() {
  const online = useOnline();
  return (
    <div className="badge" role="status" aria-label="on-device, offline">
      <span className="badge-dot" />
      <div className="badge-text">
        <strong>ON-DEVICE · OFFLINE</strong>
        <small>{online ? "no cloud calls · localhost only" : "network unplugged · still running"}</small>
      </div>
    </div>
  );
}
