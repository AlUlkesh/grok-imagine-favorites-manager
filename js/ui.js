/**
 * Grok Imagine Favorites Manager - UI
 */

var ProgressModal = {
  modal: null,
  cancelled: false,
  completed: false,

  create() {
    if (this.modal) return;

    this.modal = document.createElement('div');
    this.modal.id = 'grok-favorites-progress-modal';
    this.modal.innerHTML = `
      <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.4); z-index: 999999; display: flex; align-items: center; justify-content: center; font-family: -apple-system, system-ui, sans-serif; pointer-events: none;">
        <div style="background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 16px; padding: 32px; min-width: 440px; max-width: 560px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5); pointer-events: auto; overflow: visible;">
          <div style="font-size: 20px; font-weight: 600; color: #e5e5e5; margin-bottom: 8px;" id="grok-progress-title">Processing...</div>
          <div style="font-size: 14px; color: #888; margin-bottom: 20px;" id="grok-progress-subtitle">Please wait</div>
          <div style="background: #0a0a0a; border-radius: 8px; height: 8px; overflow: hidden; margin-bottom: 16px;">
            <div style="background: linear-gradient(90deg, #3b82f6, #8b5cf6); height: 100%; width: 0%; transition: width 0.3s ease; border-radius: 8px;" id="grok-progress-bar"></div>
          </div>
          <div style="font-size: 13px; color: #a0a0a0; line-height: 1.6; margin-bottom: 12px; white-space: normal; overflow: visible; word-break: break-word; min-width: 0;" id="grok-progress-details">Starting...</div>
          <div style="font-size: 12px; color: #60a5fa; margin-bottom: 16px; min-height: 16px;" id="grok-progress-substatus"></div>
          <button id="grok-cancel-button" style="width: 100%; padding: 10px 16px; background: #2a1a1a; border: 1px solid #4a2a2a; border-radius: 8px; color: #ff6b6b; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.15s ease;">
            Cancel Operation
          </button>
        </div>
      </div>`;

    document.body.appendChild(this.modal);
    document.getElementById('grok-cancel-button').addEventListener('click', () => this.cancel());
  },

  show(title, subtitle = '') {
    this.cancelled = false;
    this.completed = false;
    this.create();
    this.modal.style.display = 'flex';
    document.getElementById('grok-progress-title').textContent = title;
    document.getElementById('grok-progress-subtitle').textContent = subtitle;
    document.getElementById('grok-progress-bar').style.width = '0%';
    document.getElementById('grok-progress-bar').style.background = 'linear-gradient(90deg, #3b82f6, #8b5cf6)';
    document.getElementById('grok-progress-details').textContent = 'Starting...';
    document.getElementById('grok-progress-substatus').textContent = '';

    const cancelBtn = document.getElementById('grok-cancel-button');
    cancelBtn.textContent = 'Cancel Operation';
    cancelBtn.disabled = false;
    cancelBtn.style.opacity = '1';
    cancelBtn.style.color = '#ff6b6b';
    cancelBtn.style.background = '#2a1a1a';
    cancelBtn.style.borderColor = '#4a2a2a';
  },

  update(progress, details) {
    if (!this.modal) return;
    // Re-attach if SPA re-render removed it from the DOM
    if (!document.body.contains(this.modal)) {
      document.body.appendChild(this.modal);
      this.modal.style.display = 'flex';
    }
    const percentage = Math.min(100, Math.max(0, progress));
    const bar = document.getElementById('grok-progress-bar');
    if (bar) bar.style.width = `${percentage}%`;
    const detailsEl = document.getElementById('grok-progress-details');
    if (detailsEl) detailsEl.textContent = details;
  },

  updateSubStatus(text) {
    if (!this.modal) return;
    const sub = document.getElementById('grok-progress-substatus');
    if (sub) sub.textContent = text;
  },

  cancel() {
    if (this.completed) {
      this.remove();
      return;
    }
    this.cancelled = true;
    this.update(0, 'Cancelling operation...');
    const cancelBtn = document.getElementById('grok-cancel-button');
    if (cancelBtn) {
      cancelBtn.textContent = 'Cancelling...';
      cancelBtn.disabled = true;
      cancelBtn.style.opacity = '0.5';
    }
    setTimeout(() => this.remove(), 1000);
  },

  complete(summary) {
    if (!this.modal) return;
    if (!document.body.contains(this.modal)) document.body.appendChild(this.modal);
    this.modal.style.display = 'flex';
    this.completed = true;
    const bar = document.getElementById('grok-progress-bar');
    if (bar) {
      bar.style.width = '100%';
      bar.style.background = 'linear-gradient(90deg, #22c55e, #16a34a)';
    }
    const title = document.getElementById('grok-progress-title');
    if (title) title.textContent = 'Done';
    const subtitle = document.getElementById('grok-progress-subtitle');
    if (subtitle) subtitle.textContent = '';
    const details = document.getElementById('grok-progress-details');
    if (details) details.textContent = summary;
    const sub = document.getElementById('grok-progress-substatus');
    if (sub) sub.textContent = '';
    const cancelBtn = document.getElementById('grok-cancel-button');
    if (cancelBtn) {
      cancelBtn.textContent = 'Close';
      cancelBtn.disabled = false;
      cancelBtn.style.opacity = '1';
      cancelBtn.style.color = '#e5e5e5';
      cancelBtn.style.background = '#1a2a1a';
      cancelBtn.style.borderColor = '#2a4a2a';
    }
  },

  isCancelled() {
    return this.cancelled;
  },

  hide() {
    if (this.modal) this.modal.style.display = 'none';
  },

  remove() {
    if (this.modal) {
      this.modal.remove();
      this.modal = null;
    }
  }
};

window.ProgressModal = ProgressModal;
