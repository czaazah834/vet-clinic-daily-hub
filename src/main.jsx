import { createRoot } from "react-dom/client";
import "./styles.css";
import App from "./App.jsx";
import "./fonts.css";   // keep this AFTER the other imports so Poppins wins everywhere
createRoot(document.getElementById("root")).render(<App />);