import { afterEach, describe, expect, it } from 'vitest';
import { getProjectorScreen, popupFeatures } from './projectorScreen';

const w = window as any; // eslint-disable-line @typescript-eslint/no-explicit-any

function scr(over: object = {}) {
  return { availLeft: 0, availTop: 0, availWidth: 1920, availHeight: 1080, isPrimary: false, label: 'x', ...over };
}

afterEach(() => {
  delete w.getScreenDetails;
});

describe('getProjectorScreen', () => {
  it('returns null when the API is unavailable', async () => {
    expect(await getProjectorScreen()).toBeNull();
  });
  it('returns null with a single screen', async () => {
    const a = scr({ isPrimary: true });
    w.getScreenDetails = async () => ({ screens: [a], currentScreen: a });
    expect(await getProjectorScreen()).toBeNull();
  });
  it('returns the other screen with two screens', async () => {
    const a = scr({ isPrimary: true, label: 'laptop' });
    const b = scr({ availLeft: 1440, label: 'projector' });
    w.getScreenDetails = async () => ({ screens: [a, b], currentScreen: a });
    expect(await getProjectorScreen()).toBe(b);
  });
  it('prefers a non-primary screen', async () => {
    const a = scr({ isPrimary: false, label: 'current' });
    const b = scr({ isPrimary: true, label: 'primary' });
    const c = scr({ isPrimary: false, label: 'other' });
    w.getScreenDetails = async () => ({ screens: [a, b, c], currentScreen: a });
    expect(await getProjectorScreen()).toBe(c);
  });
  it('returns null when permission is denied', async () => {
    w.getScreenDetails = () => Promise.reject(new Error('denied'));
    expect(await getProjectorScreen()).toBeNull();
  });
});

describe('popupFeatures', () => {
  it('uses defaults without a screen', () => {
    expect(popupFeatures(null)).toBe('popup,width=1280,height=720');
  });
  it('places the window on the screen', () => {
    expect(popupFeatures({ availLeft: 1440, availTop: 10, availWidth: 1920, availHeight: 1050 })).toBe(
      'popup,left=1440,top=10,width=1920,height=1050',
    );
  });
});
