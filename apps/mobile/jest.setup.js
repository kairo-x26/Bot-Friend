/* global jest */
jest.mock('expo-secure-store', () => {
  const store = new Map();
  return {
    getItemAsync: jest.fn(async (k) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k, v) => void store.set(k, v)),
    deleteItemAsync: jest.fn(async (k) => void store.delete(k)),
  };
});
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));

// Reanimated's web implementation (forced by its jest resolver) checks reduced motion via matchMedia.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = () => ({
    matches: false,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
  });
}
// ...and injects layout-animation keyframes into a <style> tag. A tiny DOM stub is enough.
if (typeof globalThis.document === 'undefined') {
  const el = () => ({
    style: {},
    sheet: { insertRule() {}, deleteRule() {}, cssRules: [] },
    setAttribute() {},
    appendChild() {},
  });
  globalThis.document = {
    getElementById: () => null,
    createElement: el,
    head: { appendChild() {} },
    body: { appendChild() {} },
  };
}

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(async () => ({
    canceled: false,
    assets: [{ uri: 'file:///photo.jpg', width: 2048, height: 1536 }],
  })),
}));
jest.mock('expo-image-manipulator', () => {
  const ctx = {
    resize: jest.fn(),
    renderAsync: jest.fn(async () => ({
      saveAsync: jest.fn(async () => ({ uri: 'file:///small.jpg', base64: 'QUJD' })),
    })),
  };
  return {
    ImageManipulator: { manipulate: jest.fn(() => ctx) },
    SaveFormat: { JPEG: 'jpeg' },
    __ctx: ctx,
  };
});
