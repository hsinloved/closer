import { render } from "preact";
import { App } from "./app.jsx";
import "./styles.css";

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
render(<App />, document.getElementById("app"));
