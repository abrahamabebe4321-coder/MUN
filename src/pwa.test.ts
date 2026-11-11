import { shouldRegister } from './pwa';

describe('shouldRegister', () => {
  it('registers in production when service workers exist', () => {
    expect(shouldRegister({ PROD: true }, { serviceWorker: {} })).toBe(true);
  });
  it('does not register in dev', () => {
    expect(shouldRegister({ PROD: false }, { serviceWorker: {} })).toBe(false);
  });
  it('does not register without service worker support', () => {
    expect(shouldRegister({ PROD: true }, {})).toBe(false);
    expect(shouldRegister({ PROD: true }, undefined)).toBe(false);
  });
});
