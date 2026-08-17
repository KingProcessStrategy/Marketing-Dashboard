import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./globals.css";
import { WorkspaceApp } from "./workspace-app";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WorkspaceApp />
  </StrictMode>,
);
