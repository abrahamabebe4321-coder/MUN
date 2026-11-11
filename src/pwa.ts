export function shouldRegister(
  env: { PROD: boolean },
  nav: { serviceWorker?: unknown } | undefined,
  protocol: string = typeof location === 'undefined' ? 'https:' : location.protocol,
): boolean {
  return (
    env.PROD && !!nav && 'serviceWorker' in nav && (protocol === 'http:' || protocol === 'https:')
  );
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
