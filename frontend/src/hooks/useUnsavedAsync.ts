import { useEffect } from "react";

/**
 * While `active` is true, intercepts tab close / refresh / address-bar
 * navigation by registering a `beforeunload` listener. The browser
 * shows a generic "Leave site?" prompt; the message we set is honored
 * only by older browsers but the prompt itself always appears.
 *
 * Note: in-app navigation via React Router (sidebar clicks, back button)
 * is NOT intercepted. Doing so reliably requires the app to use
 * `createBrowserRouter` (data router) so we can call `useBlocker`. The
 * app currently uses the declarative `BrowserRouter`. If full in-app
 * blocking becomes important, migrate the router. Today's coverage:
 *   ✓ tab close
 *   ✓ refresh / hard navigation
 *   ✓ address-bar navigation
 *   ✗ sidebar / Link navigation (no prompt; component unmounts)
 *
 * Server-side jobs continue regardless — closing the page doesn't
 * cancel them. The user simply loses the option to cancel from the UI.
 */
export function useUnsavedAsync(active: boolean, message: string) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = message;
      return message;
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [active, message]);
}
