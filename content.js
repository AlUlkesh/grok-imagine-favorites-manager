/**
 * Grok Imagine Favorites Manager - Content Script (Entry Point)
 */

// Debug logs controlled by Utils.Logger.DEBUG_MODE

// Initialize simple modules map for debugging if needed
window.GrokModules = {
  Scanner: window.MediaScanner,
  Api: window.Api,
  UI: window.ProgressModal,
  Utils: window.Utils
};

// Apply stored debug logging setting (default: on)
chrome.storage.local.get(['debugLogging'], (result) => {
  if (window.Utils) window.Utils.Logger.DEBUG_MODE = result.debugLogging !== false;
});

/**
 * Message listener for actions from popup
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const { action } = request;
  if (window.Utils) window.Utils.Logger.log('[Content] Message received:', action);

  if (action === 'ping') {
    // Basic connectivity check
    if (window.ProgressModal) {
      sendResponse({ loaded: true });
    } else {
      // Retry logic often handles this, but good to be explicit
      sendResponse({ loaded: false });
    }
    return true;
  }

  if (action === 'cancelOperation') {
    if (window.ProgressModal) window.ProgressModal.cancel();
    chrome.storage.local.set({ activeOperation: false });
    sendResponse({ success: true });
    return;
  }

  if (action === 'setDebugLogging') {
    if (window.Utils) window.Utils.Logger.DEBUG_MODE = request.enabled;
    sendResponse({ success: true });
    return;
  }

  // Handle Main Actions
  (async () => {
    try {
      chrome.storage.local.set({ activeOperation: true });

      if (action.startsWith('save')) {
        await handleSaveFlow(action);
      }
    } catch (error) {
      console.error('[GrokManager] Error handling action:', error);
      if (window.ProgressModal) window.ProgressModal.hide();
      if (!error.message.includes('cancelled')) {
        alert(`Error: ${error.message}`);
      }
    } finally {
      chrome.storage.local.set({ activeOperation: false });
    }
  })();

  // Send immediate response so Popup doesn't wait (and can close cleanly)
  sendResponse({ success: true, status: 'started' });
  return false;
});

/**
 * High-level flow for saving media
 */
async function handleSaveFlow(type) {
  try {
    if (!window.ProgressModal) {
      throw new Error('UI Module not loaded. Please refresh the page.');
    }

    console.log(`[Content.handleSaveFlow] START — type="${type}" url=${location.href}`);
    window.ProgressModal.show('Collecting Favorites', 'Scanning page...');

    // 1. Collect IDs via REST API (or DOM scroll fallback)
    const foundItems = await window.MediaScanner.scanPage(type === 'scanOnly');

    console.log(`[Content.handleSaveFlow] scanPage returned ${foundItems.length} items`);
    if (foundItems.length === 0) {
      throw new Error('No media found.');
    }

    // 2. Resolve download URLs for all items
    window.ProgressModal.update(50, `Found ${foundItems.length} items. Resolving download URLs...`);
    console.log(`[Content.handleSaveFlow] Starting prepareForDownload for ${foundItems.length} items with filterType="${type}"`);
    const analyzedMedia = await window.MediaScanner.prepareForDownload(foundItems, type);

    console.log(`[Content.handleSaveFlow] prepareForDownload returned ${analyzedMedia.length} downloadable items`);
    if (analyzedMedia.length === 0) {
      console.warn('[Content.handleSaveFlow] No downloadable media resolved — this is the problem!');
      throw new Error('No downloadable media could be resolved from analysis.');
    }

    // 4. Download
    window.ProgressModal.update(100, `Ready to download ${analyzedMedia.length} files. Starting...`);
    console.log(`[Content.handleSaveFlow] Sending ${analyzedMedia.length} items to download`);

    // Send work to background script
    window.Api.startDownloads(analyzedMedia, { metadataOnly: type === 'saveMetadata' });
    const modeLabel = type === 'saveMetadata' ? 'metadata' : `${analyzedMedia.length} media file${analyzedMedia.length !== 1 ? 's' : ''}`;
    window.ProgressModal.complete(`Queued ${modeLabel} for download.`);

  } catch (error) {
    if (error.message === 'Operation cancelled by user') {
      window.ProgressModal.hide();
      return;
    }
    console.error('[Content.handleSaveFlow] ERROR:', error);
    throw error;
  }
}


