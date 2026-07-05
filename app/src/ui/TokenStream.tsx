import { useEffect, useRef } from "react";

// Renders the answer as it streams. `text` is the accumulating string of REAL Gemma tokens (the
// bridge forwards Ollama's stream:true deltas); each render the newly-arrived tail fades in from
// faint, so characters resolve into the answer as they actually land — not a typewriter over a
// finished string. The stamp is a chain-of-custody label: the model the agent reports on /health,
// "0 bytes left this machine" (literally true on loopback), and the measured elapsed seconds.
export function TokenStream({
  text,
  model,
  elapsedS,
  streaming,
}: {
  text: string;
  model: string | null;
  elapsedS: number;
  streaming: boolean;
}) {
  const settledLen = useRef(0);
  const fresh = text.slice(settledLen.current);
  const settled = text.slice(0, settledLen.current);
  useEffect(() => {
    settledLen.current = text.length;
  }, [text]);

  return (
    <div className={`token-stream ${streaming ? "is-streaming" : "is-done"}`}>
      <div className="ts-text">
        {settled}
        {fresh && (
          <span className="ts-fresh" key={settled.length}>
            {fresh}
          </span>
        )}
        {streaming && <span className="ts-caret" />}
      </div>
      {model && (
        <div className="ts-stamp">
          {model} · 0 bytes left this machine · {elapsedS.toFixed(1)}s
        </div>
      )}
    </div>
  );
}
