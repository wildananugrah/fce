import { useEffect } from "react";
import { useBlocker } from "react-router-dom";

/**
 * While `active` is true, intercepts page-leave attempts and asks the
 * user to confirm. Two channels:
 *   1. window.beforeunload — tab close / refresh / address-bar nav.
 *      Modern browsers show a generic "Leave site?" prompt; the message
 *      we set is honored only by older browsers but the prompt itself
 *      always appears.
 *   2. react-router useBlocker — in-app navigation (sidebar click,
 *      back button, etc.). We control the prompt entirely; show a
 *      window.confirm with the supplied message.
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

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      active && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (window.confirm(message)) {
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }, [blocker, message]);
}
