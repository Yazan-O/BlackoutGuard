import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { StormScene } from "./demo/StormScene";
import { MonolithScene } from "./demo/scenes/MonolithScene";
import { Nav } from "./Nav";
import "./index.css";

// ?simple keeps the plain split-screen operator view — the guaranteed demo floor.
// ?act3 enters the navigable spacetime monolith (Act III); default is the Storm film.
const params = new URLSearchParams(location.search);
const simple = params.has("simple");
const act3 = params.has("act3");
const clipId = params.get("clip") ?? "clip_zc09a";

function Root() {
  if (simple) return <App />;
  if (act3) return <MonolithScene clipId={clipId} />;
  return <StormScene clipId={clipId} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Nav />
    <Root />
  </StrictMode>,
);
