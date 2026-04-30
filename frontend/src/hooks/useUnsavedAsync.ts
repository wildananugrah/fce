import { useEffect } from "react";

/**
 * While `active` is true, intercepts page-leave attempts and asks the
 * user to confirm. Three channels:
 *   1. window.beforeunload — tab close / refresh / address-bar nav.
 *      Modern browsers show a generic "Leave site?" prompt; the message
 *      we set is honored only by older browsers but the prompt itself
 *      always appears.
 *   2. Document-level click listener (capture phase) — intercepts in-app
 *      navigation via <a> elements (sidebar Links, NavLinks, etc.). If
 *      the click would navigate to a different in-app path, we show a
 *      window.confirm and prevent default if the user cancels.
 *   3. window.popstate — back / forward button. We can't truly block
 *      the navigation that already happened, but we push a state entry
 *      forward and prompt; if the user confirms, we pop it back.
 *
 * Why not react-router's useBlocker: that hook requires the app to
 * use createBrowserRouter (data router). This codebase uses the
 * declarative BrowserRouter, so useBlocker throws on mount. The
 * click-interception approach works without a router migration.
 *
 * Server-side jobs continue regardless — closing the page doesn't
 * cancel them. The user simply loses the option to cancel from the UI.
 */
export function useUnsavedAsync(active: boolean, message: string) {
  useEffect(() => {
    if (!active) return;

    // ─── 1. Tab close / refresh / address bar ───────────────────
    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = message;
      return message;
    };
    window.addEventListener("beforeunload", beforeUnload);

    // ─── 2. In-app navigation via <a> clicks ────────────────────
    // Capture phase so we run BEFORE react-router's own listener.
    const clickHandler = (e: MouseEvent) => {
      // Only plain left-clicks; let users open in new tab, etc.
      if (e.defaultPrevented) return;
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      const link = target?.closest("a");
      if (!link) return;

      // No href, target=_blank, download — none of these navigate
      // the current document, so don't prompt.
      const href = link.getAttribute("href");
      if (!href) return;
      if (link.target && link.target !== "" && link.target !== "_self") return;
      if (link.hasAttribute("download")) return;

      // Anchor-only links (e.g. <a href="#">) and pure hash changes
      // don't unmount the active page, so don't prompt.
      if (href.startsWith("#")) return;

      // Resolve the destination URL relative to the current document.
      let destUrl: URL;
      try {
        destUrl = new URL(href, window.location.href);
      } catch {
        return;
      }

      // External link — let beforeunload handle it.
      if (destUrl.origin !== window.location.origin) return;

      // Same path (and no hash change that would unmount) — don't prompt.
      if (
        destUrl.pathname === window.location.pathname &&
        destUrl.search === window.location.search
      ) {
        return;
      }

      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("click", clickHandler, true);

    // ─── 3. Back / forward button ───────────────────────────────
    // popstate fires AFTER the navigation has happened. We push a
    // state entry forward, then if the user declines we go back to
    // restore the original location. If they confirm, we let it
    // proceed and the listener detaches via cleanup on unmount.
    const popHandler = () => {
      if (window.confirm(message)) return;
      window.history.pushState(null, "", window.location.href);
    };
    // Seed a history entry so the FIRST back press hits popHandler
    // instead of leaving the SPA. Removed in cleanup.
    window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", popHandler);

    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", clickHandler, true);
      window.removeEventListener("popstate", popHandler);
    };
  }, [active, message]);
}
