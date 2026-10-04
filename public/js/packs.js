// Client-side packs UI (localStorage). Works with /data/packs.json and public/packs.html
const PACKS_URL = '/data/packs.json';
const STORAGE_KEY = 'pack_progress_v1';
const POINTS_KEY = 'user_points_v1';

function readStorage() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
}
function writeStorage(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
function getPoints() {
  return Number(localStorage.getItem(POINTS_KEY) || 0);
}
function setPoints(n) {
  localStorage.setItem(POINTS_KEY, String(n));
  const el = document.getElementById('points-count');
  if (el) el.textContent = n;
}

async function loadPacks() {
  const res = await fetch(PACKS_URL);
  if (!res.ok) {
    const container = document.getElementById('packs-container');
    if (container) container.textContent = 'Failed to load packs.';
    return;
  }
  const packs = await res.json();
  renderPacks(packs);
  setPoints(getPoints());
}

function renderPacks(packs) {
  const container = document.getElementById('packs-container');
  if (!container) return;
  container.innerHTML = '';
  const progress = readStorage();

  packs.forEach(pack => {
    const card = document.createElement('article');
    card.className = 'pack-card';

    const header = document.createElement('div');
    header.className = 'pack-header';
    header.innerHTML = `<h3>${escapeHtml(pack.title)}</h3><span class="reward">${pack.pointsReward} pts</span>`;
    card.appendChild(header);

    const desc = document.createElement('p');
    desc.className = 'pack-desc';
    desc.textContent = pack.description || '';
    card.appendChild(desc);

    const ul = document.createElement('ul');
    ul.className = 'levels';
    pack.levels.forEach(level => {
      const li = document.createElement('li');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = `cb-${level.id}`;
      cb.checked = !!progress[level.id];
      cb.addEventListener('change', () => toggleLevel(level.id, pack.id));
      li.appendChild(cb);

      const label = document.createElement('label');
      label.htmlFor = cb.id;
      label.textContent = level.title;
      li.appendChild(label);

      ul.appendChild(li);
    });
    card.appendChild(ul);

    const prog = document.createElement('div');
    prog.className = 'pack-progress';
    const doneCount = pack.levels.filter(l => progress[l.id]).length;
    const percent = Math.round(doneCount / pack.levels.length * 100);
    prog.textContent = `Progress: ${doneCount}/${pack.levels.length} (${percent}%)`;
    card.appendChild(prog);

    // New: links section (Leaderboard / List / Roulette)
    const links = document.createElement('div');
    links.className = 'pack-links';
    const pages = ['Leaderboard', 'List', 'Roulette'];
    pages.forEach(page => {
      const a = document.createElement('a');
      a.className = 'pack-link-btn';
      const slug = page.toLowerCase();
      // Link to simple pages; include pack id as query param so pages can read it
      a.href = `/${slug}.html?pack=${encodeURIComponent(pack.id)}`;
      a.textContent = page;
      links.appendChild(a);
    });
    card.appendChild(links);

    const claim = document.createElement('button');
    claim.className = 'claim-btn';
    const claimedKey = `pack_claimed_${pack.id}`;
    const claimed = localStorage.getItem(claimedKey) === 'true';
    claim.textContent = claimed ? 'Claimed' : 'Claim reward';
    claim.disabled = !isPackCompleted(progress, pack) || claimed;
    claim.addEventListener('click', () => claimPack(pack));
    card.appendChild(claim);

    container.appendChild(card);
  });
}

function toggleLevel(levelId, packId) {
  const storage = readStorage();
  storage[levelId] = !storage[levelId];
  writeStorage(storage);
  loadPacks(); // re-render
  // If you have a server: POST completion to your API here
}

function isPackCompleted(progress, pack) {
  return pack.levels.every(l => progress[l.id] === true);
}

function claimPack(pack) {
  const claimedKey = `pack_claimed_${pack.id}`;
  if (localStorage.getItem(claimedKey) === 'true') {
    alert('Already claimed.');
    return;
  }
  // Award points locally
  const newPoints = getPoints() + pack.pointsReward;
  setPoints(newPoints);
  localStorage.setItem(claimedKey, 'true');
  alert(`Pack completed: ${pack.title}! You gained ${pack.pointsReward} points.`);
  loadPacks();
  // For server-backed: call POST /api/users/:id/claim-pack
}

function escapeHtml(s){ return String(s).replace(/[&<>\"']+/g, c=> ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":"&#39;"}[c])); }

// Initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadPacks);
} else {
  loadPacks();
}
