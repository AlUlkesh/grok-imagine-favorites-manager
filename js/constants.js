/**
 * Grok Imagine Favorites Manager - Constants
 */

var SELECTORS = {
  IMAGE: 'img[alt*="Generated"]'
};

var CONFIG = {
  SCROLL_DELAY_MS: 1000
};

// Export-like pattern for content scripts
window.SELECTORS = SELECTORS;
window.CONFIG = CONFIG;
