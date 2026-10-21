const APP_MODE = document.documentElement.dataset.hiMeMode === 'guest' ? 'guest' : 'cloud';
const IS_GUEST = APP_MODE === 'guest';
const STORAGE_KEY = IS_GUEST ? 'hi-me:guest:v1' : 'hi-me:v1';
const PALETTE_VERSION = 2;
const paletteSets = [
  { color: '#F4DFE6', timeline: ['#E0A3BB', '#F0C2D1', '#D6E6E7'] },
  { color: '#9EBEED', timeline: ['#9EBEED', '#BCD0ED', '#D6E6E7'] },
  { color: '#BAACEB', timeline: ['#BAACEB', '#D8CEF4', '#C5CC82'] },
  { color: '#C5CC82', timeline: ['#C5CC82', '#DCE4AD', '#9EBEED'] },
  { color: '#D6E6E7', timeline: ['#D6E6E7', '#B9D5D7', '#F4DFE6'] },
  { color: '#E8C98B', timeline: ['#E8C98B', '#F0DDB4', '#BAACEB'] }
];
const typeLabels = { book: '书', movie: '电影', documentary: '纪录片', series: '剧集', other: '其他' };
const statusLabels = { wish: '想看', reading: '正在相遇', done: '已完成', paused: '暂时停泊' };

const pages = [...document.querySelectorAll('.page')];
const navLinks = [...document.querySelectorAll('.nav-link')];
const appShell = document.getElementById('appShell');
const toast = document.getElementById('toast');
const hoverCard = document.getElementById('hoverCard');
const workModal = document.getElementById('workModal');
const today = new Date();
const todayISO = localISO(today);
let timelineCursor = new Date(today.getFullYear(), today.getMonth(), 1);
let activeWorkId = '';
let detailOrigin = 'universe';
let recordFilter = 'all';
let toastTimer;
let hideTimer;
let state = loadState();
let cloudRevision = 0;
let cloudReady = false;
let cloudDirty = false;
let cloudTimer;
let cloudSyncInFlight = false;
let cloudSyncQueued = false;
let migrationCard;
let syncIndicator;

function localISO(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (stored?.works && Array.isArray(stored.works)) {
      const works = stored.works.map(normalizeWork);
      if (stored.paletteVersion !== PALETTE_VERSION) works.forEach(applyBrightPalette);
      const loaded = { works, paletteVersion: PALETTE_VERSION };
      if (stored.paletteVersion !== PALETTE_VERSION) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(loaded)); } catch (error) { /* keep loaded records in memory */ }
      }
      return loaded;
    }
  } catch (error) { /* use sample data */ }
  const works = [];
  const initial = { works, paletteVersion: PALETTE_VERSION };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(initial)); } catch (error) { /* preview still works */ }
  return initial;
}

function applyBrightPalette(work, index) {
  const palette = paletteSets[index % paletteSets.length];
  work.color = palette.color;
  work.timelineColors = [...palette.timeline];
  return work;
}

function normalizeWork(work, index) {
  const palette = paletteSets[index % paletteSets.length];
  return {
    id: work.id || `work-${Date.now().toString(36)}-${index}`, archive: work.archive || String(43 + index).padStart(4, '0'),
    title: work.title || '未命名作品', english: work.english || work.title || 'UNTITLED', type: work.type || 'other', year: work.year || '', creator: work.creator || '', status: work.status || 'wish', rating: work.rating || '',
    quote: work.quote || '还没有写下一句话。', color: work.color || palette.color, timelineColors: Array.isArray(work.timelineColors) && work.timelineColors.length ? work.timelineColors : palette.timeline,
    coverImage: work.coverImage || null, createdAt: work.createdAt || todayISO, completedAt: work.completedAt || null,
    lightDates: Array.isArray(work.lightDates) ? [...new Set(work.lightDates)] : [],
    notes: Array.isArray(work.notes) ? work.notes.map(note => Array.isArray(note) ? { date: String(note[0]).slice(0,10), text: note[1] || '', tag: note[2] || '' } : note) : []
  };
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (!IS_GUEST && cloudReady) {
      cloudDirty = true;
      scheduleCloudSync();
    }
    return true;
  }
  catch (error) { showToast('浏览器存储空间不足；请尝试使用更小的封面图片'); return false; }
}

function createGuestUI() {
  document.body.classList.add('guest-mode');
  const notice = document.createElement('div');
  notice.className = 'guest-device-notice';
  notice.setAttribute('role', 'status');
  notice.textContent = '体验宇宙 · 仅保存在此设备';
  document.body.appendChild(notice);
  const sidebarCopy = document.querySelector('.sidebar-foot p');
  if (sidebarCopy) sidebarCopy.innerHTML = '本机档案<br><b>仅此设备</b>';
  const description = document.getElementById('meDescription');
  if (description) description.textContent = '这是这台设备里的独立宇宙。清除浏览器数据或更换设备后，记录不会自动迁移。';
  const storageNote = document.getElementById('storageNote');
  if (storageNote) storageNote.textContent = '体验空间的记录与封面仅保存在当前设备的这个浏览器里。';
}

function createCloudUI() {
  syncIndicator = document.createElement('div');
  syncIndicator.className = 'cloud-sync-indicator';
  syncIndicator.setAttribute('role', 'status');
  syncIndicator.innerHTML = '<i></i><span>连接私人云端…</span>';
  document.querySelector('.sidebar-foot')?.prepend(syncIndicator);

  const lockButton = document.createElement('button');
  lockButton.className = 'archive-lock-button';
  lockButton.type = 'button';
  lockButton.textContent = '锁定档案';
  lockButton.addEventListener('click', async () => {
    lockButton.disabled = true;
    await fetch('/api/session', { method: 'DELETE' });
    location.replace('/');
  });
  document.querySelector('.sidebar-foot')?.appendChild(lockButton);

  migrationCard = document.createElement('section');
  migrationCard.className = 'migration-card';
  migrationCard.hidden = true;
  migrationCard.innerHTML = `
    <button class="migration-dismiss" type="button" aria-label="稍后再说">×</button>
    <p>DAY 9 · 云端档案</p>
    <h2>把这台电脑里的记录带到手机上</h2>
    <div class="migration-counts" id="migrationCounts"></div>
    <p class="migration-help">确认后才会上传；原来的本地副本仍会保留。</p>
    <button class="migration-confirm" type="button">同步到我的私人云端</button>`;
  document.body.appendChild(migrationCard);
  migrationCard.querySelector('.migration-confirm').addEventListener('click', migrateLocalArchive);
  migrationCard.querySelector('.migration-dismiss').addEventListener('click', () => { migrationCard.hidden = true; setCloudStatus('等待迁移', 'waiting'); });
}

function setCloudStatus(label, mode = '') {
  if (!syncIndicator) return;
  syncIndicator.className = `cloud-sync-indicator ${mode ? `is-${mode}` : ''}`;
  syncIndicator.querySelector('span').textContent = label;
}

function migrationCounts() {
  return {
    works: state.works.length,
    lights: state.works.reduce((total, work) => total + work.lightDates.length, 0),
    notes: state.works.reduce((total, work) => total + work.notes.length, 0)
  };
}

function showMigrationCard() {
  const counts = migrationCounts();
  migrationCard.querySelector('#migrationCounts').innerHTML = `<b>${counts.works}</b> 部作品 <span>·</span> <b>${counts.lights}</b> 次点亮 <span>·</span> <b>${counts.notes}</b> 张便签`;
  migrationCard.hidden = false;
  setCloudStatus('等待迁移', 'waiting');
}

function renderAllViews() {
  renderHome(); renderTimeline(); renderUniverse(); renderRecords();
  if (document.getElementById('detail').classList.contains('is-active') && findWork(activeWorkId)) renderDetail(activeWorkId);
}

async function refreshCloud({ force = false } = {}) {
  if (cloudDirty && !force) return;
  try {
    setCloudStatus('正在读取云端…', 'syncing');
    const response = await fetch('/api/archive', { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || '云端读取失败');
    const serverWorks = Array.isArray(payload.state?.works) ? payload.state.works : [];
    const serverHasArchive = payload.revision > 0 || serverWorks.length > 0;
    cloudRevision = Number(payload.revision) || 0;
    if (serverHasArchive) {
      state = { works: serverWorks.map(normalizeWork), paletteVersion: PALETTE_VERSION };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      activeWorkId = findWork(activeWorkId)?.id || state.works[0]?.id || '';
      cloudReady = true; cloudDirty = false; migrationCard.hidden = true;
      renderAllViews(); routeFromHash(false);
      setCloudStatus('已同步', 'ready');
      return;
    }
    if (state.works.length) {
      cloudReady = false;
      showMigrationCard();
    } else {
      cloudReady = true;
      setCloudStatus('已同步', 'ready');
    }
  } catch (error) {
    cloudReady = false;
    setCloudStatus('本机保存中', 'offline');
    console.warn('Hi!Me cloud read failed:', error);
  }
}

function scheduleCloudSync() {
  clearTimeout(cloudTimer);
  setCloudStatus('等待同步…', 'syncing');
  cloudTimer = setTimeout(() => syncCloud(false), 550);
}

async function syncCloud(migration = false) {
  if (!cloudReady && !migration) return;
  if (cloudSyncInFlight) { cloudSyncQueued = true; return; }
  cloudSyncInFlight = true;
  setCloudStatus(migration ? '正在迁移…' : '正在同步…', 'syncing');
  try {
    const response = await fetch('/api/archive', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision: cloudRevision, state, migration })
    });
    const payload = await response.json();
    if (response.status === 409) {
      localStorage.setItem(`hi-me:conflict:${Date.now()}`, JSON.stringify(state));
      cloudDirty = false;
      await refreshCloud({ force: true });
      showToast('另一台设备已有新记录，已刷新；本机冲突副本已保留');
      return;
    }
    if (!response.ok) throw new Error(payload.error || '同步失败');
    cloudRevision = payload.revision;
    cloudReady = true; cloudDirty = false; migrationCard.hidden = true;
    setCloudStatus('已同步', 'ready');
    if (migration) {
      showToast(`已迁移 ${payload.counts.works} 部作品，现在可以在手机上打开了`);
      await refreshCloud({ force: true });
    }
  } catch (error) {
    cloudDirty = true;
    setCloudStatus('稍后重试', 'offline');
    showToast(error.message || '云端同步暂时失败，本机记录仍已保存');
  } finally {
    cloudSyncInFlight = false;
    if (cloudSyncQueued) { cloudSyncQueued = false; syncCloud(false); }
  }
}

async function migrateLocalArchive() {
  const button = migrationCard.querySelector('.migration-confirm');
  button.disabled = true; button.textContent = '正在整理档案…';
  await syncCloud(true);
  button.disabled = false; button.textContent = '同步到我的私人云端';
}

function escapeHTML(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function showToast(message) {
  toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2300);
}

function findWork(id) { return state.works.find(work => work.id === id); }
function allWorkDates(work) { return [...new Set([...(work.lightDates || []), ...(work.notes || []).map(note => note.date)].filter(Boolean))].sort(); }
function displayDate(value) { return value ? value.replaceAll('-', '.') : '—'; }
function workKind(work) { return `${typeLabels[work.type] || '其他'}${work.year ? ` · ${work.year}` : ''}`; }
function completionWords(work) {
  if (work.type === 'book') return { action: '标记读完', past: '已读完', badge: '读完', date: '读完日期' };
  if (work.type === 'movie' || work.type === 'documentary' || work.type === 'series') return { action: '标记看完', past: '已看完', badge: '看完', date: '看完日期' };
  return { action: '标记完成', past: '已完成', badge: '完成', date: '完成日期' };
}
function statusText(work) { return work.status === 'done' ? completionWords(work).past : statusLabels[work.status]; }
function noteCountLabel(count) { return count === 0 ? '还没有便签' : `时间里的${['零','一','两','三','四','五','六','七','八','九','十'][count] || count}张便签`; }
function futureMessage(work) {
  if (work.status === 'wish') return '还没有开始。<br>第一张便签会从相遇的那天出现。';
  if (work.status === 'paused') return '暂时停泊中。<br>再次打开时，时间会从这里继续。';
  if (work.status === 'done') return '作品完成了。<br>以后重看时，仍然可以添加便签。';
  return '下一次相遇时，<br>可以继续在这里添加便签。';
}

function showPage(id, push = true) {
  const target = document.getElementById(id); if (!target) return;
  pages.forEach(page => page.classList.toggle('is-active', page === target));
  navLinks.forEach(link => link.classList.toggle('is-active', link.dataset.page === id || (id === 'detail' && link.dataset.page === 'records')));
  appShell.classList.toggle('universe-mode', id === 'universe');
  if (id === 'home') renderHome();
  if (id === 'timeline') renderTimeline();
  if (id === 'universe') renderUniverse();
  if (id === 'records') renderRecords();
  const titles = { home: '首页', timeline: '时间轴', universe: '宇宙', records: '记录', detail: '作品记录', me: '我' };
  document.title = `${titles[id] || 'Hi！Me'} · ${IS_GUEST ? 'Hi！Me 本机体验' : 'Hi！Me'}`;
  if (push) history.pushState({ page: id }, '', `#${id}`);
}

function renderHome() {
  const weekdays = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
  document.getElementById('homeDate').textContent = `${weekdays[today.getDay()]} · ${today.getFullYear()}.${String(today.getMonth()+1).padStart(2,'0')}.${String(today.getDate()).padStart(2,'0')}`;
  document.getElementById('homeWindowDate').textContent = `${String(today.getMonth()+1).padStart(2,'0')} · ${String(today.getDate()).padStart(2,'0')}`;
  const readingWorks = state.works.filter(item => item.status === 'reading');
  const list = document.getElementById('homeWorksList');
  document.getElementById('homeReadingCount').textContent = `${readingWorks.length} 部作品`;
  if (!readingWorks.length) {
    list.innerHTML = '<button class="home-empty" data-page="records">现在没有正在相遇的作品<br><span>去作品档案看看 →</span></button>';
    document.getElementById('homeNote').textContent = state.works.length ? '今天还没有正在相遇的作品' : '档案目前是空的';
    return;
  }
  list.innerHTML = readingWorks.map(work => {
    const isLit = work.lightDates.includes(todayISO);
    return `<article class="current-work" data-open-detail="${escapeHTML(work.id)}">
      <div class="work-line"><div class="home-work-copy">
        <p class="work-type">${escapeHTML(typeLabels[work.type] || '其他')} · 第 ${work.lightDates.length} 次点亮</p>
        <h2>${escapeHTML(work.title)}</h2>
        <p>${escapeHTML(work.creator || '未填写作者 / 导演')}</p>
      </div><button class="light-button ${isLit ? 'is-lit' : ''}" data-light-work="${escapeHTML(work.id)}" aria-label="${isLit ? `撤回《${escapeHTML(work.title)}》今天的点亮` : `点亮《${escapeHTML(work.title)}》的今天`}">
        <span class="light-core"></span><b>${isLit ? '今天已点亮' : '点亮今日'}</b>
      </button></div>
    </article>`;
  }).join('');
  const todayLit = readingWorks.filter(work => work.lightDates.includes(todayISO)).length;
  const latest = readingWorks.flatMap(allWorkDates).sort().at(-1);
  document.getElementById('homeNote').innerHTML = `${readingWorks.length} 部作品正在相遇 · 今日点亮 ${todayLit} 部<br>最近记录：${latest ? displayDate(latest) : '尚未开始'}`;
}

function toggleToday(workId) {
  const work = findWork(workId); if (!work) return;
  const index = work.lightDates.indexOf(todayISO);
  if (index >= 0) work.lightDates.splice(index, 1);
  else { work.lightDates.push(todayISO); work.lightDates.sort(); if (work.status === 'wish' || work.status === 'paused') work.status = 'reading'; }
  saveState(); renderHome(); renderTimeline(); renderUniverse(); renderRecords();
  showToast(index >= 0 ? '已撤回今天的点亮' : '今天的相遇已经留下');
}

function renderTimeline() {
  const year = timelineCursor.getFullYear(), month = timelineCursor.getMonth(), monthNumber = month + 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  document.getElementById('timeline-title').textContent = `${year} 年 ${monthNumber} 月`;
  document.getElementById('timelineMonthLabel').textContent = `${monthNumber}月`;
  const axis = document.getElementById('timelineAxis'); axis.innerHTML = ''; axis.style.gridTemplateColumns = `repeat(${daysInMonth}, 1fr)`;
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();
  const labelDays = new Set([1,5,10,15,20,25,daysInMonth]);
  for (let day = 1; day <= daysInMonth; day++) axis.insertAdjacentHTML('beforeend', `<span class="${isCurrentMonth && day === today.getDate() ? 'today' : ''}">${labelDays.has(day) ? String(day).padStart(2,'0') : '·'}</span>`);
  const prefix = `${year}-${String(monthNumber).padStart(2,'0')}-`;
  const visible = state.works.map(work => ({ work, days: work.lightDates.filter(date => date.startsWith(prefix)).map(date => Number(date.slice(8,10))).sort((a,b) => a-b) })).filter(item => item.days.length);
  const lanes = document.getElementById('timelineLanes');
  if (!visible.length) { lanes.innerHTML = '<div class="timeline-empty">这个月还没有点亮记录。</div>'; return; }
  lanes.innerHTML = visible.map(({ work, days }) => {
    const segments = contiguousSegments(days).map(([start,end], index) => `<span class="line-segment" style="grid-column:${start} / ${end + 1};--block-color:${work.timelineColors[index % work.timelineColors.length]}" aria-label="${start === end ? `${start} 日` : `${start} 至 ${end} 日`}有记录"><small class="segment-date">${start === end ? start : `${start}—${end}`}</small></span>`).join('');
    const todayPosition = isCurrentMonth ? `${((today.getDate() - .5) / daysInMonth) * 100}%` : '-10%';
    return `<div class="timeline-lane" style="--lane-accent:${work.timelineColors[0]}"><button class="lane-label" data-open-detail="${escapeHTML(work.id)}"><b>${escapeHTML(work.title)}</b><small>${escapeHTML(typeLabels[work.type])} · ${escapeHTML(statusText(work))}</small></button><div class="lane-track" data-open-detail="${escapeHTML(work.id)}" role="button" tabindex="0" aria-label="打开${escapeHTML(work.title)}的记录" style="grid-template-columns:repeat(${daysInMonth},1fr);--today-pos:${todayPosition}">${segments}</div></div>`;
  }).join('');
}

function contiguousSegments(days) {
  if (!days.length) return [];
  const segments = []; let start = days[0], previous = days[0];
  for (const day of days.slice(1)) { if (day === previous + 1) previous = day; else { segments.push([start, previous]); start = day; previous = day; } }
  segments.push([start, previous]); return segments;
}

const universePositions = [['19%','56%'],['41%','32%'],['68%','56%'],['57%','74%'],['78%','27%'],['29%','76%'],['51%','52%'],['84%','70%'],['15%','29%'],['36%','63%'],['63%','23%'],['72%','78%']];
function universeStage(work) { return work.status === 'wish' ? 'seed' : work.status === 'done' ? 'mature' : work.status === 'paused' ? 'pause' : 'growing'; }
function celestialInner(stage) {
  if (stage === 'seed') return '<span class="seed-glow"></span><span class="seed-body"></span>';
  if (stage === 'mature') return '<span class="planet-glow"></span><span class="planet-body"><i class="tree"><b></b><b></b><b></b></i></span><span class="planet-ring"></span>';
  if (stage === 'pause') return '<span class="planet-body"></span><span class="pause-mark">···</span>';
  return '<span class="planet-glow"></span><span class="planet-body"><i class="sprout"><b></b></i></span><span class="planet-ring"></span>';
}

function renderUniverse() {
  const container = document.getElementById('universeObjects');
  if (!state.works.length) { container.innerHTML = '<div class="universe-empty">这里还没有星球。<button data-action="add-work">＋ 添加第一部作品</button></div>'; return; }
  container.innerHTML = state.works.map((work,index) => {
    const stage = universeStage(work), [left,top] = universePositions[index % universePositions.length];
    return `<button class="celestial ${stage}" data-universe-work="${escapeHTML(work.id)}" aria-label="查看${escapeHTML(work.title)}" style="left:${left};top:${top}">${celestialInner(stage)}<em>${escapeHTML(work.title)}</em></button>`;
  }).join('');
  container.querySelectorAll('.celestial').forEach(button => {
    button.addEventListener('mouseenter', () => openHoverCard(button)); button.addEventListener('mouseleave', scheduleHide);
    button.addEventListener('focus', () => openHoverCard(button)); button.addEventListener('blur', scheduleHide);
    button.addEventListener('click', () => openDetail(button.dataset.universeWork));
  });
}

function openHoverCard(button) {
  clearTimeout(hideTimer); const work = findWork(button.dataset.universeWork); if (!work) return;
  document.getElementById('hoverTitle').textContent = work.title;
  document.getElementById('hoverState').textContent = `${statusText(work)} · ${work.status === 'wish' ? '种子' : work.status === 'done' ? '成熟星球' : work.status === 'paused' ? '暂时停泊' : `点亮 ${work.lightDates.length} 天`}`;
  document.getElementById('hoverQuote').textContent = work.quote || '还没有写下一句话。'; document.getElementById('hoverOpenDetail').dataset.openDetail = work.id;
  const cover = document.getElementById('hoverCover'); cover.style.backgroundColor = work.color; cover.style.backgroundImage = work.coverImage ? `url("${work.coverImage}")` : ''; cover.style.backgroundSize = work.coverImage ? 'cover' : ''; cover.classList.toggle('has-image', Boolean(work.coverImage)); cover.querySelector('span').innerHTML = escapeHTML(work.title).split('').join('<br>');
  const rect = button.getBoundingClientRect(), stageRect = document.querySelector('.stage').getBoundingClientRect();
  let left = rect.right - stageRect.left + 22, top = rect.top + rect.height / 2 - 82;
  if (left + 310 > window.innerWidth - stageRect.left) left = rect.left - stageRect.left - 320;
  hoverCard.style.left = `${Math.max(15,left)}px`; hoverCard.style.top = `${Math.max(120,Math.min(top,window.innerHeight - 210))}px`; hoverCard.classList.add('is-visible');
}
function scheduleHide() { hideTimer = setTimeout(() => hoverCard.classList.remove('is-visible'), 180); }

function renderRecords() {
  const grid = document.getElementById('recordsGrid');
  const visible = recordFilter === 'all' ? state.works : state.works.filter(work => work.status === recordFilter);
  grid.innerHTML = visible.map(work => {
    const completed = work.status === 'done' ? `<span class="completion-badge">${escapeHTML(completionWords(work).badge)}</span>` : '';
    return `<button class="record-card" data-open-detail="${escapeHTML(work.id)}"><span class="record-cover ${work.coverImage ? 'has-image' : ''}" data-cover-id="${escapeHTML(work.id)}" style="background-color:${work.color}">${completed}<b>${escapeHTML(work.title)}</b><small>${escapeHTML(work.english || work.title)}</small></span><span class="record-meta"><small>${escapeHTML(typeLabels[work.type])} · ${escapeHTML(statusText(work))} · ${work.lightDates.length} 天</small><h2>${escapeHTML(work.title)}</h2><p>${escapeHTML(work.creator || '未填写作者 / 导演')}</p></span></button>`;
  }).join('');
  visible.forEach(work => { if (!work.coverImage) return; const cover = grid.querySelector(`[data-cover-id="${CSS.escape(work.id)}"]`); if (cover) cover.style.backgroundImage = `url("${work.coverImage}")`; });
  document.getElementById('recordsEmpty').hidden = visible.length > 0;
  document.querySelectorAll('#recordFilters button').forEach(button => button.classList.toggle('is-active', button.dataset.filter === recordFilter));
}

function renderDetail(id) {
  const work = findWork(id) || state.works[0]; if (!work) { showPage('records'); return; }
  activeWorkId = work.id; document.getElementById('detailArchive').textContent = `WORK · 作品档案 ${work.archive}`;
  const cover = document.getElementById('detailCover'); cover.style.backgroundColor = work.color; cover.style.backgroundImage = work.coverImage ? `url("${work.coverImage}")` : ''; cover.classList.toggle('has-image', Boolean(work.coverImage)); cover.querySelector('span').textContent = work.title; cover.querySelector('i').textContent = work.english || work.title;
  document.getElementById('detailKind').textContent = workKind(work); document.getElementById('detail-title').textContent = work.title; document.getElementById('detailCreator').textContent = work.creator || '未填写作者 / 导演';
  const words = completionWords(work), statusSelect = document.getElementById('detailStatus');
  statusSelect.querySelector('option[value="done"]').textContent = words.past; statusSelect.value = work.status;
  document.getElementById('detailRating').value = work.rating || ''; document.getElementById('detailQuote').textContent = work.quote || '还没有写下一句话。';
  const completeButton = document.getElementById('detailComplete'); completeButton.disabled = work.status === 'done'; completeButton.classList.toggle('is-complete', work.status === 'done');
  completeButton.querySelector('span').textContent = work.status === 'done' ? `✓ ${words.past}` : words.action;
  completeButton.querySelector('small').textContent = work.status === 'done' ? `${displayDate(work.completedAt)} · 这次相遇已经完成` : '在今天为这次相遇写下句点';
  const dates = allWorkDates(work); document.getElementById('detailFirst').textContent = dates.length ? displayDate(dates[0]) : '尚未开始'; document.getElementById('detailLatest').textContent = dates.length ? displayDate(dates.at(-1)) : '—'; document.getElementById('detailTrace').textContent = `${dates.length} 个日子`;
  const completedRow = document.getElementById('detailCompletedRow'); completedRow.hidden = work.status !== 'done'; document.getElementById('detailCompletedLabel').textContent = words.date; document.getElementById('detailCompleted').textContent = displayDate(work.completedAt);
  document.getElementById('noteHeading').textContent = noteCountLabel(work.notes.length);
  const noteColors = ['note-yellow','note-white','note-blue'];
  document.getElementById('noteCards').innerHTML = [...work.notes].sort((a,b) => a.date.localeCompare(b.date)).map((note,index) => `<article class="sticky-note ${noteColors[index % noteColors.length]}"><time>${escapeHTML(displayDate(note.date))}${index === 0 ? ' · 第一次' : ''}</time><p>${escapeHTML(note.text).replaceAll('\n','<br>')}</p>${note.tag ? `<span>${escapeHTML(note.tag)}</span>` : ''}</article>`).join('') + `<div class="future-slot"><i></i><p>${futureMessage(work)}</p></div>`;
  document.getElementById('noteForm').hidden = true;
}

function openDetail(id, push = true) {
  const work = findWork(id); if (!work) return;
  const visiblePage = document.querySelector('.page.is-active'); if (visiblePage && visiblePage.id !== 'detail') detailOrigin = visiblePage.id;
  renderDetail(id);
  const back = document.getElementById('detailBack'), labels = { home: '← 回到首页', timeline: '← 回到时间轴', universe: '← 回到宇宙', records: '← 回到记录' };
  back.dataset.page = labels[detailOrigin] ? detailOrigin : 'records'; back.textContent = labels[back.dataset.page]; showPage('detail', false);
  if (push) history.pushState({ page: 'detail', work: id }, '', `#detail-${encodeURIComponent(id)}`);
}

function openWorkModal() { document.getElementById('workForm').reset(); document.getElementById('coverFileName').textContent = '尚未选择图片'; workModal.hidden = false; document.body.classList.add('modal-open'); setTimeout(() => document.getElementById('workTitle').focus(), 0); }
function closeWorkModal() { workModal.hidden = true; document.body.classList.remove('modal-open'); }

async function imageFileToDataUrl(file) {
  if (!file) return null; if (file.size > 4 * 1024 * 1024) throw new Error('封面图片请小于 4MB');
  const source = await new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
  return new Promise((resolve,reject) => { const image = new Image(); image.onload = () => { const scale = Math.min(1,520 / image.width), canvas = document.createElement('canvas'); canvas.width = Math.max(1,Math.round(image.width * scale)); canvas.height = Math.max(1,Math.round(image.height * scale)); canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height); resolve(canvas.toDataURL('image/jpeg',.78)); }; image.onerror = reject; image.src = source; });
}

async function addWork(event) {
  event.preventDefault(); const submit = event.submitter; if (submit) submit.disabled = true;
  try {
    const coverImage = await imageFileToDataUrl(document.getElementById('workCover').files[0]);
    const palette = paletteSets[state.works.length % paletteSets.length], status = document.getElementById('workStatus').value, id = `work-${Date.now().toString(36)}`, title = document.getElementById('workTitle').value.trim();
    const work = normalizeWork({ id, archive: String(43 + state.works.length).padStart(4,'0'), title, english: title.toUpperCase(), type: document.getElementById('workType').value, year: document.getElementById('workYear').value.trim(), creator: document.getElementById('workCreator').value.trim(), status, rating: '', quote: document.getElementById('workQuote').value.trim() || '还没有写下一句话。', color: palette.color, timelineColors: palette.timeline, coverImage, createdAt: todayISO, completedAt: status === 'done' ? todayISO : null, lightDates: [], notes: [] }, state.works.length);
    state.works.unshift(work); if (!saveState() && coverImage) { work.coverImage = null; saveState(); }
    closeWorkModal(); renderUniverse(); renderRecords(); renderHome(); showPage('universe'); showToast(`《${work.title}》已经出现在宇宙里`);
  } catch (error) { showToast(error.message || '封面处理失败，请换一张图片'); }
  finally { if (submit) submit.disabled = false; }
}

function openNoteComposer() { const form = document.getElementById('noteForm'); form.hidden = false; document.getElementById('noteDate').value = todayISO; document.getElementById('noteText').value = ''; document.getElementById('noteTag').value = ''; document.getElementById('noteText').focus(); }
function addNote(event) {
  event.preventDefault(); const work = findWork(activeWorkId); if (!work) return;
  const date = document.getElementById('noteDate').value, text = document.getElementById('noteText').value.trim(), tag = document.getElementById('noteTag').value.trim(); if (!date || !text) return;
  work.notes.push({ date, text, tag }); if (!work.lightDates.includes(date)) work.lightDates.push(date); work.lightDates.sort(); if (work.status === 'wish' || work.status === 'paused') work.status = 'reading';
  saveState(); renderDetail(work.id); renderTimeline(); renderUniverse(); renderRecords(); renderHome(); showToast('这张便签已经按日期保存');
}

function completeActiveWork() {
  const work = findWork(activeWorkId); if (!work || work.status === 'done') return;
  work.status = 'done'; work.completedAt = todayISO;
  saveState(); renderDetail(work.id); renderTimeline(); renderUniverse(); renderRecords(); renderHome();
  showToast(`《${work.title}》${completionWords(work).past}`);
}

function deleteActiveWork() {
  const work = findWork(activeWorkId); if (!work) return;
  const deleteScope = IS_GUEST ? '这台设备的体验档案' : '私人云端与所有设备';
  const approved = window.confirm(`确定删除《${work.title}》吗？\n\n它的便签、点亮日期和评分会从${deleteScope}中一同移除，删除后无法恢复。`);
  if (!approved) return;
  const previousWorks = state.works;
  state.works = state.works.filter(item => item.id !== work.id);
  if (!saveState()) { state.works = previousWorks; return; }
  activeWorkId = state.works[0]?.id || '';
  renderHome(); renderTimeline(); renderUniverse(); renderRecords();
  history.replaceState({ page: 'records' }, '', '#records'); showPage('records', false);
  showToast(`《${work.title}》已从档案中移除`);
}

function routeFromHash(push = false) { const hash = location.hash.slice(1) || 'home'; if (hash.startsWith('detail-')) openDetail(decodeURIComponent(hash.slice(7)), push); else showPage(hash, push); }

document.addEventListener('click', event => {
  const lightButton = event.target.closest('[data-light-work]'); if (lightButton) { event.stopPropagation(); toggleToday(lightButton.dataset.lightWork); return; }
  const pageButton = event.target.closest('[data-page]'); if (pageButton) { showPage(pageButton.dataset.page); return; }
  const detailButton = event.target.closest('[data-open-detail]'); if (detailButton?.dataset.openDetail) { openDetail(detailButton.dataset.openDetail); return; }
  if (event.target.closest('[data-action="add-work"]')) openWorkModal();
});
document.addEventListener('keydown', event => { const track = event.target.closest('.lane-track[data-open-detail]'); if (track && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openDetail(track.dataset.openDetail); } });
document.getElementById('prevMonth').addEventListener('click', () => { timelineCursor = new Date(timelineCursor.getFullYear(),timelineCursor.getMonth()-1,1); renderTimeline(); });
document.getElementById('nextMonth').addEventListener('click', () => { timelineCursor = new Date(timelineCursor.getFullYear(),timelineCursor.getMonth()+1,1); renderTimeline(); });
document.getElementById('recordFilters').addEventListener('click', event => { const button = event.target.closest('[data-filter]'); if (!button) return; recordFilter = button.dataset.filter; renderRecords(); });
['addWork','recordsAddWork','emptyAddWork'].forEach(id => document.getElementById(id).addEventListener('click', openWorkModal));
['closeWorkModal','cancelWorkModal'].forEach(id => document.getElementById(id).addEventListener('click', closeWorkModal));
workModal.addEventListener('click', event => { if (event.target === workModal) closeWorkModal(); });
document.getElementById('workForm').addEventListener('submit', addWork);
document.getElementById('workCover').addEventListener('change', event => { document.getElementById('coverFileName').textContent = event.target.files[0]?.name || '尚未选择图片'; });
document.getElementById('newNote').addEventListener('click', openNoteComposer);
document.getElementById('detailComplete').addEventListener('click', completeActiveWork);
document.getElementById('detailDelete').addEventListener('click', deleteActiveWork);
document.getElementById('cancelNote').addEventListener('click', () => { document.getElementById('noteForm').hidden = true; });
document.getElementById('noteForm').addEventListener('submit', addNote);
document.getElementById('detailStatus').addEventListener('change', event => { const work = findWork(activeWorkId); if (!work) return; work.status = event.target.value; work.completedAt = work.status === 'done' ? (work.completedAt || todayISO) : null; saveState(); renderDetail(work.id); renderUniverse(); renderRecords(); renderHome(); showToast(`状态已改为“${statusText(work)}”`); });
document.getElementById('detailRating').addEventListener('change', event => { const work = findWork(activeWorkId); if (!work) return; work.rating = event.target.value; saveState(); showToast(work.rating ? `评分已保存：${work.rating} / 5` : '已暂时取消评分'); });
document.getElementById('copyGuestLink').addEventListener('click', async () => {
  const shareURL = `${location.origin}/try`;
  try {
    await navigator.clipboard.writeText(shareURL);
    showToast('朋友体验链接已复制');
  } catch (error) {
    window.prompt('复制这个朋友体验链接：', shareURL);
  }
});
hoverCard.addEventListener('mouseenter', () => clearTimeout(hideTimer)); hoverCard.addEventListener('mouseleave', scheduleHide);
window.addEventListener('popstate', () => routeFromHash(false));
window.addEventListener('keydown', event => { if (event.key === 'Escape' && !workModal.hidden) closeWorkModal(); });
document.addEventListener('visibilitychange', () => {
  if (IS_GUEST) return;
  if (document.visibilityState !== 'visible') return;
  if (cloudDirty) syncCloud(false); else if (cloudReady) refreshCloud();
});

if (IS_GUEST) createGuestUI(); else createCloudUI();
renderHome(); renderTimeline(); renderUniverse(); renderRecords(); routeFromHash(false);
if (!IS_GUEST) refreshCloud();
