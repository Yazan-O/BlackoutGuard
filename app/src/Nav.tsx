// One switcher across every view, so the Storm film, the Act III block, its stills, the witness
// reconstruction, and the operator split-screen are all one click apart. Full navigations (each view
// owns its own canvas / clock), which is why these are plain anchors, not client-side routing.
const VIEWS = [
  { label: "Storm", q: "" },
  { label: "Monolith", q: "act3" },
  { label: "Poster", q: "act3&still" },
  { label: "Witness", q: "act3&witness" },
  { label: "Operator", q: "simple" },
];

function activeKey(params: URLSearchParams): string {
  if (params.has("simple")) return "simple";
  if (params.has("act3")) {
    if (params.has("witness")) return "act3&witness";
    if (params.has("still")) return "act3&still";
    return "act3";
  }
  return "";
}

export function Nav() {
  const params = new URLSearchParams(location.search);
  const clip = params.get("clip");
  const active = activeKey(params);

  const href = (q: string) => {
    const parts: string[] = [];
    if (clip) parts.push(`clip=${clip}`);
    if (q) parts.push(q);
    return parts.length ? `?${parts.join("&")}` : "?";
  };

  return (
    <nav className="viewnav">
      <span className="viewnav-tag">VIEWS</span>
      {VIEWS.map((v) => (
        <a key={v.q} href={href(v.q)} className={active === v.q ? "on" : ""}>
          {v.label}
        </a>
      ))}
    </nav>
  );
}
