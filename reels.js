// DEXO MUZIK - reels.js

const container = document.getElementById('reels-container');
const loading = document.getElementById('loading');

let items = [];
let order = [];
let currentIndex = 0;
let currentReelEl = null;

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
  }, 1800);
}

function downloadFile(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || '';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function buildReel(item) {
  const reel = document.createElement('div');
  reel.className = 'reel';

  const video = document.createElement('video');
  video.src = item.video;
  video.loop = true;
  video.autoplay = true;
  video.playsInline = true;
  video.muted = false;
  video.controls = false;

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
      downloadFile(item.music, item.music.split('/').pop());
      showToast('Musiqa yuklanmoqda...');
    } else {
      downloadFile(item.video, item.video.split('/').pop());
      showToast('Video yuklanmoqda...');
    }
  });

  overlay.appendChild(menuBtn);
  reel.appendChild(video);
  reel.appendChild(overlay);
  reel.appendChild(popup);

  reel.addEventListener('click', (e) => {
    if (e.target.closest('.menu-btn') || e.target.closest('.menu-popup')) return;
    if (video.paused) video.play(); else video.pause();
  });

  return { reel, video, popup };
}

function renderCurrent() {
  container.innerHTML = '';
  const item = items[order[currentIndex]];
  const { reel, video } = buildReel(item);
  reel.style.transform = 'translateY(0)';
  container.appendChild(reel);
  currentReelEl = { reel, video };
  video.play().catch(() => {});
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
  const { reel, video } = buildReel(item);

  reel.style.transform = direction === 'up' ? 'translateY(100%)' : 'translateY(-100%)';
  container.appendChild(reel);

  requestAnimationFrame(() => {
    reel.style.transform = 'translateY(0)';
    oldReel.style.transform = direction === 'up' ? 'translateY(-100%)' : 'translateY(100%)';
  });

  setTimeout(() => {
    oldReel.remove();
  }, 380);

  currentReelEl = { reel, video };
  video.play().catch(() => {});
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
