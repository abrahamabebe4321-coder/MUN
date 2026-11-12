export interface ScreenDetailed {
  availLeft: number;
  availTop: number;
  availWidth: number;
  availHeight: number;
  isPrimary: boolean;
  label: string;
}

/**
 * Finds a display other than the one this window is on, using the Window
 * Management API. Returns null when unavailable, denied, or only one screen.
 */
export async function getProjectorScreen(): Promise<ScreenDetailed | null> {
  try {
    if (typeof window === 'undefined' || !('getScreenDetails' in window)) return null;
    const d = await (window as any).getScreenDetails(); // eslint-disable-line @typescript-eslint/no-explicit-any
    const screens: ScreenDetailed[] = Array.from(d?.screens ?? []);
    if (screens.length <= 1) return null;
    const others = screens.filter((s) => s !== d.currentScreen);
    return others.find((s) => s.isPrimary === false) ?? others[0] ?? null;
  } catch {
    return null;
  }
}

export function popupFeatures(
  screen: { availLeft: number; availTop: number; availWidth: number; availHeight: number } | null,
): string {
  if (!screen) return 'popup,width=1280,height=720';
  return `popup,left=${screen.availLeft},top=${screen.availTop},width=${screen.availWidth},height=${screen.availHeight}`;
}
