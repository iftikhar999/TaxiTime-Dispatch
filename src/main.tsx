import "leaflet/dist/leaflet.css";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { SocketProvider } from "./providers/SocketProvider";
import { ThemeProvider } from "@material-tailwind/react";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <ThemeProvider>
    <SocketProvider>
      <App />
    </SocketProvider>
  </ThemeProvider>
);
