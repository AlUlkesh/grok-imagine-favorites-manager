/**
 * Grok Imagine Favorites Manager - Background Service Worker
 */

// Global error handler
self.addEventListener('unhandledrejection', event => {
  console.warn('[Background] Unhandled rejection:', event.reason);
});

// Constants
const DOWNLOAD_CONFIG = {
  RATE_LIMIT_MS: 300,
  FOLDER: 'grok-imagine'
};

// Resume download queue on SW restart
chrome.storage.local.get(['downloadQueue'], (result) => {
  if (result.downloadQueue && result.downloadQueue.length > 0) {
    console.log(`[Background] Resuming ${result.downloadQueue.length} queued downloads after SW restart`);
    processNextDownload();
  }
});

/**
 * Handles messages from content script
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startDownloads') {
    handleDownloads(request.media)
      .then(() => { try { sendResponse({ success: true }); } catch (e) { } })
      .catch(error => { try { sendResponse({ success: false, error: error.message }); } catch (e) { } });
    return true;
  }
});

async function handleDownloads(media) {
  console.log(`[BG.handleDownloads] Called with ${media ? media.length : 'null'} items`);
  if (!Array.isArray(media) || media.length === 0) throw new Error('No media provided');

  media.forEach((item, i) => {
    console.log(`[BG.handleDownloads]   [${i}] filename=${item.filename} type=${item.type || '?'} url=${item.url ? item.url.slice(0,80) : 'MISSING'}`);
  });

  // Re-entry guard: reject if already downloading
  const existing = await chrome.storage.local.get(['downloadQueue']);
  if (existing.downloadQueue && existing.downloadQueue.length > 0) {
    console.warn(`[BG.handleDownloads] BLOCKED — download already in progress (${existing.downloadQueue.length} items in queue)`);
    throw new Error('Download already in progress');
  }

  // Build JSON sidecar files — one per parent post — from metadata attached to media items
  const sidecarMap = new Map();
  for (const item of media) {
    const meta = item.metadata;
    if (meta && meta.parentPostId) {
      if (!sidecarMap.has(meta.parentPostId)) {
        sidecarMap.set(meta.parentPostId, {
          id: meta.parentPostId,
          prompt: meta.prompt || '',
          originalPrompt: meta.originalPrompt || '',
          createTime: meta.createTime || '',
          mediaType: meta.mediaType || '',
          mode: meta.mode || '',
          modelName: meta.modelName || '',
          rRated: meta.rRated || false,
          resolution: meta.resolution || null,
          videoDuration: meta.videoDuration || null,
          variants: []
        });
      }
      sidecarMap.get(meta.parentPostId).variants.push({
        id: item.filename.replace(/\.(mp4|jpg|png|webp)$/, ''),
        url: item.url,
        type: item.type
      });
    }
  }
  const sidecarItems = [];
  for (const [parentId, sidecar] of sidecarMap) {
    const jsonStr = JSON.stringify(sidecar, null, 2);
    const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonStr);
    sidecarItems.push({ url: dataUrl, filename: `${parentId}_info.json`, type: 'meta' });
    console.log(`[BG.handleDownloads] Sidecar for ${parentId}: ${sidecar.variants.length} variant(s), prompt="${sidecar.prompt.slice(0, 60)}"`);
  }
  const allItems = [...media, ...sidecarItems];

  const videoCount = allItems.filter(item => item.filename && item.filename.toLowerCase().endsWith('.mp4')).length;
  const imageCount = allItems.filter(item => item.filename && /\.(jpg|jpeg|png|webp)$/i.test(item.filename)).length;

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const datePath = `${yyyy}_${mm}_${dd}/${hh}_${min}`;

  await chrome.storage.local.set({
    totalDownloads: allItems.length,
    downloadProgress: {},
    downloadCounts: { video: videoCount, image: imageCount },
    downloadQueue: allItems,
    downloadDatePath: datePath
  });

  processNextDownload();
}

async function processNextDownload() {
  const data = await chrome.storage.local.get(['downloadQueue', 'downloadDatePath']);
  const queue = data.downloadQueue || [];

  if (queue.length === 0) {
    console.log('[BG.processNextDownload] Queue empty — done.');
    return;
  }

  // Pop first item
  const item = queue.shift();
  await chrome.storage.local.set({ downloadQueue: queue });

  if (item.url && item.filename) {
    const datePath = data.downloadDatePath || 'unknown';
    const destPath = `${DOWNLOAD_CONFIG.FOLDER}/${datePath}/${item.filename}`;
    console.log(`[BG.processNextDownload] Downloading: ${destPath} (${queue.length} remaining)`);
    chrome.downloads.download({
      url: item.url,
      filename: destPath,
      saveAs: false
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error(`[BG.processNextDownload] download() error for ${item.filename}:`, chrome.runtime.lastError.message);
      } else {
        console.log(`[BG.processNextDownload] download() started id=${downloadId} for ${item.filename}`);
      }
    });
  } else {
    console.warn(`[BG.processNextDownload] SKIP — missing url or filename:`, item);
  }

  // Schedule next download after rate limit (non-blocking)
  if (queue.length > 0) {
    setTimeout(processNextDownload, DOWNLOAD_CONFIG.RATE_LIMIT_MS);
  }
}

chrome.downloads.onChanged.addListener((delta) => {
  if (!delta.state) return;
  chrome.storage.local.get(['downloadProgress'], (result) => {
    const progress = result.downloadProgress || {};
    if (delta.state.current === 'complete') progress[delta.id] = 'complete';
    else if (delta.state.current === 'interrupted') progress[delta.id] = 'failed';
    chrome.storage.local.set({ downloadProgress: progress });
  });
});
