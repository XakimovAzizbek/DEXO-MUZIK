// DEXO MUZIK - reels.js

const container = document.getElementById('reels-container');
const loading = document.getElementById('loading');

let items = [];
let order = [];
let currentIndex = 0;
let currentReelEl = null;
let userUnmuted = false; // becomes true after the first tap/swipe gesture

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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

function buildReel(item, isCurrent) {
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
  video.muted = false;
  // Only the video the user is actually watching downloads eagerly;
  // everything else stays lightweight until it becomes current.
  video.preload = isCurrent ? 'auto' : 'metadata';
  if (isCurrent && 'fetchPriority' in video) video.fetchPriority = 'high';
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

function renderCurrent() {
  container.innerHTML = '';
  const item = items[order[currentIndex]];
  const built = buildReel(item, true);
  built.reel.style.transform = 'translateY(0)';
  container.appendChild(built.reel);
  currentReelEl = built;
  tryPlay(built.video);
}

function nextRandom() {
  currentIndex++;
  if (currentIndex >= order.length) {
    order = shuffle(order);
    currentIndex = 0;
  }
  transitionTo('up');
}

function prevRandom() {
  currentIndex--;
  if (currentIndex < 0) currentIndex = 0;
  transitionTo('down');
}

function transitionTo(direction) {
  if (!currentReelEl) return;
  const oldReel = currentReelEl.reel;
  currentReelEl.video.pause();

  const item = items[order[currentIndex]];
  const built = buildReel(item, true);

  built.reel.style.transform = direction === 'up' ? 'translateY(100%)' : 'translateY(-100%)';
  container.appendChild(built.reel);

  requestAnimationFrame(() => {
    built.reel.style.transform = 'translateY(0)';
    oldReel.style.transform = direction === 'up' ? 'translateY(-100%)' : 'translateY(100%)';
  });

  setTimeout(() => {
    oldReel.remove();
  }, 380);

  currentReelEl = built;
  tryPlay(built.video);
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
    order = shuffle(items.map((_, i) => i));
    loading.style.display = 'none';
    renderCurrent();
  })
  .catch(() => {
    loading.textContent = 'reels.txt yuklashda xatolik';
  });
