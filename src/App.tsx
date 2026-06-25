import { Router, Route, Switch } from "wouter";
import StreamPage from "./pages/stream";
import SettingsPage from "./pages/settings";
import PopoutPage from "./pages/popout";
import Toaster from "./components/toaster";

export default function App() {
  return (
    <Router>
      <Toaster />
      <Switch>
        <Route path="/popout">
          <PopoutPage />
        </Route>
        <Route path="/settings">
          <SettingsPage />
        </Route>
        <Route>
          <StreamPage />
        </Route>
      </Switch>
    </Router>
  );
}
