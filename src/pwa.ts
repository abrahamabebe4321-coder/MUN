export function shouldRegister(
  env: { PROD: boolean },
  nav: { serviceWorker?: unknown } | undefined,
): boolean {
  return env.PROD && !!nav && 'serviceWorker' in nav;
}

export function registerServiceWorker(): void {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  if (!shouldRegister({ PROD: import.meta.env.PROD }, nav)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('Service worker registration failed', err);
    });
  });
}
