import { createContext, useContext } from 'react';
/** Lets a panel ask the chair layout to switch tab (e.g. 'debate'). No-op outside the layout. */
export const NavContext = createContext<(tab: string) => void>(() => {});
export function useNav(): (tab: string) => void {
  return useContext(NavContext);
}
