// DEXO MUZIK - reels.js

const container = document.getElementById('reels-container');
const loading = document.getElementById('loading');

let items = [];
let userUnmuted = false; // becomes true after the first tap/swipe gesture

// --- History + slot cache -------------------------------------------------
// history[pos] = index into items[] that was shown at position "pos" in the
// sequence the user has scrolled through. historyPos is where they are now.
// slots[pos] = the already-built DOM/video for that position, kept alive in
// a small window around historyPos so that:
//   - swiping back to a video already seen reuses the same element instantly
//     (no reload / no loading screen again)
//   - the next video (historyPos + 1) is built and starts loading in the
//     background while the current one is still playing, so it's ready the
//     moment the user swipes to it
let history = [];
let historyPos = -1;
let slots = {};
let currentReelEl = null;

function randomIndex(avoidIndex) {
  if (items.length === 1) return 0;
  let idx;
  do {
    idx = Math.floor(Math.random() * items.length);
  } while (idx === avoidIndex);
  return idx;
}

function showToast(text) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 2200);
}

function downloadFile(url, filename, onDone) {
  // A plain <a download> gets ignored by mobile browsers for media files
  // (they just open the video/audio in a viewer instead of saving it).
  // Fetching the bytes as a blob and saving that forces a real download.
  fetch(url)
    .then(res => {
      if (!res.ok) throw new Error('network');
      return res.blob();
    })
    .then(blob => {
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename || '';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
      if (onDone) onDone(true);
    })
    .catch(() => {
      // Fallback: if fetch fails (e.g. CORS), at least open the file so the
      // user can save it manually instead of nothing happening.
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || '';
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (onDone) onDone(false);
    });
}

// Try to autoplay WITH sound immediately. Most mobile browsers block this
// unless the user has already interacted with the page at least once, in
// which case they silently force it back to muted - that's a browser/OS
// policy, not something a website can override. To get sound as early as
// possible we still attempt unmuted first, and unmute the instant ANY user
// interaction happens anywhere on the page (not just a tap on the video).
function tryPlay(video) {
  video.muted = false;
  const p = video.play();
  if (p && p.catch) {
    p.catch(() => {
      // Blocked - fall back to muted autoplay, will unmute on first gesture.
      video.muted = true;
      video.play().catch(() => {});
    });
  }
}

function unmuteAll() {
  if (userUnmuted) return;
  userUnmuted = true;
  if (currentReelEl) {
    currentReelEl.video.muted = false;
    currentReelEl.video.play().catch(() => {});
  }
}

// Catch the very first interaction anywhere on the page (tap, click, key,
// scroll) as early as possible so sound turns on immediately, not only
// when the user happens to tap directly on the video area.
['touchstart', 'pointerdown', 'click', 'keydown', 'scroll'].forEach(evt => {
  document.addEventListener(evt, unmuteAll, { passive: true, capture: true });
});

// mode: 'current' (being watched right now - loads eagerly, high priority)
//       'preload' (the next video - loads eagerly in the background so it's
//                  ready in time, but stays paused/muted and invisible)
//       'idle'    (kept alive only for instant back-navigation reuse; no
//                  extra loading effort beyond what it already buffered)
function buildReel(item, mode) {
  const reel = document.createElement('div');
  reel.className = 'reel';

  // Blurred backdrop - instead of streaming the video file a second time
  // (which doubled network usage and made slow connections worse), we grab
  // one frame from the main video locally with canvas and blur that as a
  // background image. Zero extra network cost.
  const bgLayer = document.createElement('div');
  bgLayer.className = 'bg-video';

  // Main video always shows the full untouched frame (contain), centered
  const video = document.createElement('video');
  video.className = 'main-video';
  video.src = encodeURI(item.video);
  video.loop = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.muted = true; // stays muted until it actually becomes the current one
  // The current video, and the very next one, load eagerly in the
  // background so playback is instant the moment the user swipes to it.
  // Anything further away stays lightweight until it's actually needed.
  video.preload = (mode === 'current' || mode === 'preload') ? 'auto' : 'metadata';
  if (mode === 'current' && 'fetchPriority' in video) video.fetchPriority = 'high';
  video.controls = false;

  // Capture a single frame locally (no network cost) to use as the blurred
  // backdrop, as soon as there's enough data to draw one.
  let bgCaptured = false;
  function captureBg() {
    if (bgCaptured || video.videoWidth === 0) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 90;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      bgLayer.style.backgroundImage = `url(${canvas.toDataURL('image/jpeg', 0.5)})`;
      bgCaptured = true;
    } catch (err) {
      // Cross-origin canvas taint or similar - just skip the backdrop.
    }
  }
  video.addEventListener('loadeddata', captureBg);
  video.addEventListener('playing', captureBg);

  video.addEventListener('error', () => {
    loading.style.display = 'block';
    loading.textContent = "Video ochilmadi: " + item.video;
  });

  // Buffering spinner - shows while the video stalls waiting for data on a
  // slow connection, hides as soon as it has enough to play smoothly.
  const spinner = document.createElement('div');
  spinner.className = 'buffer-spinner';
  video.addEventListener('waiting', () => spinner.classList.add('show'));
  video.addEventListener('stalled', () => spinner.classList.add('show'));
  video.addEventListener('playing', () => spinner.classList.remove('show'));
  video.addEventListener('canplay', () => spinner.classList.remove('show'));

  const overlay = document.createElement('div');
  overlay.className = 'reel-overlay';

  const menuBtn = document.createElement('div');
  menuBtn.className = 'menu-btn';
  menuBtn.innerHTML = '<span class="dots">•••</span>';

  const popup = document.createElement('div');
  popup.className = 'menu-popup';
  popup.innerHTML = `
    <button data-action="music"><span class="icon">🎵</span> Musiqa yuklash</button>
    <button data-action="video"><span class="icon">⬇️</span> Video yuklash</button>
  `;

  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    popup.classList.toggle('open');
  });

  popup.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    e.stopPropagation();
    popup.classList.remove('open');
    if (btn.dataset.action === 'music') {
      showToast('Musiqa yuklanmoqda...');
      downloadFile(encodeURI(item.music), item.music.split('/').pop(), (ok) => {
        showToast(ok ? 'Musiqa yuklandi ✓' : 'Musiqa ochildi, saqlab oling');
      });
    } else {
      showToast('Video yuklanmoqda...');
      downloadFile(encodeURI(item.video), item.video.split('/').pop(), (ok) => {
        showToast(ok ? 'Video yuklandi ✓' : 'Video ochildi, saqlab oling');
      });
    }
  });

  overlay.appendChild(menuBtn);
  reel.appendChild(bgLayer);
  reel.appendChild(video);
  reel.appendChild(spinner);
  reel.appendChild(overlay);
  reel.appendChild(popup);

  reel.addEventListener('click', (e) => {
    if (e.target.closest('.menu-btn') || e.target.closest('.menu-popup')) return;
    unmuteAll();
    if (video.paused) tryPlay(video); else video.pause();
  });

  return { reel, video, popup };
}

// Get the slot at `pos`, building it if it doesn't exist yet. `mode` only
// matters the first time a slot is built (it decides how eagerly its video
// loads); reusing an existing slot never rebuilds or reloads it.
function ensureSlot(pos, mode) {
  if (pos < 0) return null;
  if (slots[pos]) return slots[pos];

  let itemIndex;
  if (pos < history.length) {
    itemIndex = history[pos];
  } else {
    itemIndex = randomIndex(pos > 0 ? history[pos - 1] : null);
    history[pos] = itemIndex;
  }

  const built = buildReel(items[itemIndex], mode);
  built.reel.style.transition = 'none';
  built.reel.style.transform = `translate3d(0, ${(pos - historyPos) * 100}%, 0)`;
  container.appendChild(built.reel);
  // Force layout so the transform above is committed before anything else
  // touches this element (avoids a flash at the wrong position).
  void built.reel.offsetHeight;
  built.reel.style.transition = '';

  slots[pos] = built;
  return built;
}

// Keep only historyPos-1 .. historyPos+1 alive; anything further gets its
// video fully released (so memory/network isn't wasted on far-away reels),
// and make sure the immediate neighbors exist (building the "next" one is
// exactly the background preloading the user asked for).
function settleSlots() {
  Object.keys(slots).forEach(k => {
    const pos = Number(k);
    if (pos === historyPos) return;
    const rel = pos - historyPos;
    const s = slots[pos];
    if (Math.abs(rel) > 1) {
      s.video.pause();
      s.video.removeAttribute('src');
      s.video.load();
      s.reel.remove();
      delete slots[pos];
    } else {
      s.reel.style.transition = 'none';
      s.reel.style.transform = `translate3d(0, ${rel * 100}%, 0)`;
      void s.reel.offsetHeight;
      s.reel.style.transition = '';
    }
  });

  ensureSlot(historyPos + 1, 'preload');
  if (historyPos - 1 >= 0) ensureSlot(historyPos - 1, 'idle');
}

function start() {
  historyPos = 0;
  const cur = ensureSlot(0, 'current');
  cur.reel.style.transform = 'translate3d(0,0,0)';
  currentReelEl = cur;
  tryPlay(cur.video);
  settleSlots();
}

function goTo(toPos, direction) {
  if (toPos < 0) return;
  const fromBuilt = slots[historyPos];
  if (!fromBuilt) return;

  // Already preloaded (or cached from before) - this is what makes both
  // directions instant instead of showing a loading screen again.
  const toBuilt = ensureSlot(toPos, toPos > historyPos ? 'preload' : 'idle');

  fromBuilt.video.pause();

  toBuilt.reel.style.transition = 'none';
  toBuilt.reel.style.transform = direction === 'up' ? 'translate3d(0,100%,0)' : 'translate3d(0,-100%,0)';
  void toBuilt.reel.offsetHeight;

  // Double rAF: the first frame just commits the starting position (no
  // transition yet), the second frame re-enables the transition and moves
  // to the final position - this guarantees the browser never skips/merges
  // the start frame, which is what caused the jerky snap before.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toBuilt.reel.style.transition = '';
      toBuilt.reel.style.transform = 'translate3d(0,0,0)';
      fromBuilt.reel.style.transform = direction === 'up' ? 'translate3d(0,-100%,0)' : 'translate3d(0,100%,0)';
    });
  });

  historyPos = toPos;
  currentReelEl = toBuilt;
  tryPlay(toBuilt.video);

  setTimeout(settleSlots, 340);
}

function nextRandom() {
  goTo(historyPos + 1, 'up');
}

function prevRandom() {
  if (historyPos <= 0) return;
  goTo(historyPos - 1, 'down');
}

// Swipe handling
let touchStartY = 0;
let touchEndY = 0;

container.addEventListener('touchstart', (e) => {
  touchStartY = e.touches[0].clientY;
}, { passive: true });

container.addEventListener('touchend', (e) => {
  touchEndY = e.changedTouches[0].clientY;
  const diff = touchStartY - touchEndY;
  if (diff > 50) {
    nextRandom();
  } else if (diff < -50) {
    prevRandom();
  }
}, { passive: true });

// Parse reels.txt
function parseReelsTxt(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const parsed = [];
  let currentVideo = null;

  lines.forEach(line => {
    if (line.toLowerCase().startsWith('video:')) {
      currentVideo = line.substring(line.indexOf(':') + 1).trim();
    } else if (line.toLowerCase().startsWith('music:')) {
      const music = line.substring(line.indexOf(':') + 1).trim();
      if (currentVideo) {
        parsed.push({ video: currentVideo, music: music });
        currentVideo = null;
      }
    }
  });

  return parsed;
}

fetch('reels.txt')
  .then(res => res.text())
  .then(text => {
    items = parseReelsTxt(text);
    if (items.length === 0) {
      loading.textContent = "reels.txt bo'sh yoki topilmadi";
      return;
    }
    loading.style.display = 'none';
    start();
  })
  .catch(() => {
    loading.textContent = 'reels.txt yuklashda xatolik';
  });
