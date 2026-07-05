// Runs on youtube.com/watch* pages.
// Reads the native <video> element's playback state and stores it
// in chrome.storage.local so the catalog page can pick it up.
// No YouTube API calls involved — this is purely local DOM reading.
//
// Two things are tracked separately:
// - "nowWatching": transient, live state used for the floating widget.
//   Cleared when the tab closes/navigates away.
// - "watchProgress": a persistent map { videoId: { pct, updatedAt } }.
//   NEVER cleared automatically — this is what lets the catalog keep
//   showing "42% просмотрено" even after you close the YouTube tab.

(function () {
  function getVideoId() {
    try {
      const params = new URLSearchParams(location.search);
      return params.get('v');
    } catch (e) {
      return null;
    }
  }

  function getTitle() {
    return document.title.replace(/\s*-\s*YouTube\s*$/, '').trim();
  }

  function persistProgress(id, pct) {
    chrome.storage.local.get('watchProgress', (data) => {
      const map = data.watchProgress || {};
      map[id] = { pct, updatedAt: Date.now() };
      chrome.storage.local.set({ watchProgress: map });
    });
  }

  function sendUpdate() {
    const video = document.querySelector('video');
    const id = getVideoId();

    if (!video || !id || !video.duration || isNaN(video.duration) || video.duration === Infinity) {
      chrome.storage.local.set({ nowWatching: null });
      return;
    }

    const pct = Math.min(100, (video.currentTime / video.duration) * 100);

    // Always persist progress for this video, watched or not finished.
    persistProgress(id, pct);

    // Live "now watching" widget state — stops being reported once
    // the video is basically finished.
    if (pct >= 97) {
      chrome.storage.local.set({ nowWatching: null });
      return;
    }

    chrome.storage.local.set({
      nowWatching: {
        id,
        title: getTitle(),
        currentTime: video.currentTime,
        duration: video.duration,
        paused: video.paused,
        updatedAt: Date.now()
      }
    });
  }

  const POLL_MS = 2000;
  const intervalId = setInterval(sendUpdate, POLL_MS);
  sendUpdate();

  // On tab close/navigation: do one last save so the final percentage
  // is accurate, then clear only the live widget state (watchProgress stays).
  window.addEventListener('pagehide', () => {
    clearInterval(intervalId);
    const video = document.querySelector('video');
    const id = getVideoId();
    if (video && id && video.duration && !isNaN(video.duration)) {
      const pct = Math.min(100, (video.currentTime / video.duration) * 100);
      persistProgress(id, pct);
    }
    chrome.storage.local.set({ nowWatching: null });
  });
})();

