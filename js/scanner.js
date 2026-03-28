/**
 * Grok Imagine Favorites Manager - Media Scanner
 */

var MediaScanner = {
  /**
   * Returns the API filter for the current page, or null if the page is not API-supported.
   * Filter source values observed from HAR:
   *   MEDIA_POST_SOURCE_LIKED   → /imagine/saved (hearted/saved posts)
   */
  getPageAPIFilter() {
    const path = location.pathname;
    if (/\/imagine\/saved\b/.test(path) || /\/imagine\/liked\b/.test(path)) {
      return { source: 'MEDIA_POST_SOURCE_LIKED', safeForWork: false };
    }
    return null;
  },

  /**
   * Converts a post object from /rest/media/post/list into an array of
   * { id, url, type } media items ready for download.
   * The API post already contains all variants in videos[] and images[].
   */
  extractMediaFromAPIPost(post) {
    const result = [];
    const seen = new Set();

    // Metadata shared by all variants of this parent post
    const metadata = {
      parentPostId: post.id,
      prompt: post.prompt || '',
      originalPrompt: post.originalPrompt || '',
      createTime: post.createTime || '',
      mediaType: post.mediaType || '',
      mode: post.mode || '',
      modelName: post.modelName || '',
      rRated: post.rRated || false,
      resolution: post.resolution || null,
      videoDuration: post.videoDuration || null
    };

    const add = (id, url, type) => {
      if (!url || !id || seen.has(id)) return;
      seen.add(id);
      result.push({ id, url, type, metadata });
    };

    // videos[] for video posts contains self + all alternate variants
    for (const vid of post.videos || []) {
      add(vid.id, vid.mediaUrl, 'video');
    }
    // images[] for image posts contains self + image variants
    for (const img of post.images || []) {
      add(img.id, img.mediaUrl, 'image');
    }
    // childPosts may overlap with videos[]/images[] — deduped by seen set
    for (const child of post.childPosts || []) {
      const type = child.mediaType === 'MEDIA_POST_TYPE_VIDEO' ? 'video' : 'image';
      add(child.id, child.mediaUrl, type);
    }
    // The post itself (if not already included via videos[] or images[])
    const selfType = post.mediaType === 'MEDIA_POST_TYPE_VIDEO' ? 'video' : 'image';
    add(post.id, post.mediaUrl, selfType);

    return result;
  },

  /**
   * Phase 1: Expand Page and Scan (Visual Only)
   */
  async scanPage(visualizeOnly = false) {
    if (window.ProgressModal) window.ProgressModal.update(10, 'Scanning items...');

    window.Utils.Logger.log(`[Scanner.scanPage] START — URL: ${location.href}`);

    // ── API-FIRST PATH ──────────────────────────────────────────────────────
    // On supported pages (e.g. /imagine/saved) we call the REST API directly.
    // The response contains every post with all its variants in videos[]/images[],
    // so no tab-opening or DOM scraping is needed at all.
    const apiFilter = this.getPageAPIFilter();
    if (apiFilter) {
      if (window.ProgressModal) window.ProgressModal.update(15, 'Fetching posts via API...');
      try {
        const posts = await window.Api.fetchAllPosts(apiFilter);
        if (posts.length > 0) {
          const foundItems = posts.map(post => ({
            id: post.id,
            url: `${location.origin}/imagine/post/${post.id}`,
            details: { apiPost: post }
          }));
          window.Utils.Logger.log(`[Scanner.scanPage] API path: ${foundItems.length} posts fetched`);
          return foundItems;
        }
        window.Utils.Logger.warn('[Scanner.scanPage] API returned 0 items — falling back to DOM scroll');
      } catch (e) {
        window.Utils.Logger.warn('[Scanner.scanPage] API fetch failed, falling back to DOM scroll:', e.message);
      }
    }

    // ── DOM SCROLL FALLBACK ─────────────────────────────────────────────────
    if (window.ProgressModal) window.ProgressModal.update(15, 'Scrolling to collect all items...');
    const foundItems = await this.scrollAndCollect();

    window.Utils.Logger.log(`[Scanner.scanPage] scrollAndCollect returned: ${foundItems.length} items`);
    foundItems.forEach((item, i) => {
      window.Utils.Logger.log(`[Scanner.scanPage]   item[${i}]: id=${item.id}  url=${item.url}`);
    });

    if (foundItems.length === 0) {
      throw new Error(`No items found. Please retry 'Download' or reload the page.`);
    }

    window.Utils.Logger.log(`[Scanner.scanPage] END — returning ${foundItems.length} items`);
    return foundItems;
  },

  /**
   * Finds the likely scrollable container
   */
  getScrollContainer() {
    // Walk up from the virtual list element and PROBE each ancestor by
    // temporarily nudging scrollTop. The first element that actually moves
    // is the real scroll container — no CSS heuristics needed.
    const list = document.querySelector('[role="list"][tabindex="0"]')
               || document.querySelector('[role="list"]');
    if (list) {
      let el = list.parentElement;
      while (el && el !== document.documentElement) {
        const prev = el.scrollTop;
        el.scrollTop += 1;
        if (el.scrollTop !== prev) {
          el.scrollTop = prev; // restore
          console.log('[Scanner.getScrollContainer] Found by probe:', el);
          return el;
        }
        el = el.parentElement;
      }
    }
    // Fallback: window
    console.log('[Scanner.getScrollContainer] Falling back to window');
    return window;
  },

  /**
   * Scrolls through the page incrementally, collecting post IDs at each position.
   * Finds the real scroll container by probing scrollTop, then advances one
   * viewport height at a time so the virtual list re-renders new batches.
   */
  async scrollAndCollect() {
    const allItems = new Map(); // id -> item
    const t0 = performance.now();

    // During scroll we do NOT call injectFiberExtractor — it can block for 20-30s on a
    // busy page. Post IDs are reliably available from anchor href attributes
    // (/imagine/post/{uuid}) via the URL-based strategies in extractPostDataFromElement.
    // Fiber injection is only needed during the per-post analysis phase.
    const collectAtCurrentPosition = () => {
      const tc = performance.now();

      // Collect from all listitem anchors — fast, no async needed
      const links = document.querySelectorAll('[role="listitem"] a[href*="/imagine/post/"], [role="listitem"] a[href*="/post/"]');
      let added = 0;
      for (const link of links) {
        if (link.href.includes('/profile/')) continue;
        const match = link.href.match(/\/(?:imagine\/post|post)\/([0-9a-f-]{36})/i);
        if (!match) continue;
        const id = match[1].toLowerCase();
        if (!allItems.has(id)) {
          allItems.set(id, { id, url: `${location.origin}/imagine/post/${id}`, details: {} });
          added++;
        }
      }

      // Fallback: also check media elements in case anchors aren't present
      if (links.length === 0) {
        const mediaElements = Array.from(document.querySelectorAll(
          'img[alt*="Generated" i], video, [data-testid="video-player"], [data-testid="video-component"]'
        )).filter(el => !(el.tagName === 'IMG' && el.src && el.src.includes('/profile/')));
        for (const el of mediaElements) {
          const postData = window.Utils.extractPostDataFromElement(el);
          if (postData && !allItems.has(postData.id)) {
            allItems.set(postData.id, { id: postData.id, url: postData.url, details: {} });
            added++;
          }
        }
      }

      console.log(`[Scanner.scrollAndCollect] collect: +${added} (links=${links.length}, total_ms=${(performance.now()-tc).toFixed(0)}ms)`);
      return added;
    };

    let unchangedCount = 0;
    const MAX_UNCHANGED = 5;

    // Collect at initial (top) position before any scrolling
    collectAtCurrentPosition();
    console.log(`[Scanner.scrollAndCollect] Initial collect: ${allItems.size} items`);

    // Find the real scroll container once (uses probe method)
    let scrollContainer = this.getScrollContainer();
    const isWindow = scrollContainer === window;
    const viewportH = isWindow ? window.innerHeight : scrollContainer.clientHeight;
    console.log(`[Scanner.scrollAndCollect] Using container: ${isWindow ? 'window' : scrollContainer.tagName + '.' + scrollContainer.className.slice(0,60)}, viewportH=${viewportH}`);

    while (true) {
      if (window.ProgressModal.isCancelled()) throw new Error('Operation cancelled by user');

      // Advance one viewport height — virtual list re-renders based on scrollTop
      const prevScrollTop = isWindow ? window.scrollY : scrollContainer.scrollTop;
      if (isWindow) {
        window.scrollBy(0, viewportH);
      } else {
        scrollContainer.scrollTop += viewportH;
      }
      const newScrollTop = isWindow ? window.scrollY : scrollContainer.scrollTop;
      const scrolled = Math.abs(newScrollTop - prevScrollTop);
      console.log(`[Scanner.scrollAndCollect] scrollTop: ${prevScrollTop} -> ${newScrollTop} (moved ${scrolled}px), waiting ${window.CONFIG.SCROLL_DELAY_MS}ms`);

      await window.Utils.sleep(window.CONFIG.SCROLL_DELAY_MS);

      const newlyAdded = collectAtCurrentPosition();
      const elapsed = ((performance.now() - t0) / 1000).toFixed(1);

      if (window.ProgressModal) window.ProgressModal.update(20, `Scrolling... ${allItems.size} items found`);

      // Stop if we couldn't scroll further (hit the end) OR no new items 3x in a row
      if (scrolled < 5) {
        // Page may use infinite scroll — new batch loads only after we reach the bottom.
        // Poll every 500ms up to 15s for the list to grow.
        const listEl = document.querySelector('[role="list"][tabindex="0"]') || document.querySelector('[role="list"]');
        const getHeight = () => listEl ? listEl.offsetHeight : (isWindow ? document.documentElement.scrollHeight : scrollContainer.scrollHeight);
        const heightBefore = getHeight();
        console.log(`[Scanner.scrollAndCollect] Hit scroll end (moved ${scrolled}px). Polling up to 15s for infinite scroll... listHeight=${heightBefore}`);
        let grew = false;
        for (let i = 0; i < 30; i++) {
          await window.Utils.sleep(500);
          if (getHeight() > heightBefore) { grew = true; break; }
          // Nudge to absolute bottom every 2s to prod IntersectionObserver
          if (i % 4 === 0) {
            const scrollH = isWindow ? document.documentElement.scrollHeight : scrollContainer.scrollHeight;
            const clientH = isWindow ? window.innerHeight : scrollContainer.clientHeight;
            const maxST = scrollH - clientH;
            console.log(`[Scanner.scrollAndCollect] end-poll[${i}] scrollH=${scrollH} clientH=${clientH} maxST=${maxST} listH=${getHeight()}`);
            if (isWindow) window.scrollTo(0, maxST);
            else scrollContainer.scrollTop = maxST;
          }
        }
        const heightAfter = getHeight();
        if (grew) {
          console.log(`[Scanner.scrollAndCollect] List grew by ${heightAfter - heightBefore}px — more items loaded. Continuing.`);
          unchangedCount = 0;
          continue;
        }
        console.log(`[Scanner.scrollAndCollect] List did not grow (${heightBefore}px → ${heightAfter}px). Truly at end. Total=${allItems.size}, elapsed=${elapsed}s`);
        break;
      }

      if (newlyAdded === 0) {
        unchangedCount++;
        console.log(`[Scanner.scrollAndCollect] No new items (${unchangedCount}/${MAX_UNCHANGED}), total=${allItems.size}, elapsed=${elapsed}s`);
      } else {
        unchangedCount = 0;
        console.log(`[Scanner.scrollAndCollect] +${newlyAdded} new items, total=${allItems.size}, elapsed=${elapsed}s`);
      }

      if (unchangedCount >= MAX_UNCHANGED) {
        // Same patience: poll up to 15s in case infinite scroll is about to deliver more
        const listEl = document.querySelector('[role="list"][tabindex="0"]') || document.querySelector('[role="list"]');
        const getHeight = () => listEl ? listEl.offsetHeight : (isWindow ? document.documentElement.scrollHeight : scrollContainer.scrollHeight);
        const heightBefore = getHeight();
        console.log(`[Scanner.scrollAndCollect] No new items ${MAX_UNCHANGED}x in a row. Polling up to 15s for possible infinite scroll... listHeight=${heightBefore}`);
        let grew = false;
        for (let i = 0; i < 30; i++) {
          await window.Utils.sleep(500);
          if (getHeight() > heightBefore) { grew = true; break; }
          // Every 2s nudge scroll to absolute bottom to prod Grok's IntersectionObserver sentinel
          if (i % 4 === 0) {
            const scrollH = isWindow ? document.documentElement.scrollHeight : scrollContainer.scrollHeight;
            const clientH = isWindow ? window.innerHeight : scrollContainer.clientHeight;
            const currentST = isWindow ? window.scrollY : scrollContainer.scrollTop;
            const maxST = scrollH - clientH;
            console.log(`[Scanner.scrollAndCollect] poll[${i}] nudge: scrollH=${scrollH} clientH=${clientH} currentST=${currentST} maxST=${maxST} listH=${getHeight()}`);
            if (isWindow) window.scrollTo(0, maxST);
            else scrollContainer.scrollTop = maxST;
            const afterST = isWindow ? window.scrollY : scrollContainer.scrollTop;
            console.log(`[Scanner.scrollAndCollect] poll[${i}] after nudge: scrollTop=${afterST}`);
          }
        }
        const heightAfter = getHeight();
        if (grew) {
          console.log(`[Scanner.scrollAndCollect] List grew by ${heightAfter - heightBefore}px after waiting. Continuing.`);
          unchangedCount = 0;
          continue;
        }
        console.log(`[Scanner.scrollAndCollect] Done (no new items, list unchanged). Total=${allItems.size}, elapsed=${((performance.now()-t0)/1000).toFixed(1)}s`);
        break;
      }
    }

    return Array.from(allItems.values());
  },

  async prepareForDownload(items, filterType) {
    const allMediaData = new Map(); // dedupKey (id+ext) -> {url, filename, type}
    const t0 = performance.now();

    window.Utils.Logger.log(`[Scanner.prepareForDownload] START — ${items.length} items, filterType="${filterType}"`);
    if (window.ProgressModal) window.ProgressModal.update(50, `Extracting media from ${items.length} posts...`);

    for (let i = 0; i < items.length; i++) {
      if (window.ProgressModal.isCancelled()) {
        window.Utils.Logger.warn(`[Scanner.prepareForDownload] CANCELLED at item ${i}`);
        break;
      }

      const item = items[i];
      const media = (item.details && item.details.apiPost)
        ? this.extractMediaFromAPIPost(item.details.apiPost)
        : (window.Utils.Logger.warn(`[Scanner.prepareForDownload]   [${i}] ${item.id}: no apiPost — skipping`), []);

      window.Utils.Logger.log(`[Scanner.prepareForDownload]   [${i}] ${item.id}: ${media.length} URL(s)`);

      for (const res of media) {
        if (!res.url) { window.Utils.Logger.warn(`[Scanner.prepareForDownload]     SKIP: missing url for id=${res.id}`); continue; }
        const ext = res.type === 'video' ? 'mp4' : 'jpg';
        const filename = `${res.id}.${ext}`;
        if (!allMediaData.has(filename)) {
          allMediaData.set(filename, { url: res.url, filename, type: res.type, metadata: res.metadata || null });
          window.Utils.Logger.log(`[Scanner.prepareForDownload]     ADDED: ${filename}`);
        } else {
          window.Utils.Logger.warn(`[Scanner.prepareForDownload]     DEDUP SKIP: ${filename}`);
        }
      }

      // Yield to event loop every 50 items to keep the UI responsive
      if (i % 50 === 49) {
        if (window.ProgressModal) window.ProgressModal.update(50 + ((i / items.length) * 40), `Processing ${i + 1}/${items.length}...`);
        await window.Utils.sleep(0);
      }
    }

    window.Utils.Logger.log(`[Scanner.prepareForDownload] Raw map (before dedup/filter): ${allMediaData.size} entries`);
    for (const [key, val] of allMediaData) {
      window.Utils.Logger.log(`[Scanner.prepareForDownload]   map[${key}] type=${val.type} url=${val.url.slice(0, 80)}`);
    }

    // Remove image thumbnails that have a matching video (same ID)
    const videoIds = new Set();
    for (const [key, item] of allMediaData) {
      if (item.type === 'video') videoIds.add(item.filename.replace('.mp4', ''));
    }
    window.Utils.Logger.log(`[Scanner.prepareForDownload] Video IDs found (will suppress matched images): [${[...videoIds].join(', ')}]`);
    let suppressedImages = 0;
    for (const [key, item] of allMediaData) {
      if (item.type === 'image' && videoIds.has(item.filename.replace('.jpg', ''))) {
        window.Utils.Logger.warn(`[Scanner.prepareForDownload] Suppressing image thumbnail: ${key} (has matching video)`);
        allMediaData.delete(key);
        suppressedImages++;
      }
    }
    window.Utils.Logger.log(`[Scanner.prepareForDownload] Suppressed ${suppressedImages} image thumbnail(s)`);

    let finalResults = Array.from(allMediaData.values());
    const rawVideoCount = finalResults.filter(item => item.filename.endsWith('.mp4')).length;
    const rawImageCount = finalResults.length - rawVideoCount;
    window.Utils.Logger.log(`[Scanner.prepareForDownload] Pre-filter totals: ${rawImageCount} images, ${rawVideoCount} videos`);

    if (filterType === 'saveImages') {
      finalResults = finalResults.filter(item => !item.filename.toLowerCase().endsWith('.mp4'));
      window.Utils.Logger.log(`[Scanner.prepareForDownload] filterType=saveImages → kept ${finalResults.length} images`);
    } else if (filterType === 'saveVideos') {
      finalResults = finalResults.filter(item => item.filename.toLowerCase().endsWith('.mp4'));
      window.Utils.Logger.log(`[Scanner.prepareForDownload] filterType=saveVideos → kept ${finalResults.length} videos`);
    } else {
      window.Utils.Logger.log(`[Scanner.prepareForDownload] filterType="${filterType}" → keeping all ${finalResults.length} items`);
    }

    window.Utils.Logger.log(`[Scanner.prepareForDownload] END — returning ${finalResults.length} items to download`);
    finalResults.forEach((item, i) => {
      window.Utils.Logger.log(`[Scanner.prepareForDownload]   final[${i}]: ${item.filename}  url=${item.url.slice(0, 80)}`);
    });

    return finalResults;
  }

};

window.MediaScanner = MediaScanner;
