import { useEffect } from "react";
import { Router, Route, Switch, useLocation } from "wouter";
import { hasCredentials } from "./lib/credentials";
import SetupPage from "./pages/setup";
import StreamPage from "./pages/stream";
import SettingsPage from "./pages/settings";
import PopoutPage from "./pages/popout";
import Toaster from "./components/toaster";

function AuthGuard({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  useEffect(() => {
    if (!hasCredentials() && location !== "/setup") {
      setLocation("/setup");
    }
  }, [location, setLocation]);
  return <>{children}</>;
}

export default function App() {
  return (
    <Router>
      <Toaster />
      <Switch>
        <Route path="/setup" component={SetupPage} />
        <Route path="/popout">
          <PopoutPage />
        </Route>
        <Route path="/settings">
          <AuthGuard>
            <SettingsPage />
          </AuthGuard>
        </Route>
        <Route path="/">
          <AuthGuard>
            <StreamPage />
          </AuthGuard>
        </Route>
        <Route>
          <AuthGuard>
            <StreamPage />
          </AuthGuard>
        </Route>
      </Switch>
    </Router>
  );
}
