import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { StormScene } from "./demo/StormScene";
import "./index.css";

// ?simple keeps the plain split-screen operator view — the guaranteed demo floor.
const params = new URLSearchParams(location.search);
const simple = params.has("simple");
const clipId = params.get("clip") ?? "clip_zc09a";

createRoot(document.getElementById("root")!).render(
  <StrictMode>{simple ? <App /> : <StormScene clipId={clipId} />}</StrictMode>,
);
