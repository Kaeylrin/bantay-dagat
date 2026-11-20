import { ThemeProvider } from "next-themes";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./global.css";

createRoot(document.getElementById("root")).render(
  <ThemeProvider attribute="class" storageKey="bd-appearance" defaultTheme="system" enableSystem>
    <App />
  </ThemeProvider>
);
