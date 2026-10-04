import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { styleVariables } from "@skeleton/overlay/style";
import { App } from "./App.js";
import "./styles/base.css";
import "./styles/shell.css";
import "./styles/canvas.css";
import "./styles/panels.css";

// Skeleton's style values (T8.4), shared with the overlay, as --sk-* custom properties.
const values = document.createElement("style");
values.textContent = styleVariables(":root");
document.head.prepend(values);

const root = document.getElementById("root");
if (!root) throw new Error("index.html is missing #root");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
