// AntD's responsive observer + a couple of components reach for
// `window.matchMedia` and `IntersectionObserver`, neither of which jsdom
// implements. Each panel-level vitest pulls this module via a top-level
// import so the stubs are in place before AntD's responsive observer
// boots inside the first render.
//
// Keep this list minimal — only stub APIs that are *missing*, not just
// unobserved. Stubbing too aggressively will hide real bugs.

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query) => ({
    matches: false,
    media: query || '',
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

if (typeof window !== 'undefined' && typeof window.IntersectionObserver !== 'function') {
  window.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

module.exports = {};
