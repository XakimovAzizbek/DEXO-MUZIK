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

function downloadFile(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || '';
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Safari/iOS + most mobile browsers block autoplay with sound. Videos start
// muted so they always autoplay, then unmute themselves the instant the user
// interacts (tap or swipe) with the page.
function tryPlay(video) {
  video.muted = !userUnmuted;
  const p = video.play();
  if (p && p.catch) {
    p.catch(() => {
      // Autoplay still blocked (rare) - fall back to muted playback.
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
  }
}

function buildReel(item) {
  const reel = document.createElement('div');
  reel.className = 'reel';

  // Blurred backdrop fills the screen no matter the source ratio
  const bgVideo = document.createElement('video');
  bgVideo.className = 'bg-video';
  bgVideo.src = encodeURI(item.video);
  bgVideo.loop = true;
  bgVideo.muted = true;
  bgVideo.playsInline = true;
  bgVideo.setAttribute('playsinline', '');
  bgVideo.preload = 'auto';

  // Main video always shows the full untouched frame (contain), centered
  const video = document.createElement('video');
  video.className = 'main-video';
  video.src = encodeURI(item.video);
  video.loop = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.muted = !userUnmuted;
  video.preload = 'auto';
  video.controls = false;

  // Keep the blurred backdrop synced with the main video
  video.addEventListener('play', () => { bgVideo.currentTime = video.currentTime; bgVideo.play().catch(() => {}); });
  video.addEventListener('pause', () => bgVideo.pause());
  video.addEventListener('seeked', () => { bgVideo.currentTime = video.currentTime; });

  video.addEventListener('error', () => {
    loading.style.display = 'block';
    loading.textContent = "Video ochilmadi: " + item.video;
  });

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
      downloadFile(encodeURI(item.music), item.music.split('/').pop());
      showToast('Musiqa yuklanmoqda...');
    } else {
      downloadFile(encodeURI(item.video), item.video.split('/').pop());
      showToast('Video yuklanmoqda...');
    }
  });

  overlay.appendChild(menuBtn);
  reel.appendChild(bgVideo);
  reel.appendChild(video);
  reel.appendChild(overlay);
  reel.appendChild(popup);

  reel.addEventListener('click', (e) => {
    if (e.target.closest('.menu-btn') || e.target.closest('.menu-popup')) return;
    unmuteAll();
    if (video.paused) tryPlay(video); else video.pause();
  });

  return { reel, video, bgVideo, popup };
}

function renderCurrent() {
  container.innerHTML = '';
  const item = items[order[currentIndex]];
  const built = buildReel(item);
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
  currentReelEl.bgVideo.pause();

  const item = items[order[currentIndex]];
  const built = buildReel(item);

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
  unmuteAll();
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
