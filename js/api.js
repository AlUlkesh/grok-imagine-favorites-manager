/**
 * Grok Imagine Favorites Manager - API Layer
 */

var Api = {
  endpoints: {
    postList: 'https://grok.com/rest/media/post/list'
  },

  /**
   * Fetch one page of posts from the REST API.
   * @param {object} filter - e.g. { source: 'MEDIA_POST_SOURCE_LIKED', safeForWork: false }
   * @param {string|null} cursor - pagination cursor from previous page, or null for first page
   * @returns {Promise<{posts: object[], nextCursor: string|undefined}>}
   */
  async fetchPostList(filter, cursor) {
    const body = { limit: 40, filter };
    if (cursor) body.cursor = cursor;
    const resp = await fetch(this.endpoints.postList, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body)
    });
    if (!resp.ok) throw new Error(`post/list HTTP ${resp.status}`);
    return resp.json();
  },

  /**
   * Fetch ALL posts for a given filter, paginating automatically.
   * @param {object} filter
   * @returns {Promise<object[]>} flat array of all post objects
   */
  async fetchAllPosts(filter) {
    const posts = [];
    let cursor = null;
    do {
      const page = await this.fetchPostList(filter, cursor);
      const batch = page.posts || [];
      posts.push(...batch);
      cursor = page.nextCursor || null;
      console.log(`[Api.fetchAllPosts] page +${batch.length} (cursor=${cursor}), total=${posts.length}`);
    } while (cursor);
    return posts;
  },

  /**
   * Send collected media list to background script to start downloads
   */
  startDownloads(mediaList) {
    if (!mediaList || mediaList.length === 0) {
      console.warn('[Api.startDownloads] Called with empty/null list — aborting');
      return;
    }
    console.log(`[Api.startDownloads] Sending ${mediaList.length} items to background for download`);
    chrome.runtime.sendMessage({ action: 'startDownloads', media: mediaList });
  }
};

window.Api = Api;
