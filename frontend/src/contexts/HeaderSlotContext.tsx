import { createContext, useContext, useState, useMemo, type ReactNode } from "react";

interface ContextValue {
  slot: ReactNode | null;
  setSlot: (node: ReactNode | null) => void;
}

const HeaderSlotContext = createContext<ContextValue>({
  slot: null,
  setSlot: () => {},
});

export function HeaderSlotProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<ReactNode | null>(null);
  const value = useMemo(() => ({ slot, setSlot }), [slot]);
  return <HeaderSlotContext.Provider value={value}>{children}</HeaderSlotContext.Provider>;
}

/** Called by pages to push content into the GlobalHeader slot. */
export function useHeaderSlot() {
  return useContext(HeaderSlotContext).setSlot;
}

/** Read by GlobalHeader to render the injected content. */
export function useHeaderSlotContent() {
  return useContext(HeaderSlotContext).slot;
}
