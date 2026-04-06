/* =========================================
   POPACO - 법인차량 관리 시스템 JavaScript
   ========================================= */

// ===== SUPABASE =====
const SUPABASE_URL = 'https://elnzubbhnhtvsaaeujaq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsbnp1YmJobmh0dnNhYWV1amFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNDE4MzgsImV4cCI6MjA5MDgxNzgzOH0.egoND8InKArZaIk-PNREWkDWrj8FssD-MLgy5AWVJHs';
var db = null;
try {
  if (window.supabase && window.supabase.createClient) {
    db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  }
} catch(e) {
  console.warn('Supabase 초기화 실패:', e);
}

// Cloud sync queue - saves to Supabase in background
function syncCarToCloud(plate, data) {
  if (!db) return;
  db.from('car_data').upsert({
    plate: plate,
    data: data,
    updated_at: new Date().toISOString()
  }).then(({ error }) => {
    if (error) console.error('클라우드 차량 저장 실패:', error.message);
  }).catch(e => console.error('클라우드 차량 저장 예외:', e));
}

function syncConfigToCloud() {
  if (!db) return;
  db.from('app_config').upsert({
    id: 'main',
    config: CONFIG,
    updated_at: new Date().toISOString()
  }).then(({ error }) => {
    if (error) console.error('클라우드 설정 저장 실패:', error.message);
  }).catch(e => console.error('클라우드 설정 저장 예외:', e));
}

async function loadFromCloud() {
  if (!db) return false;
  try {
    const { data: configRow, error: e1 } = await db.from('app_config').select('config').eq('id', 'main').single();
    if (e1) console.warn('클라우드 설정 로드:', e1.message);
    if (!e1 && configRow && configRow.config && configRow.config.cars) {
      CONFIG = configRow.config;
      localStorage.setItem('carlog_config', JSON.stringify(CONFIG));
    }

    const { data: carRows, error: e2 } = await db.from('car_data').select('plate, data');
    if (e2) console.warn('클라우드 차량 로드:', e2.message);
    if (!e2 && carRows && carRows.length > 0) {
      carRows.forEach(row => {
        if (row.plate && row.data) {
          // 클라우드 데이터와 로컬 데이터 병합 (클라우드가 비어있으면 로컬 유지)
          const cloudData = row.data;
          const localRaw = localStorage.getItem('v2_' + row.plate);
          if (localRaw) {
            const localData = JSON.parse(localRaw);
            const merged = {
              drives: mergeRecords(localData.drives || [], cloudData.drives || []),
              fuels: mergeRecords(localData.fuels || [], cloudData.fuels || []),
              maints: mergeRecords(localData.maints || [], cloudData.maints || []),
              expenses: mergeRecords(localData.expenses || [], cloudData.expenses || [])
            };
            localStorage.setItem('v2_' + row.plate, JSON.stringify(merged));
          } else {
            localStorage.setItem('v2_' + row.plate, JSON.stringify(cloudData));
          }
        }
      });
    }
    return true;
  } catch (e) {
    console.warn('클라우드 로드 실패:', e);
    return false;
  }
}

// 레코드 병합: 날짜+내용 기준 중복 제거
function mergeRecords(local, cloud) {
  const all = [...local];
  const keys = new Set(local.map(r => JSON.stringify({ date: r.date, driver: r.driver, amount: r.amount, course: r.course, type: r.type })));
  cloud.forEach(r => {
    const key = JSON.stringify({ date: r.date, driver: r.driver, amount: r.amount, course: r.course, type: r.type });
    if (!keys.has(key)) {
      all.push(r);
      keys.add(key);
    }
  });
  return all;
}

// ===== CONFIG =====
const DEFAULT_CARS = [
  { plate: '89모0746', model: '3.5톤 오토', drivers: ['조준호'] },
  { plate: '808저1384', model: '3.5톤 스틱', drivers: ['신양수'] },
  { plate: '825더8614', model: '3.5톤 오토', drivers: ['조기돈'] },
  { plate: '819거2844', model: '3.5톤 오토', drivers: ['정헌우'] },
  { plate: '83수2864', model: '1톤', drivers: ['권태완'] },
  { plate: '81나2146', model: '1톤', drivers: ['김종하'] },
  { plate: '85러6443', model: '스타렉스', drivers: ['김태우'] },
  { plate: '821우8548', model: '1톤', drivers: ['정현종'] }
];

function loadConfig() {
  try {
    const saved = localStorage.getItem('carlog_config');
    if (saved) return JSON.parse(saved);
  } catch(e) {}
  return { cars: JSON.parse(JSON.stringify(DEFAULT_CARS)), adminCode: '4317' };
}

function saveConfig() {
  localStorage.setItem('carlog_config', JSON.stringify(CONFIG));
  syncConfigToCloud();
}

let CONFIG = loadConfig();
// Force update admin code and old config
if (CONFIG.adminCode === '1234') { CONFIG.adminCode = '4317'; saveConfig(); }
if (CONFIG.cars.length > 0 && CONFIG.cars[0].plate === '12가 3456') {
  CONFIG = { cars: JSON.parse(JSON.stringify(DEFAULT_CARS)), adminCode: '1234' };
  saveConfig();
}
if (!localStorage.getItem('carlog_config')) saveConfig();

// ===== STATE =====
let state = { role: null, car: null, driver: null, currentPage: null };

// ===== STORAGE =====
function loadCarData(plate) {
  try {
    const raw = localStorage.getItem('v2_' + plate);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { drives: [], fuels: [], maints: [], expenses: [] };
}

function saveCarData(plate, data) {
  localStorage.setItem('v2_' + plate, JSON.stringify(data));
  syncCarToCloud(plate, data);
}

// ===== UTILITY =====
function today() { return new Date().toISOString().slice(0, 10); }
function thisMonth() { return new Date().toISOString().slice(0, 7); }
function fmt(n) { return Number(n || 0).toLocaleString('ko-KR'); }

function getKoreanDate() {
  const d = new Date();
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

function getMonthLabel() {
  return `${new Date().getMonth() + 1}월`;
}

// Calculate fuel efficiency for a given set of drives and fuels
function calcFuelEfficiency(drives, fuels) {
  const dist = drives.reduce((s, d) => s + Math.max(0, (Number(d.oe)||0) - (Number(d.os)||0)), 0);
  const liter = fuels.reduce((s, f) => s + (Number(f.liter)||0), 0);
  if (dist > 0 && liter > 0) return (dist / liter).toFixed(1);
  return null;
}

function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.className = 'toast' + (type ? ' toast-' + type : '');
  if (type === 'success') {
    t.innerHTML = `<i class="fa-solid fa-circle-check" style="margin-right:6px;"></i>${msg}`;
  } else if (type === 'error') {
    t.innerHTML = `<i class="fa-solid fa-circle-exclamation" style="margin-right:6px;"></i>${msg}`;
  } else {
    t.textContent = msg;
  }
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function showPage(id) {
  const prev = document.querySelector('.page.active');
  const next = document.getElementById(id);
  if (prev && prev.id !== id) {
    next.classList.add('active', 'page-enter');
    prev.classList.remove('active');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => next.classList.remove('page-enter'));
    });
  } else {
    next.classList.add('active');
  }
  state.currentPage = id;
  window.scrollTo(0, 0);
}

// ===== LOGIN =====
function switchLoginTab(tab) {
  document.querySelectorAll('.login-tabs button').forEach((b, i) => {
    b.classList.toggle('active', tab === 'driver' ? i === 0 : i === 1);
  });
  document.getElementById('driverLoginForm').classList.toggle('active', tab === 'driver');
  document.getElementById('adminLoginForm').classList.toggle('active', tab === 'admin');
}

function renderCarGrid() {
  document.getElementById('carGrid').innerHTML = CONFIG.cars.map(c =>
    `<div class="car-card" onclick="selectCar(this,'${c.plate}')">
      <div class="plate">${c.plate}</div>
      <div class="info">${c.model}</div>
    </div>`
  ).join('');
}

function selectCar(el, plate) {
  document.querySelectorAll('.car-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  state.car = plate;
}

function driverLogin() {
  if (!state.car) { showToast('차량을 선택하세요', 'error'); return; }
  const name = document.getElementById('driverName').value.trim();
  if (!name) { showToast('이름을 입력하세요', 'error'); return; }
  const car = CONFIG.cars.find(c => c.plate === state.car);
  if (!car || !car.drivers.includes(name)) {
    showToast('등록되지 않은 기사입니다', 'error'); return;
  }
  state.role = 'driver';
  state.driver = name;
  showDriverDashboard();
  showToast(`${name}님, 환영합니다!`, 'success');
}

function adminLogin() {
  const el = document.getElementById('adminCode');
  const code = el ? el.value.trim() : '';
  if (!code) { showToast('관리자 코드를 입력하세요', 'error'); return; }
  if (code !== CONFIG.adminCode) {
    showToast('관리자 코드가 올바르지 않습니다', 'error'); return;
  }
  state.role = 'admin';
  showAdminDashboard();
  showToast('관리자로 로그인되었습니다', 'success');
}

function logout() {
  state = { role: null, car: null, driver: null, currentPage: null };
  document.getElementById('driverName').value = '';
  document.getElementById('adminCode').value = '';
  document.querySelectorAll('.car-card').forEach(c => c.classList.remove('selected'));
  showPage('loginPage');
}

// ===== DRIVER DASHBOARD =====
function showDriverDashboard() {
  const car = CONFIG.cars.find(c => c.plate === state.car);
  const data = loadCarData(state.car);
  const month = thisMonth();

  // Greeting
  document.getElementById('greeting').innerHTML = `
    <div class="greet-name">안녕하세요, ${state.driver}님</div>
    <div class="greet-date">${getKoreanDate()}</div>
  `;

  // Vehicle Summary Card
  const allDrives = data.drives.filter(d => d.driver === state.driver);
  const mDrives = allDrives.filter(d => d.date && d.date.startsWith(month));
  const mFuels = data.fuels.filter(f => f.date && f.date.startsWith(month) && f.driver === state.driver);

  const totalOdo = allDrives.length > 0
    ? Math.max(...allDrives.map(d => Number(d.oe) || 0))
    : 0;
  const monthDist = mDrives.reduce((s, d) => s + Math.max(0, (Number(d.oe)||0) - (Number(d.os)||0)), 0);
  const totalFuelL = mFuels.reduce((s, f) => s + (Number(f.liter)||0), 0);
  const fuelEff = monthDist > 0 && totalFuelL > 0 ? (monthDist / totalFuelL).toFixed(1) : '-';

  document.getElementById('vehicleCard').innerHTML = `
    <div class="vsc-header">
      <div>
        <div class="vsc-label">차량 요약</div>
        <div class="vsc-plate">${car.plate}</div>
        <div class="vsc-model">${car.model}</div>
      </div>
      <div class="vsc-car-icon"><i class="fa-solid fa-car-side"></i></div>
    </div>
    <div class="vsc-stats">
      <div class="vsc-stat">
        <span class="vsc-stat-label">현재 주행거리</span>
        <span class="vsc-stat-value">${fmt(totalOdo)} <small>km</small></span>
      </div>
      <div class="vsc-stat">
        <span class="vsc-stat-label">잔여 연료</span>
        <span class="vsc-stat-value">${fuelEff !== '-' ? fuelEff : '-'} <small>km/L</small></span>
      </div>
    </div>
  `;

  // Key Stats
  const totalFuelAmt = mFuels.reduce((s, f) => s + (Number(f.amount)||0), 0);
  const mMaints = data.maints.filter(m => m.date && m.date.startsWith(month) && m.driver === state.driver);
  const mExps = data.expenses.filter(e => e.date && e.date.startsWith(month) && e.driver === state.driver);
  const totalMaint = mMaints.reduce((s, m) => s + (Number(m.amount)||0), 0);
  const totalExp = mExps.reduce((s, e) => s + (Number(e.amount)||0), 0);
  const totalSpend = totalFuelAmt + totalMaint + totalExp;

  document.getElementById('driverStats').innerHTML = `
    <div class="ks-card">
      <div class="ks-label">이번 달 주행거리</div>
      <div class="ks-value">${fmt(monthDist)} <small>km</small></div>
    </div>
    <div class="ks-card">
      <div class="ks-label">이번 달 연비</div>
      <div class="ks-value">${fuelEff} <small>km/L</small></div>
    </div>
    <div class="ks-card">
      <div class="ks-label">예산 현황</div>
      <div class="ks-value"><small>&#8361;</small>${fmt(totalSpend)}</div>
    </div>
  `;

  // Recent Records
  const typeConfig = {
    drive:   { icon: 'fa-solid fa-route', bg: 'var(--primary-light)', color: 'var(--primary-dark)', label: '주행' },
    fuel:    { icon: 'fa-solid fa-gas-pump', bg: 'var(--amber-light)', color: '#B45309', label: '주유' },
    maint:   { icon: 'fa-solid fa-wrench', bg: 'var(--emerald-light)', color: '#047857', label: '정비' },
    expense: { icon: 'fa-solid fa-receipt', bg: 'var(--purple-light)', color: 'var(--purple)', label: '지출' }
  };

  const allRecords = [];
  data.drives.forEach((d, i) => {
    if (d.driver === state.driver) allRecords.push({
      _type: 'drive', _idx: i, date: d.date,
      title: typeConfig.drive.label, desc: (d.course || `${d.from||''} → ${d.to||''}`),
      amount: `${fmt(Math.max(0,(Number(d.oe)||0)-(Number(d.os)||0)))}km`, detail: d.purpose || ''
    });
  });
  data.fuels.forEach((f, i) => {
    if (f.driver === state.driver) allRecords.push({
      _type: 'fuel', _idx: i, date: f.date,
      title: typeConfig.fuel.label, desc: f.station || f.type || '주유',
      amount: `${fmt(f.amount)}원`, detail: f.liter ? f.liter + 'L' : ''
    });
  });
  data.maints.forEach((m, i) => {
    if (m.driver === state.driver) allRecords.push({
      _type: 'maint', _idx: i, date: m.date,
      title: typeConfig.maint.label, desc: m.type,
      amount: `${fmt(m.amount)}원`, detail: m.shop || ''
    });
  });
  data.expenses.forEach((e, i) => {
    if (e.driver === state.driver) allRecords.push({
      _type: 'expense', _idx: i, date: e.date,
      title: typeConfig.expense.label, desc: e.type,
      amount: `${fmt(e.amount)}원`, detail: ''
    });
  });
  allRecords.sort((a, b) => (b.date||'').localeCompare(a.date||''));
  allRecords.splice(8);

  // Consumables Alert
  renderConsumablesAlert();

  // Mini Charts (distance + fuel efficiency)
  const chartContainer = document.getElementById('driverChart');
  if (chartContainer) chartContainer.innerHTML = renderMiniChart(data, state.driver) + renderFuelEffChart(data, state.driver);

  const recEl = document.getElementById('recentRecords');
  if (allRecords.length === 0) {
    recEl.innerHTML = `<div class="empty-state">
      <div class="empty-icon"><i class="fa-regular fa-clipboard"></i></div>
      <p>아직 기록이 없습니다.<br>위의 버튼으로 첫 기록을 입력하세요!</p>
    </div>`;
  } else {
    recEl.innerHTML = allRecords.map(r => {
      const tc = typeConfig[r._type];
      const dateStr = r.date ? r.date.slice(5).replace('-', '/') : '';
      return `<div class="recent-item swipe-item" onclick="showRecordDetail('${r._type}',${r._idx})" style="cursor:pointer"
        data-type="${r._type}" data-idx="${r._idx}">
        <div class="ri-icon" style="background:${tc.bg};color:${tc.color}"><i class="${tc.icon}"></i></div>
        <div class="ri-content">
          <div class="ri-title">${dateStr} ${r.title}</div>
          <div class="ri-sub">${r.desc}</div>
        </div>
        <div class="ri-right">
          <div class="ri-amount">${r.amount}</div>
          ${r.detail ? `<div class="ri-detail">${r.detail}</div>` : ''}
        </div>
      </div>`;
    }).join('');
  }

  // Update nav badge with this month's record count
  const totalRecords = allRecords.length;
  document.querySelectorAll('#driverDashboard .nav-item').forEach((nav, i) => {
    if (i === 1) { // "기록" tab
      const existing = nav.querySelector('.nav-badge');
      if (existing) existing.remove();
      if (totalRecords > 0) {
        const badge = document.createElement('span');
        badge.className = 'nav-badge';
        badge.textContent = totalRecords > 99 ? '99+' : totalRecords;
        nav.style.position = 'relative';
        nav.appendChild(badge);
      }
    }
  });

  showPage('driverDashboard');
}

function switchDriverTab(tab) {
  if (tab === 'dashboard') {
    showDriverDashboard();
  } else if (tab === 'history') {
    document.getElementById('driverHistMonth').value = thisMonth();
    loadDriverHistory();
    showPage('driverHistory');
  } else if (tab === 'consumables') {
    switchToConsumables();
  } else if (tab === 'settings') {
    showDriverSettings();
  }
}

// ===== DRIVER HISTORY =====
function loadDriverHistory() {
  const month = document.getElementById('driverHistMonth').value || thisMonth();
  const data = loadCarData(state.car);
  const typeLabels = { drive: '주행', fuel: '주유', maint: '정비', expense: '지출' };

  // Build records with original index for delete
  const allRecords = [];
  data.drives.forEach((d, i) => {
    if (d.driver === state.driver && d.date && d.date.startsWith(month))
      allRecords.push({ type: 'drive', idx: i, date: d.date, detail: (d.course || `${d.from||''} → ${d.to||''}`), amount: `${fmt(Math.max(0,(Number(d.oe)||0)-(Number(d.os)||0)))} km` });
  });
  data.fuels.forEach((f, i) => {
    if (f.driver === state.driver && f.date && f.date.startsWith(month))
      allRecords.push({ type: 'fuel', idx: i, date: f.date, detail: f.station || f.type, amount: `${fmt(f.amount)}원` });
  });
  data.maints.forEach((m, i) => {
    if (m.driver === state.driver && m.date && m.date.startsWith(month))
      allRecords.push({ type: 'maint', idx: i, date: m.date, detail: m.type, amount: `${fmt(m.amount)}원` });
  });
  data.expenses.forEach((e, i) => {
    if (e.driver === state.driver && e.date && e.date.startsWith(month))
      allRecords.push({ type: 'expense', idx: i, date: e.date, detail: e.type, amount: `${fmt(e.amount)}원` });
  });
  allRecords.sort((a, b) => (b.date||'').localeCompare(a.date||''));

  const el = document.getElementById('driverHistoryList');
  if (allRecords.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon"><i class="fa-regular fa-clipboard"></i></div><p>해당 기간에 기록이 없습니다.</p></div>`;
    return;
  }

  // Monthly summary with fuel efficiency
  const mDrives = data.drives.filter(d => d.driver === state.driver && d.date && d.date.startsWith(month));
  const mFuels = data.fuels.filter(f => f.driver === state.driver && f.date && f.date.startsWith(month));
  const mMaints = data.maints.filter(m => m.driver === state.driver && m.date && m.date.startsWith(month));
  const mExps = data.expenses.filter(e => e.driver === state.driver && e.date && e.date.startsWith(month));
  const sumDist = mDrives.reduce((s, d) => s + Math.max(0, (Number(d.oe)||0) - (Number(d.os)||0)), 0);
  const sumFuelAmt = mFuels.reduce((s, f) => s + (Number(f.amount)||0), 0);
  const sumMaint = mMaints.reduce((s, m) => s + (Number(m.amount)||0), 0);
  const sumExp = mExps.reduce((s, e) => s + (Number(e.amount)||0), 0);
  const monthEff = calcFuelEfficiency(mDrives, mFuels);

  const summaryHTML = `<div class="hist-summary">
    <div class="hs-item"><div class="hs-val">${fmt(sumDist)} <small>km</small></div><div class="hs-label">주행거리</div></div>
    <div class="hs-divider"></div>
    <div class="hs-item"><div class="hs-val">${monthEff || '-'} <small>km/L</small></div><div class="hs-label">연비</div></div>
    <div class="hs-divider"></div>
    <div class="hs-item"><div class="hs-val">${fmt(sumFuelAmt + sumMaint + sumExp)} <small>원</small></div><div class="hs-label">총 지출</div></div>
  </div>`;

  el.innerHTML = summaryHTML + `<div class="table-wrap"><table class="data-table">
    <thead><tr><th>날짜</th><th>구분</th><th>내용</th><th>금액/거리</th><th></th></tr></thead>
    <tbody>${allRecords.map(r => `<tr style="cursor:pointer" onclick="showRecordDetail('${r.type}',${r.idx})">
      <td>${r.date}</td>
      <td><span class="badge-type badge-${r.type}">${typeLabels[r.type]}</span></td>
      <td>${r.detail}</td>
      <td style="font-weight:600;">${r.amount}</td>
      <td><button class="btn-delete" onclick="event.stopPropagation();deleteRecord('${r.type}',${r.idx})" title="삭제"><i class="fa-regular fa-trash-can"></i></button></td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

// ===== FORMS =====
function showForm(type) {
  document.querySelectorAll('.form-clean').forEach(f => f.style.display = 'none');
  const titles = { drive: '주행 기록 입력', fuel: '주유 기록 입력', maint: '정비 기록 입력', expense: '지출 기록 입력' };
  const subtitles = { drive: '새로운 주행 기록을 입력해주세요', fuel: '주유 내역을 입력해주세요', maint: '정비 내역을 입력해주세요', expense: '지출 내역을 입력해주세요' };
  document.getElementById('formTitle').textContent = titles[type];
  document.getElementById('formSubtitle').textContent = subtitles[type];
  document.getElementById(type + 'Form').style.display = 'flex';
  const dateEl = document.getElementById(type + 'Date');
  if (dateEl) dateEl.value = today();
  showPage('formPage');
  // Auto-fill last odometer
  setTimeout(prefillOdometer, 50);
}

function goBack() {
  document.querySelectorAll('.form-clean input, .form-clean select, .form-clean textarea').forEach(el => {
    if (el.type === 'date' || el.type === 'month') return;
    if (el.tagName === 'SELECT') { el.selectedIndex = 0; return; }
    el.value = '';
  });
  const dp = document.getElementById('driveDistPreview');
  if (dp) dp.style.display = 'none';
  // Clear receipt previews
  ['fuelReceiptPreview','maintReceiptPreview','expenseReceiptPreview'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.innerHTML = ''; delete el.dataset.image; }
  });
  showDriverDashboard();
}

// ===== SAVE: DRIVE =====
function saveDrive() {
  const date = document.getElementById('driveDate').value;
  const course = document.getElementById('driveCourse').value.trim();
  const os = document.getElementById('driveOS').value;
  const oe = document.getElementById('driveOE').value;

  if (!date) { showToast('날짜를 입력하세요', 'error'); return; }
  if (!course) { showToast('코스명을 입력하세요', 'error'); return; }
  if (!os) { showToast('출발 계기판을 입력하세요', 'error'); return; }
  if (!oe) { showToast('도착 계기판을 입력하세요', 'error'); return; }
  if (Number(oe) < Number(os)) { showToast('계기판 수치를 확인하세요', 'error'); return; }

  const data = loadCarData(state.car);
  data.drives.push({
    date, course, os, oe,
    note: document.getElementById('driveNote').value.trim(),
    driver: state.driver
  });
  saveCarData(state.car, data);
  alert('저장완료');
  syncAllToCloud();
  goBack();
}

function saveFuel() {
  const date = document.getElementById('fuelDate').value;
  const liter = document.getElementById('fuelLiter').value;
  const amount = document.getElementById('fuelAmount').value;
  const type = document.getElementById('fuelType').value;

  if (!date) { showToast('날짜를 입력하세요', 'error'); return; }
  if (!liter || Number(liter) <= 0) { showToast('주유량을 올바르게 입력하세요', 'error'); return; }
  if (!amount || Number(amount) <= 0) { showToast('금액을 올바르게 입력하세요', 'error'); return; }
  if (!type) { showToast('연료 종류를 선택하세요', 'error'); return; }

  const data = loadCarData(state.car);
  data.fuels.push({
    date, liter, amount,
    station: document.getElementById('fuelStation').value.trim(),
    type,
    odo: document.getElementById('fuelOdo').value,
    pay: document.getElementById('fuelPay').value,
    receipt: getReceiptData('fuelReceiptPreview'),
    driver: state.driver
  });
  saveCarData(state.car, data);
  alert('저장완료');
  syncAllToCloud();
  goBack();
}

function saveMaint() {
  const date = document.getElementById('maintDate').value;
  const type = document.getElementById('maintType').value;
  const amount = document.getElementById('maintAmount').value;

  if (!date) { showToast('날짜를 입력하세요', 'error'); return; }
  if (!type) { showToast('정비 유형을 선택하세요', 'error'); return; }
  if (!amount || Number(amount) <= 0) { showToast('금액을 올바르게 입력하세요', 'error'); return; }

  const data = loadCarData(state.car);
  data.maints.push({
    date, type, amount,
    shop: document.getElementById('maintShop').value.trim(),
    odo: document.getElementById('maintOdo').value,
    pay: document.getElementById('maintPay').value,
    note: document.getElementById('maintNote').value.trim(),
    receipt: getReceiptData('maintReceiptPreview'),
    driver: state.driver
  });
  saveCarData(state.car, data);
  alert('저장완료');
  syncAllToCloud();
  goBack();
}

function saveExpense() {
  const date = document.getElementById('expenseDate').value;
  const type = document.getElementById('expenseType').value;
  const amount = document.getElementById('expenseAmount').value;

  if (!date) { showToast('날짜를 입력하세요', 'error'); return; }
  if (!type) { showToast('지출 유형을 선택하세요', 'error'); return; }
  if (!amount || Number(amount) <= 0) { showToast('금액을 올바르게 입력하세요', 'error'); return; }

  const data = loadCarData(state.car);
  data.expenses.push({
    date, type, amount,
    pay: document.getElementById('expensePay').value,
    note: document.getElementById('expenseNote').value.trim(),
    receipt: getReceiptData('expenseReceiptPreview'),
    driver: state.driver
  });
  saveCarData(state.car, data);
  alert('저장완료');
  syncAllToCloud();
  goBack();
}

// ===== DRIVE DISTANCE PREVIEW =====
function setupDriveDistPreview() {
  const osEl = document.getElementById('driveOS');
  const oeEl = document.getElementById('driveOE');
  const previewEl = document.getElementById('driveDistPreview');
  const valueEl = document.getElementById('driveDistValue');

  function update() {
    const os = Number(osEl.value) || 0;
    const oe = Number(oeEl.value) || 0;
    if (os > 0 && oe > 0) {
      const dist = oe - os;
      previewEl.style.display = 'block';
      if (dist >= 0) {
        valueEl.textContent = fmt(dist);
        previewEl.style.background = 'var(--bg-secondary)';
        previewEl.style.borderColor = 'var(--border)';
      } else {
        valueEl.textContent = '오류';
        previewEl.style.background = 'var(--danger-light)';
        previewEl.style.borderColor = 'var(--danger)';
      }
    } else {
      previewEl.style.display = 'none';
    }
  }
  osEl.addEventListener('input', update);
  oeEl.addEventListener('input', update);
}

// ===== ADMIN =====
function showAdminDashboard() {
  const month = thisMonth();
  let totalDist = 0, totalFuel = 0, totalMaint = 0, totalExp = 0;
  populateCarSelectors();

  let carHTML = '';
  CONFIG.cars.forEach(car => {
    const data = loadCarData(car.plate);
    const mD = data.drives.filter(d => d.date && d.date.startsWith(month));
    const mF = data.fuels.filter(f => f.date && f.date.startsWith(month));
    const mM = data.maints.filter(m => m.date && m.date.startsWith(month));
    const mE = data.expenses.filter(e => e.date && e.date.startsWith(month));

    const dist = mD.reduce((s, d) => s + Math.max(0,(Number(d.oe)||0)-(Number(d.os)||0)), 0);
    const fuel = mF.reduce((s, f) => s + (Number(f.amount)||0), 0);
    const maint = mM.reduce((s, m) => s + (Number(m.amount)||0), 0);
    const exp = mE.reduce((s, e) => s + (Number(e.amount)||0), 0);
    totalDist += dist; totalFuel += fuel; totalMaint += maint; totalExp += exp;

    const carEff = calcFuelEfficiency(mD, mF);

    carHTML += `<div class="admin-car-card">
      <div class="car-header">
        <div><div class="car-plate">${car.plate}</div><div class="car-model">${car.model}</div></div>
        <div class="car-drivers">${car.drivers.join(', ')}</div>
      </div>
      <div class="car-stats">
        <div class="mini-stat"><div class="mv">${fmt(dist)}</div><div class="ml">운행(km)</div></div>
        <div class="mini-stat"><div class="mv">${carEff || '-'}</div><div class="ml">연비(km/L)</div></div>
        <div class="mini-stat"><div class="mv">${fmt(fuel)}</div><div class="ml">주유(원)</div></div>
        <div class="mini-stat"><div class="mv">${fmt(maint + exp)}</div><div class="ml">기타(원)</div></div>
      </div>
    </div>`;
  });

  // Collect all drives and fuels for overall efficiency
  const allMonthDrives = [];
  const allMonthFuels = [];
  CONFIG.cars.forEach(c => {
    const d = loadCarData(c.plate);
    allMonthDrives.push(...d.drives.filter(x => x.date && x.date.startsWith(month)));
    allMonthFuels.push(...d.fuels.filter(x => x.date && x.date.startsWith(month)));
  });
  const overallEff = calcFuelEfficiency(allMonthDrives, allMonthFuels);

  document.getElementById('adminTotalStats').innerHTML = `
    <div class="ks-card"><div class="ks-label">전체 운행거리</div><div class="ks-value">${fmt(totalDist)} <small>km</small></div></div>
    <div class="ks-card"><div class="ks-label">평균 연비</div><div class="ks-value">${overallEff || '-'} <small>km/L</small></div></div>
    <div class="ks-card"><div class="ks-label">총 지출</div><div class="ks-value">${fmt(totalFuel+totalMaint+totalExp)} <small>원</small></div></div>
  `;
  document.getElementById('adminCarList').innerHTML = carHTML;

  // Admin chart - combine all cars
  const allData = { drives: [], fuels: [], maints: [], expenses: [] };
  CONFIG.cars.forEach(c => {
    const d = loadCarData(c.plate);
    allData.drives.push(...d.drives);
    allData.fuels.push(...d.fuels);
    allData.maints.push(...d.maints);
    allData.expenses.push(...d.expenses);
  });
  const adminChartEl = document.getElementById('adminChart');
  if (adminChartEl) adminChartEl.innerHTML = renderAdminChart(allData);

  showPage('adminDashboard');
}

function populateCarSelectors() {
  ['adminRecCar', 'dlCar'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = '<option value="all">전체 차량</option>' +
      CONFIG.cars.map(c => `<option value="${c.plate}">${c.plate} (${c.model})</option>`).join('');
  });
}

function switchAdminTab(tab) {
  if (tab === 'dashboard') showAdminDashboard();
  else if (tab === 'records') {
    document.getElementById('adminRecMonth').value = thisMonth();
    loadAdminRecords();
    showPage('adminRecords');
  } else if (tab === 'download') {
    document.getElementById('dlMonth').value = thisMonth();
    showPage('adminDownload');
    renderReportPreview();
  } else if (tab === 'settings') {
    showAdminSettings();
  }
}

function loadAdminRecords() {
  const month = document.getElementById('adminRecMonth').value || thisMonth();
  const carFilter = document.getElementById('adminRecCar').value;
  const typeFilter = document.getElementById('adminRecType').value;
  const cars = carFilter === 'all' ? CONFIG.cars : CONFIG.cars.filter(c => c.plate === carFilter);
  const typeLabels = { drive: '운행', fuel: '주유', maint: '정비', expense: '지출' };
  let allRecords = [];

  cars.forEach(car => {
    const data = loadCarData(car.plate);
    if (typeFilter === 'all' || typeFilter === 'drive')
      data.drives.forEach((d, i) => { if (d.date && d.date.startsWith(month))
        allRecords.push({ plate: car.plate, type: 'drive', idx: i, date: d.date, driver: d.driver, detail: (d.course || `${d.from||''} → ${d.to||''}`), amount: `${fmt(Math.max(0,(Number(d.oe)||0)-(Number(d.os)||0)))} km` }); });
    if (typeFilter === 'all' || typeFilter === 'fuel')
      data.fuels.forEach((f, i) => { if (f.date && f.date.startsWith(month))
        allRecords.push({ plate: car.plate, type: 'fuel', idx: i, date: f.date, driver: f.driver, detail: `${f.station||''} ${f.type||''}`.trim(), amount: `${fmt(f.amount)}원` }); });
    if (typeFilter === 'all' || typeFilter === 'maint')
      data.maints.forEach((m, i) => { if (m.date && m.date.startsWith(month))
        allRecords.push({ plate: car.plate, type: 'maint', idx: i, date: m.date, driver: m.driver, detail: m.type, amount: `${fmt(m.amount)}원` }); });
    if (typeFilter === 'all' || typeFilter === 'expense')
      data.expenses.forEach((e, i) => { if (e.date && e.date.startsWith(month))
        allRecords.push({ plate: car.plate, type: 'expense', idx: i, date: e.date, driver: e.driver, detail: e.type, amount: `${fmt(e.amount)}원` }); });
  });

  allRecords.sort((a, b) => { const c = a.plate.localeCompare(b.plate); return c !== 0 ? c : a.date.localeCompare(b.date); });

  const el = document.getElementById('adminRecordTable');
  if (allRecords.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon"><i class="fa-regular fa-clipboard"></i></div><p>해당 조건에 맞는 기록이 없습니다.</p></div>`;
    return;
  }

  el.innerHTML = `<div class="table-wrap"><table class="data-table">
    <thead><tr><th>차량</th><th>날짜</th><th>구분</th><th>기사</th><th>내용</th><th>금액</th><th></th></tr></thead>
    <tbody>${allRecords.map(r => `<tr style="cursor:pointer" onclick="showRecordDetail('${r.type}',${r.idx},'${r.plate}')">
      <td>${r.plate}</td><td>${r.date}</td>
      <td><span class="badge-type badge-${r.type}">${typeLabels[r.type]}</span></td>
      <td>${r.driver||'-'}</td><td>${r.detail}</td>
      <td style="font-weight:600;">${r.amount}</td>
      <td><button class="btn-delete" onclick="event.stopPropagation();deleteRecord('${r.type}',${r.idx},'${r.plate}')" title="삭제"><i class="fa-regular fa-trash-can"></i></button></td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

// ===== CSV / PDF / EMAIL (unchanged logic) =====
function getAllRecordsForExport() {
  const month = document.getElementById('dlMonth').value || thisMonth();
  const carFilter = document.getElementById('dlCar').value;
  const cars = carFilter === 'all' ? CONFIG.cars : CONFIG.cars.filter(c => c.plate === carFilter);
  let rows = [];

  cars.forEach(car => {
    const data = loadCarData(car.plate);
    data.drives.filter(d => d.date && d.date.startsWith(month)).forEach(d => {
      const courseName = d.course || `${d.from||''} → ${d.to||''}`;
      rows.push({ 차량번호:car.plate, 기사명:d.driver, 날짜:d.date, 구분:'운행', 코스명:courseName, '출발계기(km)':d.os, '도착계기(km)':d.oe, '운행거리(km)':Math.max(0,(Number(d.oe)||0)-(Number(d.os)||0)), 운행목적:d.purpose, '주유량(L)':'', '주유금액(원)':'', 주유소:'', 연료:'', 정비유형:'', 정비업체:'', '정비금액(원)':'', 지출유형:'', '지출금액(원)':'', 결제방법:'', 비고:d.note||'' });
    });
    data.fuels.filter(f => f.date && f.date.startsWith(month)).forEach(f => {
      rows.push({ 차량번호:car.plate, 기사명:f.driver, 날짜:f.date, 구분:'주유', 코스명:'', '출발계기(km)':'', '도착계기(km)':'', '운행거리(km)':'', 운행목적:'', '주유량(L)':f.liter, '주유금액(원)':f.amount, 주유소:f.station||'', 연료:f.type||'', 정비유형:'', 정비업체:'', '정비금액(원)':'', 지출유형:'', '지출금액(원)':'', 결제방법:f.pay||'', 비고:'' });
    });
    data.maints.filter(m => m.date && m.date.startsWith(month)).forEach(m => {
      rows.push({ 차량번호:car.plate, 기사명:m.driver, 날짜:m.date, 구분:'정비', 코스명:'', '출발계기(km)':'', '도착계기(km)':'', '운행거리(km)':'', 운행목적:'', '주유량(L)':'', '주유금액(원)':'', 주유소:'', 연료:'', 정비유형:m.type, 정비업체:m.shop||'', '정비금액(원)':m.amount, 지출유형:'', '지출금액(원)':'', 결제방법:m.pay||'', 비고:m.note||'' });
    });
    data.expenses.filter(e => e.date && e.date.startsWith(month)).forEach(e => {
      rows.push({ 차량번호:car.plate, 기사명:e.driver, 날짜:e.date, 구분:'지출', 코스명:'', '출발계기(km)':'', '도착계기(km)':'', '운행거리(km)':'', 운행목적:'', '주유량(L)':'', '주유금액(원)':'', 주유소:'', 연료:'', 정비유형:'', 정비업체:'', '정비금액(원)':'', 지출유형:e.type, '지출금액(원)':e.amount, 결제방법:e.pay||'', 비고:e.note||'' });
    });
  });

  rows.sort((a, b) => { const c = a.차량번호.localeCompare(b.차량번호); return c !== 0 ? c : a.날짜.localeCompare(b.날짜); });
  return rows;
}

function downloadCSV() {
  const rows = getAllRecordsForExport();
  const month = document.getElementById('dlMonth').value || thisMonth();
  const carFilter = document.getElementById('dlCar').value;
  const cars = carFilter === 'all' ? CONFIG.cars : CONFIG.cars.filter(c => c.plate === carFilter);
  const esc = v => { const s = String(v==null?'':v); return (s.includes(',')||s.includes('"')||s.includes('\n')) ? '"'+s.replace(/"/g,'""')+'"' : s; };

  const driveH = ['날짜','기사','코스명','출발계기(km)','도착계기(km)','운행거리(km)','비고'];
  const fuelH  = ['날짜','기사','주유소','연료','주유량(L)','금액(원)','결제'];
  const maintH = ['날짜','기사','정비유형','정비업체','금액(원)','결제','비고'];
  const expH   = ['날짜','기사','지출유형','금액(원)','결제','비고'];

  let csv = '\uFEFF';

  cars.forEach(car => {
    const cr = rows.filter(r => r.차량번호 === car.plate);
    if (cr.length === 0) return;

    csv += `\n${car.plate} (${car.model})\n`;

    const dr = cr.filter(r => r.구분 === '운행');
    if (dr.length > 0) {
      csv += `\n[운행 기록 - ${dr.length}건]\n`;
      csv += driveH.join(',') + '\n';
      dr.forEach(r => { csv += [r.날짜, r.기사명, r.코스명||'', r['출발계기(km)']||'', r['도착계기(km)']||'', r['운행거리(km)']||'', r.비고||''].map(esc).join(',') + '\n'; });
    }

    const fr = cr.filter(r => r.구분 === '주유');
    if (fr.length > 0) {
      csv += `\n[주유 기록 - ${fr.length}건]\n`;
      csv += fuelH.join(',') + '\n';
      fr.forEach(r => { csv += [r.날짜, r.기사명, r.주유소||'', r.연료||'', r['주유량(L)']||'', r['주유금액(원)']||'', r.결제방법||''].map(esc).join(',') + '\n'; });
    }

    const mr = cr.filter(r => r.구분 === '정비');
    if (mr.length > 0) {
      csv += `\n[정비 기록 - ${mr.length}건]\n`;
      csv += maintH.join(',') + '\n';
      mr.forEach(r => { csv += [r.날짜, r.기사명, r.정비유형||'', r.정비업체||'', r['정비금액(원)']||'', r.결제방법||'', r.비고||''].map(esc).join(',') + '\n'; });
    }

    const er = cr.filter(r => r.구분 === '지출');
    if (er.length > 0) {
      csv += `\n[지출 기록 - ${er.length}건]\n`;
      csv += expH.join(',') + '\n';
      er.forEach(r => { csv += [r.날짜, r.기사명, r.지출유형||'', r['지출금액(원)']||'', r.결제방법||'', r.비고||''].map(esc).join(',') + '\n'; });
    }

    csv += '\n';
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `법인차량운행기록_${month}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  showToast('CSV 파일이 다운로드되었습니다', 'success');
}

function printPDF() {
  const rows = getAllRecordsForExport();
  const month = document.getElementById('dlMonth').value || thisMonth();
  const carFilter = document.getElementById('dlCar').value;
  const cars = carFilter === 'all' ? CONFIG.cars : CONFIG.cars.filter(c => c.plate === carFilter);

  let summaryHTML = '';
  cars.forEach(car => {
    const cr = rows.filter(r => r.차량번호 === car.plate);
    const dist = cr.filter(r=>r.구분==='운행').reduce((s,r)=>s+(Number(r['운행거리(km)'])||0),0);
    const fuel = cr.filter(r=>r.구분==='주유').reduce((s,r)=>s+(Number(r['주유금액(원)'])||0),0);
    const maint = cr.filter(r=>r.구분==='정비').reduce((s,r)=>s+(Number(r['정비금액(원)'])||0),0);
    const exp = cr.filter(r=>r.구분==='지출').reduce((s,r)=>s+(Number(r['지출금액(원)'])||0),0);
    const driveRows = cr.filter(r=>r.구분==='운행');
    const fuelRows = cr.filter(r=>r.구분==='주유');
    const totalLiter = fuelRows.reduce((s,r)=>s+(Number(r['주유량(L)'])||0),0);
    const pdfEff = dist > 0 && totalLiter > 0 ? (dist / totalLiter).toFixed(1) : '-';

    summaryHTML += `<div style="margin-bottom:14px;padding:12px;border:1px solid #ddd;border-radius:6px;page-break-inside:avoid;">
      <h3 style="margin-bottom:6px;font-size:13px;">${car.plate} (${car.model})</h3>
      <table style="width:100%;border-collapse:collapse;font-size:11px;"><tr>
        <td style="padding:3px 6px;border:1px solid #ddd;font-weight:bold;background:#f9f9f9;">운행</td><td style="padding:3px 6px;border:1px solid #ddd;">${fmt(dist)} km</td>
        <td style="padding:3px 6px;border:1px solid #ddd;font-weight:bold;background:#f9f9f9;">연비</td><td style="padding:3px 6px;border:1px solid #ddd;">${pdfEff} km/L</td>
      </tr><tr>
        <td style="padding:3px 6px;border:1px solid #ddd;font-weight:bold;background:#f9f9f9;">주유</td><td style="padding:3px 6px;border:1px solid #ddd;">${fmt(fuel)}원 (${fmt(totalLiter)}L)</td>
        <td style="padding:3px 6px;border:1px solid #ddd;font-weight:bold;background:#f9f9f9;">정비</td><td style="padding:3px 6px;border:1px solid #ddd;">${fmt(maint)}원</td>
      </tr><tr>
        <td style="padding:3px 6px;border:1px solid #ddd;font-weight:bold;background:#f9f9f9;">지출</td><td style="padding:3px 6px;border:1px solid #ddd;">${fmt(exp)}원</td>
        <td style="padding:3px 6px;border:1px solid #ddd;font-weight:bold;background:#eee;">총 지출</td><td style="padding:3px 6px;border:1px solid #ddd;font-weight:bold;">${fmt(fuel+maint+exp)}원</td>
      </tr></table></div>`;
  });

  // Build detail tables per car, then per category
  let detailHTML = '';
  if (rows.length === 0) {
    detailHTML = '<p style="text-align:center;padding:40px;color:#999;">기록이 없습니다.</p>';
  } else {
    const td = 'padding:3px 5px;border:1px solid #ddd;';
    const th = 'padding:5px;border:1px solid #bbb;background:#f0f0f0;';

    cars.forEach(car => {
      const carRows = rows.filter(r => r.차량번호 === car.plate);
      if (carRows.length === 0) return;

      detailHTML += `<h2 style="font-size:13px;margin:20px 0 8px;border-bottom:2px solid #2563EB;padding-bottom:4px;color:#2563EB;">${car.plate} (${car.model})</h2>`;

      // 운행
      const dr = carRows.filter(r => r.구분 === '운행');
      if (dr.length > 0) {
        detailHTML += `<h3 style="font-size:10px;margin:10px 0 4px;color:#555;">운행 기록 (${dr.length}건)</h3>
          <table style="width:100%;border-collapse:collapse;font-size:9px;"><thead><tr>
            <th style="${th}">날짜</th><th style="${th}">기사</th><th style="${th}">코스명</th><th style="${th}">출발계기(km)</th><th style="${th}">도착계기(km)</th><th style="${th}">운행거리(km)</th><th style="${th}">비고</th>
          </tr></thead><tbody>` +
          dr.map(r => `<tr><td style="${td}">${r.날짜}</td><td style="${td}">${r.기사명}</td><td style="${td}">${r.코스명||''}</td><td style="${td}">${r['출발계기(km)']?fmt(r['출발계기(km)']):''}</td><td style="${td}">${r['도착계기(km)']?fmt(r['도착계기(km)']):''}</td><td style="${td}">${r['운행거리(km)']?fmt(r['운행거리(km)']):''}</td><td style="${td}">${r.비고||''}</td></tr>`).join('') +
          '</tbody></table>';
      }

      // 주유
      const fr = carRows.filter(r => r.구분 === '주유');
      if (fr.length > 0) {
        detailHTML += `<h3 style="font-size:10px;margin:10px 0 4px;color:#555;">주유 기록 (${fr.length}건)</h3>
          <table style="width:100%;border-collapse:collapse;font-size:9px;"><thead><tr>
            <th style="${th}">날짜</th><th style="${th}">기사</th><th style="${th}">주유소</th><th style="${th}">연료</th><th style="${th}">주유량(L)</th><th style="${th}">금액(원)</th><th style="${th}">결제</th>
          </tr></thead><tbody>` +
          fr.map(r => `<tr><td style="${td}">${r.날짜}</td><td style="${td}">${r.기사명}</td><td style="${td}">${r.주유소||''}</td><td style="${td}">${r.연료||''}</td><td style="${td}">${r['주유량(L)']||''}</td><td style="${td}">${r['주유금액(원)']?fmt(r['주유금액(원)']):''}</td><td style="${td}">${r.결제방법||''}</td></tr>`).join('') +
          '</tbody></table>';
      }

      // 정비
      const mr = carRows.filter(r => r.구분 === '정비');
      if (mr.length > 0) {
        detailHTML += `<h3 style="font-size:10px;margin:10px 0 4px;color:#555;">정비 기록 (${mr.length}건)</h3>
          <table style="width:100%;border-collapse:collapse;font-size:9px;"><thead><tr>
            <th style="${th}">날짜</th><th style="${th}">기사</th><th style="${th}">정비유형</th><th style="${th}">정비업체</th><th style="${th}">금액(원)</th><th style="${th}">결제</th><th style="${th}">비고</th>
          </tr></thead><tbody>` +
          mr.map(r => `<tr><td style="${td}">${r.날짜}</td><td style="${td}">${r.기사명}</td><td style="${td}">${r.정비유형||''}</td><td style="${td}">${r.정비업체||''}</td><td style="${td}">${r['정비금액(원)']?fmt(r['정비금액(원)']):''}</td><td style="${td}">${r.결제방법||''}</td><td style="${td}">${r.비고||''}</td></tr>`).join('') +
          '</tbody></table>';
      }

      // 지출
      const er = carRows.filter(r => r.구분 === '지출');
      if (er.length > 0) {
        detailHTML += `<h3 style="font-size:10px;margin:10px 0 4px;color:#555;">지출 기록 (${er.length}건)</h3>
          <table style="width:100%;border-collapse:collapse;font-size:9px;"><thead><tr>
            <th style="${th}">날짜</th><th style="${th}">기사</th><th style="${th}">지출유형</th><th style="${th}">금액(원)</th><th style="${th}">결제</th><th style="${th}">비고</th>
          </tr></thead><tbody>` +
          er.map(r => `<tr><td style="${td}">${r.날짜}</td><td style="${td}">${r.기사명}</td><td style="${td}">${r.지출유형||''}</td><td style="${td}">${r['지출금액(원)']?fmt(r['지출금액(원)']):''}</td><td style="${td}">${r.결제방법||''}</td><td style="${td}">${r.비고||''}</td></tr>`).join('') +
          '</tbody></table>';
      }
    });
  }

  // ===== 월별 차량별 연비 비교 보고서 =====
  const now = new Date();
  const months6 = [];
  for (let i = 5; i >= 0; i--) {
    const dm = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months6.push(dm.toISOString().slice(0, 7));
  }

  let effHTML = '<h2 style="font-size:13px;margin:24px 0 8px;border-bottom:2px solid #333;padding-bottom:4px;">월별 차량별 연비 비교 (최근 6개월)</h2>';

  // Table
  const td2 = 'padding:4px 6px;border:1px solid #ddd;text-align:center;font-size:10px;';
  const th2 = 'padding:5px 6px;border:1px solid #bbb;background:#f0f0f0;text-align:center;font-size:10px;font-weight:bold;';

  effHTML += '<table style="width:100%;border-collapse:collapse;margin-bottom:16px;"><thead><tr>';
  effHTML += `<th style="${th2}">차량</th>`;
  months6.forEach(m => { effHTML += `<th style="${th2}">${m.slice(2).replace('-','.')}월</th>`; });
  effHTML += `<th style="${th2};background:#e8f0fe;">평균</th></tr></thead><tbody>`;

  const allEffData = [];
  CONFIG.cars.forEach(car => {
    const data = loadCarData(car.plate);
    const monthEffs = months6.map(m => {
      const mDrives = data.drives.filter(d => d.date && d.date.startsWith(m));
      const mFuels = data.fuels.filter(f => f.date && f.date.startsWith(m));
      return calcFuelEfficiency(mDrives, mFuels);
    });
    const validEffs = monthEffs.filter(e => e !== null).map(Number);
    const avg = validEffs.length > 0 ? (validEffs.reduce((a,b)=>a+b,0) / validEffs.length).toFixed(1) : '-';

    allEffData.push({ plate: car.plate, model: car.model, monthEffs, avg });

    effHTML += '<tr>';
    effHTML += `<td style="${td2};text-align:left;font-weight:bold;">${car.plate}<br><span style="font-size:8px;color:#888;">${car.model}</span></td>`;
    monthEffs.forEach(e => {
      const val = e || '-';
      const color = e ? (Number(e) >= 8 ? '#16a34a' : Number(e) >= 5 ? '#333' : '#dc2626') : '#999';
      effHTML += `<td style="${td2};color:${color};font-weight:${e?'bold':'normal'};">${val}</td>`;
    });
    effHTML += `<td style="${td2};background:#e8f0fe;font-weight:bold;">${avg}</td>`;
    effHTML += '</tr>';
  });

  // Overall average row
  effHTML += '<tr style="background:#f9f9f9;">';
  effHTML += `<td style="${td2};text-align:left;font-weight:bold;">전체 평균</td>`;
  months6.forEach((m, mi) => {
    const vals = allEffData.map(d => d.monthEffs[mi]).filter(e => e !== null).map(Number);
    const mAvg = vals.length > 0 ? (vals.reduce((a,b)=>a+b,0) / vals.length).toFixed(1) : '-';
    effHTML += `<td style="${td2};font-weight:bold;">${mAvg}</td>`;
  });
  const allAvgs = allEffData.map(d => d.avg).filter(a => a !== '-').map(Number);
  const totalAvg = allAvgs.length > 0 ? (allAvgs.reduce((a,b)=>a+b,0) / allAvgs.length).toFixed(1) : '-';
  effHTML += `<td style="${td2};background:#e8f0fe;font-weight:bold;">${totalAvg}</td>`;
  effHTML += '</tr></tbody></table>';

  // Visual bar chart
  effHTML += '<div style="margin-top:8px;">';
  effHTML += '<h3 style="font-size:11px;margin-bottom:8px;color:#555;">차량별 평균 연비 비교</h3>';
  const maxAvg = Math.max(...allEffData.map(d => d.avg === '-' ? 0 : Number(d.avg)), 1);
  const barColors = ['#2563EB','#10B981','#F59E0B','#8B5CF6','#EC4899','#06B6D4','#EF4444','#84CC16'];
  allEffData.forEach((d, i) => {
    const pct = d.avg !== '-' ? Math.round((Number(d.avg) / maxAvg) * 100) : 0;
    const color = barColors[i % barColors.length];
    effHTML += `<div style="display:flex;align-items:center;margin-bottom:6px;font-size:10px;">
      <div style="width:80px;flex-shrink:0;font-weight:bold;">${d.plate}</div>
      <div style="flex:1;background:#eee;border-radius:3px;height:16px;overflow:hidden;">
        <div style="width:${pct}%;background:${color};height:100%;border-radius:3px;"></div>
      </div>
      <div style="width:55px;text-align:right;font-weight:bold;margin-left:6px;">${d.avg !== '-' ? d.avg + ' km/L' : '-'}</div>
    </div>`;
  });
  effHTML += '</div>';

  // Unit: km/L legend
  effHTML += '<div style="margin-top:10px;font-size:8px;color:#999;text-align:right;">단위: km/L | <span style="color:#16a34a;">■</span> 8 이상(양호) <span style="color:#333;">■</span> 5~8(보통) <span style="color:#dc2626;">■</span> 5 미만(주의)</div>';

  const w = window.open('','_blank');
  if (!w) { showToast('팝업을 허용해 주세요', 'error'); return; }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>법인차량 운행기록부 - ${month}</title>
    <style>body{font-family:'맑은 고딕',sans-serif;padding:24px;font-size:11px;color:#333;}h1{text-align:center;font-size:17px;margin-bottom:3px;}h2{font-size:12px;margin:16px 0 8px;border-bottom:2px solid #333;padding-bottom:3px;}.meta{text-align:center;color:#666;margin-bottom:16px;font-size:10px;}@media print{@page{size:A4;margin:12mm;}}</style>
  </head><body><h1>법인차량 운행기록부</h1><div class="meta">기간: ${month} | 출력일: ${today()}</div><h2>차량별 요약</h2>${summaryHTML}${effHTML}<h2>상세 기록</h2>${detailHTML}</body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 500);
  showToast('PDF 출력 준비가 완료되었습니다', 'success');
}

function shareEmail() {
  const month = document.getElementById('dlMonth').value || thisMonth();
  // Load saved recipients
  const saved = localStorage.getItem('carlog_email_recipients') || '';

  document.getElementById('modalContent').innerHTML = `
    <div class="modal-title"><i class="fa-solid fa-envelope"></i> 이메일 공유</div>
    <div style="background:var(--primary-50);border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:0.78rem;color:var(--text-secondary);">
      <i class="fa-solid fa-circle-info" style="color:var(--primary);margin-right:4px;"></i>
      보내기를 누르면 메일 앱(Outlook, 기본 메일)이 열립니다.<br>CSV 파일을 먼저 다운로드한 후 메일에 직접 첨부해주세요.
    </div>
    <div class="edit-form">
      <div class="edit-field">
        <label class="ef-label">받는 사람 (여러 명은 쉼표로 구분)</label>
        <input id="emailTo" type="text" class="ef-input" value="${saved}" placeholder="예: hong@company.com, kim@company.com">
      </div>
      <div class="edit-field">
        <label class="ef-label">참조 (CC)</label>
        <input id="emailCC" type="text" class="ef-input" placeholder="예: manager@company.com">
      </div>
      <div class="edit-field">
        <label class="ef-label">제목</label>
        <input id="emailSubject" type="text" class="ef-input" value="법인차량 운행기록부 - ${month}">
      </div>
      <div class="edit-field">
        <label class="ef-label">본문</label>
        <textarea id="emailBody" class="ef-input" rows="4" style="font-size:0.85rem;">안녕하세요,

${month} 법인차량 운행기록부를 첨부하여 보내드립니다.

※ CSV 파일을 먼저 다운로드한 후 이메일에 첨부해 주세요.

감사합니다.</textarea>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-primary" onclick="sendEmail()"><i class="fa-solid fa-paper-plane"></i> 보내기</button>
    </div>
  `;
  document.getElementById('recordModal').classList.add('show');
}

function sendEmail() {
  const to = document.getElementById('emailTo').value.trim();
  const cc = document.getElementById('emailCC').value.trim();
  const subject = document.getElementById('emailSubject').value.trim();
  const body = document.getElementById('emailBody').value.trim();

  if (!to) { showToast('받는 사람을 입력하세요', 'error'); return; }

  // Save recipients for next time
  localStorage.setItem('carlog_email_recipients', to);

  let mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  if (cc) mailto += `&cc=${encodeURIComponent(cc)}`;

  window.location.href = mailto;
  closeModal();
  showToast('이메일 클라이언트를 열었습니다', 'success');
}

// ===== REPORT PREVIEW =====
function renderReportPreview() {
  const el = document.getElementById('reportPreview');
  if (!el) return;
  const month = document.getElementById('dlMonth').value || thisMonth();
  const carFilter = document.getElementById('dlCar').value;
  const cars = carFilter === 'all' ? CONFIG.cars : CONFIG.cars.filter(c => c.plate === carFilter);

  let totalDist = 0, totalFuel = 0, totalFuelL = 0, totalMaint = 0, totalExp = 0, totalRecords = 0;
  let carSummaries = [];

  cars.forEach(car => {
    const data = loadCarData(car.plate);
    const mD = data.drives.filter(d => d.date && d.date.startsWith(month));
    const mF = data.fuels.filter(f => f.date && f.date.startsWith(month));
    const mM = data.maints.filter(m => m.date && m.date.startsWith(month));
    const mE = data.expenses.filter(e => e.date && e.date.startsWith(month));

    const dist = mD.reduce((s, d) => s + Math.max(0,(Number(d.oe)||0)-(Number(d.os)||0)), 0);
    const fuel = mF.reduce((s, f) => s + (Number(f.amount)||0), 0);
    const fuelL = mF.reduce((s, f) => s + (Number(f.liter)||0), 0);
    const maint = mM.reduce((s, m) => s + (Number(m.amount)||0), 0);
    const exp = mE.reduce((s, e) => s + (Number(e.amount)||0), 0);
    const cnt = mD.length + mF.length + mM.length + mE.length;
    const eff = calcFuelEfficiency(mD, mF);

    totalDist += dist; totalFuel += fuel; totalFuelL += fuelL; totalMaint += maint; totalExp += exp; totalRecords += cnt;

    if (cnt > 0) {
      carSummaries.push({ plate: car.plate, model: car.model, dist, fuel, fuelL, maint, exp, cnt, eff });
    }
  });

  const totalSpend = totalFuel + totalMaint + totalExp;
  const overallEff = totalDist > 0 && totalFuelL > 0 ? (totalDist / totalFuelL).toFixed(1) : '-';
  const monthLabel = month.replace('-', '년 ') + '월';

  if (totalRecords === 0) {
    el.innerHTML = `<div class="rp-empty"><i class="fa-regular fa-clipboard"></i> ${monthLabel} 데이터가 없습니다.</div>`;
    return;
  }

  el.innerHTML = `
    <div class="report-preview">
      <div class="rp-header">
        <div class="rp-title"><i class="fa-solid fa-chart-bar"></i> ${monthLabel} 보고서 미리보기</div>
        <div class="rp-records">${totalRecords}건</div>
      </div>

      <!-- Total Summary -->
      <div class="rp-total-grid">
        <div class="rp-total-item">
          <div class="rpt-label">총 주행거리</div>
          <div class="rpt-value">${fmt(totalDist)} <small>km</small></div>
        </div>
        <div class="rp-total-item">
          <div class="rpt-label">평균 연비</div>
          <div class="rpt-value">${overallEff} <small>km/L</small></div>
        </div>
        <div class="rp-total-item">
          <div class="rpt-label">총 주유비</div>
          <div class="rpt-value">${fmt(totalFuel)} <small>원</small></div>
        </div>
        <div class="rp-total-item">
          <div class="rpt-label">총 지출</div>
          <div class="rpt-value rpt-highlight">${fmt(totalSpend)} <small>원</small></div>
        </div>
      </div>

      <!-- Spend Breakdown -->
      <div class="rp-breakdown">
        <div class="rpb-title">지출 구성</div>
        <div class="rpb-bar">
          ${totalSpend > 0 ? `
            <div class="rpb-seg rpb-fuel" style="width:${Math.round(totalFuel/totalSpend*100)}%" title="주유 ${fmt(totalFuel)}원"></div>
            <div class="rpb-seg rpb-maint" style="width:${Math.round(totalMaint/totalSpend*100)}%" title="정비 ${fmt(totalMaint)}원"></div>
            <div class="rpb-seg rpb-exp" style="width:${Math.round(totalExp/totalSpend*100)}%" title="기타 ${fmt(totalExp)}원"></div>
          ` : ''}
        </div>
        <div class="rpb-legend">
          <span><i class="rpb-dot" style="background:var(--primary);"></i>주유 ${fmt(totalFuel)}원</span>
          <span><i class="rpb-dot" style="background:var(--emerald);"></i>정비 ${fmt(totalMaint)}원</span>
          <span><i class="rpb-dot" style="background:var(--purple);"></i>기타 ${fmt(totalExp)}원</span>
        </div>
      </div>

      <!-- Per-car breakdown -->
      ${carSummaries.length >= 1 ? `
        <div class="rp-cars-title">차량별 요약</div>
        ${carSummaries.map(c => `
          <div class="rp-car-row">
            <div class="rpc-header">
              <div class="rpc-plate">${c.plate}</div>
              <div class="rpc-model">${c.model}</div>
            </div>
            <div class="rpc-grid rpc-grid-5">
              <div class="rpc-item"><div class="rpc-val">${fmt(c.dist)}km</div><div class="rpc-lbl">주행거리</div></div>
              <div class="rpc-item"><div class="rpc-val">${fmt(c.fuel)}원</div><div class="rpc-lbl">주유비</div></div>
              <div class="rpc-item"><div class="rpc-val">${fmt(c.maint)}원</div><div class="rpc-lbl">정비비</div></div>
              <div class="rpc-item"><div class="rpc-val">${fmt(c.exp)}원</div><div class="rpc-lbl">기타지출</div></div>
              <div class="rpc-item rpc-total"><div class="rpc-val">${fmt(c.fuel + c.maint + c.exp)}원</div><div class="rpc-lbl">총 지출</div></div>
            </div>
          </div>
        `).join('')}
      ` : ''}
    </div>
  `;
}

// ===== RECORD DELETE =====
function deleteRecord(type, index, plate) {
  if (!confirm('이 기록을 삭제하시겠습니까?')) return;
  const targetPlate = plate || state.car;
  const data = loadCarData(targetPlate);
  const key = { drive: 'drives', fuel: 'fuels', maint: 'maints', expense: 'expenses' }[type];
  if (key && data[key] && data[key][index] !== undefined) {
    data[key].splice(index, 1);
    saveCarData(targetPlate, data);
    showToast('기록이 삭제되었습니다', 'success');
    closeModal();
    if (state.currentPage === 'driverHistory') loadDriverHistory();
    else if (state.currentPage === 'driverDashboard') showDriverDashboard();
    else if (state.currentPage === 'adminRecords') loadAdminRecords();
    else if (state.currentPage === 'adminDashboard') showAdminDashboard();
  }
}

// ===== RECORD DETAIL MODAL =====
function showRecordDetail(type, index, plate) {
  const targetPlate = plate || state.car;
  const data = loadCarData(targetPlate);
  const key = { drive: 'drives', fuel: 'fuels', maint: 'maints', expense: 'expenses' }[type];
  const record = data[key][index];
  if (!record) return;

  const typeLabels = { drive: '주행', fuel: '주유', maint: '정비', expense: '지출' };
  const typeIcons = { drive: 'fa-solid fa-route', fuel: 'fa-solid fa-gas-pump', maint: 'fa-solid fa-wrench', expense: 'fa-solid fa-receipt' };

  let rows = '';
  rows += detailRow('날짜', record.date);
  rows += detailRow('기사', record.driver);

  if (type === 'drive') {
    rows += detailRow('코스명', record.course || `${record.from||''} → ${record.to||''}`);
    rows += detailRow('출발 계기', `${fmt(record.os)} km`);
    rows += detailRow('도착 계기', `${fmt(record.oe)} km`);
    rows += detailRow('운행 거리', `${fmt(Math.max(0, (Number(record.oe)||0)-(Number(record.os)||0)))} km`);
  } else if (type === 'fuel') {
    if (record.station) rows += detailRow('주유소', record.station);
    rows += detailRow('주유량', `${record.liter} L`);
    rows += detailRow('금액', `${fmt(record.amount)}원`);
    rows += detailRow('연료', record.type);
    if (record.odo) rows += detailRow('계기판', `${fmt(record.odo)} km`);
    rows += detailRow('결제', record.pay);
  } else if (type === 'maint') {
    rows += detailRow('정비 유형', record.type);
    if (record.shop) rows += detailRow('정비 업체', record.shop);
    rows += detailRow('금액', `${fmt(record.amount)}원`);
    if (record.odo) rows += detailRow('계기판', `${fmt(record.odo)} km`);
    rows += detailRow('결제', record.pay);
  } else if (type === 'expense') {
    rows += detailRow('지출 유형', record.type);
    rows += detailRow('금액', `${fmt(record.amount)}원`);
    rows += detailRow('결제', record.pay);
  }
  if (record.note) rows += detailRow('비고', record.note);

  const receiptBtn = record.receipt
    ? `<button class="btn btn-outline btn-full" style="margin-bottom:10px;" onclick="showReceiptImage(\`${record.receipt}\`)">
        <i class="fa-solid fa-receipt"></i> 영수증 보기
      </button>`
    : '';

  document.getElementById('modalContent').innerHTML = `
    <div class="modal-title">
      <i class="${typeIcons[type]}"></i> ${typeLabels[type]} 기록 상세
    </div>
    ${rows}
    ${receiptBtn}
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="openEditModal('${type}',${index},'${targetPlate}')">
        <i class="fa-solid fa-pen"></i> 수정
      </button>
      <button class="btn btn-primary" style="background:var(--danger);" onclick="deleteRecord('${type}',${index},'${targetPlate}')">
        <i class="fa-regular fa-trash-can"></i> 삭제
      </button>
    </div>
  `;
  document.getElementById('recordModal').classList.add('show');
}

function detailRow(label, value) {
  return `<div class="modal-detail-row"><span class="mdr-label">${label}</span><span class="mdr-value">${value || '-'}</span></div>`;
}

function closeModal() {
  document.getElementById('recordModal').classList.remove('show');
}

// ===== RECORD EDIT MODAL =====
function openEditModal(type, index, plate) {
  const targetPlate = plate || state.car;
  const data = loadCarData(targetPlate);
  const key = { drive: 'drives', fuel: 'fuels', maint: 'maints', expense: 'expenses' }[type];
  const r = data[key][index];
  if (!r) return;

  const typeLabels = { drive: '주행', fuel: '주유', maint: '정비', expense: '지출' };
  let formHTML = '';

  if (type === 'drive') {
    formHTML = `
      ${editField('e_date', '날짜', 'date', r.date)}
      ${editField('e_course', '코스명', 'text', r.course || `${r.from||''} → ${r.to||''}`)}
      ${editField('e_to', '도착지', 'text', r.to)}
      <div class="edit-row">${editField('e_os', '출발 계기(km)', 'number', r.os)}${editField('e_oe', '도착 계기(km)', 'number', r.oe)}</div>
      ${editField('e_note', '비고', 'text', r.note)}
    `;
  } else if (type === 'fuel') {
    formHTML = `
      ${editField('e_date', '날짜', 'date', r.date)}
      ${editField('e_station', '주유소명', 'text', r.station)}
      <div class="edit-row">${editField('e_liter', '주유량(L)', 'number', r.liter)}${editField('e_amount', '금액(원)', 'number', r.amount)}</div>
      <div class="edit-row">
        ${editSelect('e_ftype', '연료', ['휘발유','경유','LPG','전기'], r.type)}
        ${editField('e_odo', '계기(km)', 'number', r.odo)}
      </div>
      ${editSelect('e_pay', '결제', ['법인카드','현금','개인카드'], r.pay)}
    `;
  } else if (type === 'maint') {
    formHTML = `
      ${editField('e_date', '날짜', 'date', r.date)}
      ${editSelect('e_mtype', '정비 유형', ['엔진오일 교환','타이어 교환','브레이크 정비','에어필터 교환','배터리 교환','정기 점검','사고 수리','기타'], r.type)}
      <div class="edit-row">${editField('e_shop', '정비 업체', 'text', r.shop)}${editField('e_amount', '금액(원)', 'number', r.amount)}</div>
      <div class="edit-row">${editField('e_odo', '계기(km)', 'number', r.odo)}${editSelect('e_pay', '결제', ['법인카드','현금','개인카드'], r.pay)}</div>
      ${editField('e_note', '비고', 'text', r.note)}
    `;
  } else if (type === 'expense') {
    formHTML = `
      ${editField('e_date', '날짜', 'date', r.date)}
      ${editSelect('e_etype', '지출 유형', ['주차비','통행료','세차비','보험료','차량 검사비','기타'], r.type)}
      <div class="edit-row">${editField('e_amount', '금액(원)', 'number', r.amount)}${editSelect('e_pay', '결제', ['법인카드','현금','개인카드'], r.pay)}</div>
      ${editField('e_note', '비고', 'text', r.note)}
    `;
  }

  document.getElementById('modalContent').innerHTML = `
    <div class="modal-title"><i class="fa-solid fa-pen"></i> ${typeLabels[type]} 기록 수정</div>
    <div class="edit-form">${formHTML}</div>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="showRecordDetail('${type}',${index},'${targetPlate}')">취소</button>
      <button class="btn btn-primary" onclick="saveEdit('${type}',${index},'${targetPlate}')">
        <i class="fa-solid fa-check"></i> 저장
      </button>
    </div>
  `;
}

function editField(id, label, type, value) {
  return `<div class="edit-field">
    <label class="ef-label">${label}</label>
    <input id="${id}" type="${type}" class="ef-input" value="${value || ''}" ${type==='number'?'inputmode="numeric"':''}>
  </div>`;
}

function editSelect(id, label, options, selected) {
  return `<div class="edit-field">
    <label class="ef-label">${label}</label>
    <select id="${id}" class="ef-input">
      ${options.map(o => `<option value="${o}" ${o===selected?'selected':''}>${o}</option>`).join('')}
    </select>
  </div>`;
}

function saveEdit(type, index, plate) {
  const targetPlate = plate || state.car;
  const data = loadCarData(targetPlate);
  const key = { drive: 'drives', fuel: 'fuels', maint: 'maints', expense: 'expenses' }[type];
  const r = data[key][index];
  if (!r) return;

  if (type === 'drive') {
    r.date = document.getElementById('e_date').value;
    r.course = document.getElementById('e_course').value.trim();
    delete r.from; delete r.to;
    r.to = document.getElementById('e_to').value.trim();
    r.os = document.getElementById('e_os').value;
    r.oe = document.getElementById('e_oe').value;
    r.note = document.getElementById('e_note').value.trim();
    if (!r.date || !r.course || !r.os || !r.oe) {
      showToast('필수 항목을 모두 입력하세요', 'error'); return;
    }
  } else if (type === 'fuel') {
    r.date = document.getElementById('e_date').value;
    r.station = document.getElementById('e_station').value.trim();
    r.liter = document.getElementById('e_liter').value;
    r.amount = document.getElementById('e_amount').value;
    r.type = document.getElementById('e_ftype').value;
    r.odo = document.getElementById('e_odo').value;
    r.pay = document.getElementById('e_pay').value;
    if (!r.date || !r.liter || !r.amount) { showToast('필수 항목을 모두 입력하세요', 'error'); return; }
  } else if (type === 'maint') {
    r.date = document.getElementById('e_date').value;
    r.type = document.getElementById('e_mtype').value;
    r.shop = document.getElementById('e_shop').value.trim();
    r.amount = document.getElementById('e_amount').value;
    r.odo = document.getElementById('e_odo').value;
    r.pay = document.getElementById('e_pay').value;
    r.note = document.getElementById('e_note').value.trim();
    if (!r.date || !r.type || !r.amount) { showToast('필수 항목을 모두 입력하세요', 'error'); return; }
  } else if (type === 'expense') {
    r.date = document.getElementById('e_date').value;
    r.type = document.getElementById('e_etype').value;
    r.amount = document.getElementById('e_amount').value;
    r.pay = document.getElementById('e_pay').value;
    r.note = document.getElementById('e_note').value.trim();
    if (!r.date || !r.type || !r.amount) { showToast('필수 항목을 모두 입력하세요', 'error'); return; }
  }

  saveCarData(targetPlate, data);
  showToast('기록이 수정되었습니다', 'success');
  closeModal();
  // Refresh
  if (state.currentPage === 'driverHistory') loadDriverHistory();
  else if (state.currentPage === 'driverDashboard') showDriverDashboard();
  else if (state.currentPage === 'adminRecords') loadAdminRecords();
  else if (state.currentPage === 'adminDashboard') showAdminDashboard();
}

// ===== MINI BAR CHART (Dashboard) =====
function renderMiniChart(data, driverName) {
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d.toISOString().slice(0, 7));
  }

  const vals = months.map(m => {
    const drives = data.drives.filter(d => d.date && d.date.startsWith(m) && (!driverName || d.driver === driverName));
    return drives.reduce((s, d) => s + Math.max(0, (Number(d.oe)||0) - (Number(d.os)||0)), 0);
  });
  const max = Math.max(...vals, 1);

  return `<div class="mini-chart">
    <div class="mc-title">최근 6개월 주행거리</div>
    <div class="mc-bars">
      ${months.map((m, i) => {
        const pct = Math.round((vals[i] / max) * 100);
        const label = m.slice(5) + '월';
        return `<div class="mc-col">
          <div class="mc-val">${vals[i] > 0 ? fmt(vals[i]) : ''}</div>
          <div class="mc-bar-wrap"><div class="mc-bar" style="height:${Math.max(pct, 4)}%"></div></div>
          <div class="mc-label">${label}</div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

// ===== SETTINGS =====
function switchSettingsTab() {
  if (state.role === 'admin') {
    showAdminSettings();
  } else {
    showDriverSettings();
  }
}

function showDriverSettings() {
  const car = CONFIG.cars.find(c => c.plate === state.car);
  document.getElementById('settingsProfile').innerHTML = `
    <div class="sp-avatar">${state.driver.charAt(0)}</div>
    <div class="sp-info">
      <div class="sp-name">${state.driver}</div>
      <div class="sp-detail">${car.plate} / ${car.model}</div>
    </div>
  `;
  document.getElementById('settingsCarCount').textContent = CONFIG.cars.length + '대';
  showPage('settingsPage');
}

function showAdminSettings() {
  const el = document.getElementById('adminCarSettings');
  el.innerHTML = CONFIG.cars.map((c, i) =>
    `<button class="settings-item" data-caridx="${i}" style="width:100%;">
      <div style="flex:1;text-align:left;">
        <div style="font-weight:700;font-size:0.95rem;">${c.plate}</div>
        <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px;">${c.model} | ${c.drivers.join(', ')}</div>
      </div>
      <i class="fa-solid fa-chevron-right si-arrow"></i>
    </button>`
  ).join('') +
  `<button class="btn btn-outline btn-full" style="margin-top:10px;" onclick="openAddCar()">
    <i class="fa-solid fa-plus"></i> 차량 추가
  </button>`;

  // Event delegation for car items
  el.querySelectorAll('[data-caridx]').forEach(btn => {
    btn.addEventListener('click', function() {
      openEditCar(Number(this.dataset.caridx));
    });
  });

  showPage('adminSettings');
}

function openAddCar() {
  document.getElementById('modalContent').innerHTML = `
    <div class="modal-title"><i class="fa-solid fa-plus"></i> 차량 추가</div>
    <div class="edit-form">
      ${editField('car_plate', '차량번호', 'text', '')}
      ${editField('car_model', '차종', 'text', '')}
      ${editField('car_drivers', '기사 (쉼표로 구분)', 'text', '')}
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-primary" onclick="saveCarConfig(-1)"><i class="fa-solid fa-check"></i> 추가</button>
    </div>
  `;
  document.getElementById('recordModal').classList.add('show');
}

function openEditCar(idx) {
  const c = CONFIG.cars[idx];
  if (!c) return;
  document.getElementById('modalContent').innerHTML = `
    <div class="modal-title"><i class="fa-solid fa-pen"></i> 차량 수정</div>
    <div class="edit-form">
      ${editField('car_plate', '차량번호', 'text', c.plate)}
      ${editField('car_model', '차종', 'text', c.model)}
      ${editField('car_drivers', '기사 (쉼표로 구분)', 'text', c.drivers.join(', '))}
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline" style="color:var(--danger);border-color:var(--danger);" onclick="deleteCar(${idx})">
        <i class="fa-regular fa-trash-can"></i> 삭제
      </button>
      <button class="btn btn-primary" onclick="saveCarConfig(${idx})"><i class="fa-solid fa-check"></i> 저장</button>
    </div>
  `;
  document.getElementById('recordModal').classList.add('show');
}

function saveCarConfig(idx) {
  const plate = document.getElementById('car_plate').value.trim();
  const model = document.getElementById('car_model').value.trim();
  const driversStr = document.getElementById('car_drivers').value.trim();

  if (!plate) { showToast('차량번호를 입력하세요', 'error'); return; }
  if (!model) { showToast('차종을 입력하세요', 'error'); return; }
  if (!driversStr) { showToast('기사를 입력하세요', 'error'); return; }

  const drivers = driversStr.split(',').map(s => s.trim()).filter(s => s);

  if (idx >= 0) {
    const oldPlate = CONFIG.cars[idx].plate;
    // If plate changed, migrate data
    if (oldPlate !== plate) {
      const oldData = loadCarData(oldPlate);
      saveCarData(plate, oldData);
      localStorage.removeItem('v2_' + oldPlate);
    }
    CONFIG.cars[idx] = { plate, model, drivers };
  } else {
    // Check duplicate
    if (CONFIG.cars.some(c => c.plate === plate)) {
      showToast('이미 등록된 차량번호입니다', 'error'); return;
    }
    CONFIG.cars.push({ plate, model, drivers });
  }

  saveConfig();
  closeModal();
  showToast(idx >= 0 ? '차량 정보가 수정되었습니다' : '차량이 추가되었습니다', 'success');
  renderCarGrid();
  showAdminSettings();
}

function deleteCar(idx) {
  const c = CONFIG.cars[idx];
  if (!confirm(`${c.plate} (${c.model}) 차량을 삭제하시겠습니까?\n해당 차량의 모든 운행 데이터도 삭제됩니다.`)) return;
  localStorage.removeItem('v2_' + c.plate);
  CONFIG.cars.splice(idx, 1);
  saveConfig();
  closeModal();
  showToast('차량이 삭제되었습니다', 'success');
  renderCarGrid();
  showAdminSettings();
}

function exportMyData() {
  const data = loadCarData(state.car);
  const month = thisMonth();
  const headers = ['날짜','구분','내용','금액/거리','비고'];
  let csv = '\uFEFF' + headers.join(',') + '\n';

  data.drives.filter(d => d.driver === state.driver).forEach(d => {
    csv += `${d.date},주행,"${d.course || `${d.from||''} → ${d.to||''}`}",${Math.max(0,(Number(d.oe)||0)-(Number(d.os)||0))} km,${d.note||''}\n`;
  });
  data.fuels.filter(f => f.driver === state.driver).forEach(f => {
    csv += `${f.date},주유,"${f.station||''} ${f.type||''}",${f.amount}원,\n`;
  });
  data.maints.filter(m => m.driver === state.driver).forEach(m => {
    csv += `${m.date},정비,${m.type},${m.amount}원,${m.note||''}\n`;
  });
  data.expenses.filter(e => e.driver === state.driver).forEach(e => {
    csv += `${e.date},지출,${e.type},${e.amount}원,${e.note||''}\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `내기록_${state.driver}_${today()}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  showToast('내 기록이 다운로드되었습니다', 'success');
}

function clearMyData() {
  if (!confirm(`${state.car} 차량의 모든 데이터를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
  saveCarData(state.car, { drives: [], fuels: [], maints: [], expenses: [] });
  showToast('데이터가 초기화되었습니다', 'success');
}

function clearAllCarsData() {
  if (!confirm('모든 차량의 데이터를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) return;
  CONFIG.cars.forEach(c => {
    localStorage.removeItem('v2_' + c.plate);
    syncCarToCloud(c.plate, { drives: [], fuels: [], maints: [], expenses: [] });
  });
  showToast('전체 데이터가 초기화되었습니다', 'success');
  showAdminDashboard();
}

function resetAllData() {
  if (!confirm('기존 데이터를 삭제하고 샘플 데이터를 다시 로드하시겠습니까?')) return;
  CONFIG.cars.forEach(c => {
    localStorage.removeItem('v2_' + c.plate);
  });
  loadSampleData();
  // Sync all sample data to cloud
  CONFIG.cars.forEach(c => {
    syncCarToCloud(c.plate, loadCarData(c.plate));
  });
  syncConfigToCloud();
  showToast('샘플 데이터가 재설정되었습니다', 'success');
  if (state.role === 'admin') showAdminDashboard();
  else showDriverDashboard();
}

async function syncAllToCloud() {
  if (!db) { showToast('클라우드 연결 없음', 'error'); return; }
  showToast('클라우드 동기화 중...', '');
  try {
    // Upload config
    await db.from('app_config').upsert({ id: 'main', config: CONFIG, updated_at: new Date().toISOString() });
    // Upload all car data
    for (const car of CONFIG.cars) {
      const data = loadCarData(car.plate);
      await db.from('car_data').upsert({ plate: car.plate, data: data, updated_at: new Date().toISOString() });
    }
    showToast('클라우드 동기화 완료!', 'success');
  } catch (e) {
    showToast('동기화 실패', 'error');
  }
}

// ===== SAMPLE DATA =====
function loadSampleData() {
  // No sample data - real vehicles only
}

// ===== FUEL EFFICIENCY CHART (Driver) =====
function renderFuelEffChart(data, driverName) {
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d.toISOString().slice(0, 7));
  }

  const vals = months.map(m => {
    const drives = data.drives.filter(d => d.date && d.date.startsWith(m) && (!driverName || d.driver === driverName));
    const fuels = data.fuels.filter(f => f.date && f.date.startsWith(m) && (!driverName || f.driver === driverName));
    const eff = calcFuelEfficiency(drives, fuels);
    return eff ? parseFloat(eff) : 0;
  });
  const max = Math.max(...vals, 1);
  const hasData = vals.some(v => v > 0);
  if (!hasData) return '';

  return `<div class="mini-chart" style="margin-top:12px;">
    <div class="mc-title"><i class="fa-solid fa-gas-pump" style="margin-right:4px;color:var(--amber);"></i> 최근 6개월 연비 추이</div>
    <div class="mc-bars">
      ${months.map((m, i) => {
        const pct = Math.round((vals[i] / max) * 100);
        const label = m.slice(5) + '월';
        return `<div class="mc-col">
          <div class="mc-val">${vals[i] > 0 ? vals[i].toFixed(1) : ''}</div>
          <div class="mc-bar-wrap"><div class="mc-bar" style="height:${Math.max(pct, vals[i]>0?4:0)}%;background:linear-gradient(180deg, var(--amber) 0%, #FCD34D 100%);"></div></div>
          <div class="mc-label">${label}</div>
        </div>`;
      }).join('')}
    </div>
    <div style="text-align:center;font-size:0.65rem;color:var(--text-muted);margin-top:6px;">단위: km/L</div>
  </div>`;
}

// ===== ADMIN CHART (Stacked: 주유/정비/지출) =====
function renderAdminChart(allData) {
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d.toISOString().slice(0, 7));
  }

  const fuelVals = months.map(m => allData.fuels.filter(f => f.date && f.date.startsWith(m)).reduce((s,f) => s+(Number(f.amount)||0), 0));
  const maintVals = months.map(m => allData.maints.filter(x => x.date && x.date.startsWith(m)).reduce((s,x) => s+(Number(x.amount)||0), 0));
  const expVals = months.map(m => allData.expenses.filter(x => x.date && x.date.startsWith(m)).reduce((s,x) => s+(Number(x.amount)||0), 0));
  const totals = months.map((_, i) => fuelVals[i] + maintVals[i] + expVals[i]);
  const max = Math.max(...totals, 1);

  return `<div class="mini-chart">
    <div class="mc-title">최근 6개월 지출 현황 <span style="font-size:0.6rem;color:var(--text-muted);margin-left:8px;">
      <span style="display:inline-block;width:8px;height:8px;background:var(--primary);border-radius:2px;vertical-align:middle;"></span> 주유
      <span style="display:inline-block;width:8px;height:8px;background:var(--emerald);border-radius:2px;vertical-align:middle;margin-left:6px;"></span> 정비
      <span style="display:inline-block;width:8px;height:8px;background:var(--purple);border-radius:2px;vertical-align:middle;margin-left:6px;"></span> 지출
    </span></div>
    <div class="mc-bars">
      ${months.map((m, i) => {
        const fPct = Math.round((fuelVals[i] / max) * 100);
        const mPct = Math.round((maintVals[i] / max) * 100);
        const ePct = Math.round((expVals[i] / max) * 100);
        const label = m.slice(5) + '월';
        const total = totals[i];
        return `<div class="mc-col">
          <div class="mc-val">${total > 0 ? (total >= 10000 ? Math.round(total/10000) + '만' : fmt(total)) : ''}</div>
          <div class="mc-bar-wrap">
            <div class="mc-bar-stack">
              <div style="height:${Math.max(fPct,total>0?2:0)}%;background:var(--primary);"></div>
              <div style="height:${Math.max(mPct,0)}%;background:var(--emerald);"></div>
              <div style="height:${Math.max(ePct,0)}%;background:var(--purple);"></div>
            </div>
          </div>
          <div class="mc-label">${label}</div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

// ===== INPUT HELPERS =====
function getLastOdometer() {
  const data = loadCarData(state.car);
  let maxOdo = 0;
  data.drives.forEach(d => {
    const oe = Number(d.oe) || 0;
    if (oe > maxOdo) maxOdo = oe;
  });
  data.fuels.forEach(f => {
    const odo = Number(f.odo) || 0;
    if (odo > maxOdo) maxOdo = odo;
  });
  data.maints.forEach(m => {
    const odo = Number(m.odo) || 0;
    if (odo > maxOdo) maxOdo = odo;
  });
  return maxOdo;
}

function prefillOdometer() {
  const lastOdo = getLastOdometer();
  if (lastOdo > 0) {
    const osEl = document.getElementById('driveOS');
    if (osEl && !osEl.value) osEl.value = lastOdo;
    const fuelOdo = document.getElementById('fuelOdo');
    if (fuelOdo && !fuelOdo.value) fuelOdo.value = lastOdo;
    const maintOdo = document.getElementById('maintOdo');
    if (maintOdo && !maintOdo.value) maintOdo.value = lastOdo;
  }
}

// ===== CONSUMABLES (소모품 관리) =====
function switchToConsumables() {
  renderConsumablesList();
  showPage('consumablesPage');
}

function renderConsumablesList() {
  const data = loadCarData(state.car);
  if (!data.consumables) data.consumables = [];
  const items = data.consumables;
  const el = document.getElementById('consumablesList');

  if (items.length === 0) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-icon"><i class="fa-solid fa-oil-can"></i></div>
      <p>등록된 소모품이 없습니다.<br>오른쪽 상단 + 버튼으로 추가하세요.</p>
    </div>`;
    return;
  }

  // Sort: overdue first, then by next date/km
  const now = new Date();
  const todayStr = today();
  const lastOdo = getLastOdometer();

  const sorted = items.map((item, i) => {
    let status = 'ok'; // ok, soon, overdue
    let urgency = 999;
    if (item.nextDate) {
      const diff = Math.floor((new Date(item.nextDate) - now) / 86400000);
      if (diff < 0) { status = 'overdue'; urgency = diff; }
      else if (diff <= 30) { status = 'soon'; urgency = diff; }
      else urgency = diff;
    }
    if (item.nextKm && lastOdo > 0) {
      const kmLeft = Number(item.nextKm) - lastOdo;
      if (kmLeft <= 0) { status = 'overdue'; urgency = Math.min(urgency, -1); }
      else if (kmLeft <= 3000) { status = status === 'overdue' ? 'overdue' : 'soon'; urgency = Math.min(urgency, Math.floor(kmLeft / 100)); }
    }
    return { ...item, _idx: i, _status: status, _urgency: urgency };
  }).sort((a, b) => a._urgency - b._urgency);

  el.innerHTML = sorted.map(item => {
    const statusClass = item._status === 'overdue' ? 'cs-overdue' : item._status === 'soon' ? 'cs-soon' : 'cs-ok';
    const statusLabel = item._status === 'overdue' ? '교환 필요' : item._status === 'soon' ? '교환 임박' : '양호';
    const statusIcon = item._status === 'overdue' ? 'fa-circle-exclamation' : item._status === 'soon' ? 'fa-triangle-exclamation' : 'fa-circle-check';

    let details = [];
    if (item.cycle) details.push(`<span class="cs-cycle">${item.cycle}</span>`);
    if (item.nextDate) details.push(`<span>교환 예정: ${item.nextDate}</span>`);
    if (item.nextKm) details.push(`<span>교환 예정: ${fmt(item.nextKm)} km</span>`);
    if (item.lastDate) details.push(`<span>마지막 교환: ${item.lastDate}</span>`);
    if (item.lastKm) details.push(`<span>교환 시 계기: ${fmt(item.lastKm)} km</span>`);
    if (item.note) details.push(`<span class="cs-note">${item.note}</span>`);

    return `<div class="consumable-card ${statusClass}" onclick="openEditConsumable(${item._idx})">
      <div class="cs-header">
        <div class="cs-name">${item.name}</div>
        <div class="cs-status"><i class="fa-solid ${statusIcon}"></i> ${statusLabel}</div>
      </div>
      <div class="cs-details">${details.join('')}</div>
    </div>`;
  }).join('');
}

function renderConsumablesAlert() {
  const el = document.getElementById('consumablesAlert');
  if (!el) return;
  const data = loadCarData(state.car);
  if (!data.consumables || data.consumables.length === 0) { el.innerHTML = ''; return; }

  const now = new Date();
  const lastOdo = getLastOdometer();
  const alerts = [];

  data.consumables.forEach(item => {
    let alert = false;
    if (item.nextDate) {
      const diff = Math.floor((new Date(item.nextDate) - now) / 86400000);
      if (diff <= 30) alert = true;
    }
    if (item.nextKm && lastOdo > 0) {
      if (Number(item.nextKm) - lastOdo <= 3000) alert = true;
    }
    if (alert) alerts.push(item);
  });

  if (alerts.length === 0) { el.innerHTML = ''; return; }

  el.innerHTML = `<div class="alert-banner" onclick="switchDriverTab('consumables')">
    <div class="alert-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>
    <div class="alert-text">
      <strong>소모품 교환 알림</strong>
      <span>${alerts.map(a => a.name).join(', ')} 교환이 필요합니다</span>
    </div>
    <i class="fa-solid fa-chevron-right" style="color:var(--text-muted);"></i>
  </div>`;
}

function openAddConsumable() {
  document.getElementById('modalContent').innerHTML = `
    <div class="modal-title"><i class="fa-solid fa-plus"></i> 소모품 등록</div>
    <div class="edit-form">
      ${editField('cs_name', '소모품명', 'text', '')}
      ${editField('cs_cycle', '교환 주기', 'text', '')}
      ${editField('cs_nextDate', '다음 교환 예정일', 'date', '')}
      ${editField('cs_nextKm', '다음 교환 예정 km', 'number', '')}
      ${editField('cs_lastDate', '마지막 교환일', 'date', '')}
      ${editField('cs_lastKm', '교환 시 계기 (km)', 'number', '')}
      ${editField('cs_note', '비고', 'text', '')}
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-primary" onclick="saveConsumable(-1)"><i class="fa-solid fa-check"></i> 등록</button>
    </div>
  `;
  document.getElementById('recordModal').classList.add('show');
}

function openEditConsumable(idx) {
  const data = loadCarData(state.car);
  const item = data.consumables[idx];
  if (!item) return;

  document.getElementById('modalContent').innerHTML = `
    <div class="modal-title"><i class="fa-solid fa-pen"></i> 소모품 수정</div>
    <div class="edit-form">
      ${editField('cs_name', '소모품명', 'text', item.name)}
      ${editField('cs_cycle', '교환 주기', 'text', item.cycle)}
      ${editField('cs_nextDate', '다음 교환 예정일', 'date', item.nextDate)}
      ${editField('cs_nextKm', '다음 교환 예정 km', 'number', item.nextKm)}
      ${editField('cs_lastDate', '마지막 교환일', 'date', item.lastDate)}
      ${editField('cs_lastKm', '교환 시 계기 (km)', 'number', item.lastKm)}
      ${editField('cs_note', '비고', 'text', item.note)}
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline" style="color:var(--danger);border-color:var(--danger);" onclick="deleteConsumable(${idx})">
        <i class="fa-regular fa-trash-can"></i> 삭제
      </button>
      <button class="btn btn-primary" onclick="saveConsumable(${idx})"><i class="fa-solid fa-check"></i> 저장</button>
    </div>
  `;
  document.getElementById('recordModal').classList.add('show');
}

function saveConsumable(idx) {
  const name = document.getElementById('cs_name').value.trim();
  if (!name) { showToast('소모품명을 입력하세요', 'error'); return; }

  const item = {
    name,
    cycle: document.getElementById('cs_cycle').value.trim(),
    nextDate: document.getElementById('cs_nextDate').value,
    nextKm: document.getElementById('cs_nextKm').value,
    lastDate: document.getElementById('cs_lastDate').value,
    lastKm: document.getElementById('cs_lastKm').value,
    note: document.getElementById('cs_note').value.trim()
  };

  const data = loadCarData(state.car);
  if (!data.consumables) data.consumables = [];

  if (idx >= 0) {
    data.consumables[idx] = item;
  } else {
    data.consumables.push(item);
  }

  saveCarData(state.car, data);
  closeModal();
  showToast(idx >= 0 ? '소모품이 수정되었습니다' : '소모품이 등록되었습니다', 'success');
  renderConsumablesList();
}

function deleteConsumable(idx) {
  if (!confirm('이 소모품을 삭제하시겠습니까?')) return;
  const data = loadCarData(state.car);
  data.consumables.splice(idx, 1);
  saveCarData(state.car, data);
  closeModal();
  showToast('소모품이 삭제되었습니다', 'success');
  renderConsumablesList();
}

// ===== RECEIPT IMAGE =====
function previewReceipt(input, previewId) {
  const preview = document.getElementById(previewId);
  if (!input.files || !input.files[0]) { preview.innerHTML = ''; return; }

  const file = input.files[0];
  if (file.size > 5 * 1024 * 1024) {
    showToast('파일 크기가 5MB를 초과합니다', 'error');
    input.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    // Resize for storage efficiency
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      const maxW = 800;
      let w = img.width, h = img.height;
      if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
      preview.innerHTML = `
        <div class="receipt-img-wrap">
          <img src="${dataUrl}" alt="영수증">
          <button type="button" class="receipt-remove" onclick="removeReceipt('${input.id}','${previewId}')">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>`;
      preview.dataset.image = dataUrl;
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function removeReceipt(inputId, previewId) {
  document.getElementById(inputId).value = '';
  const preview = document.getElementById(previewId);
  preview.innerHTML = '';
  delete preview.dataset.image;
}

function getReceiptData(previewId) {
  const preview = document.getElementById(previewId);
  return preview && preview.dataset.image ? preview.dataset.image : '';
}

function showReceiptImage(dataUrl) {
  if (!dataUrl) return;
  document.getElementById('modalContent').innerHTML = `
    <div class="modal-title"><i class="fa-solid fa-receipt"></i> 영수증</div>
    <div style="text-align:center;">
      <img src="${dataUrl}" style="max-width:100%;border-radius:8px;margin:8px 0;">
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline btn-full" onclick="closeModal()">닫기</button>
    </div>
  `;
  document.getElementById('recordModal').classList.add('show');
}

// ===== FUEL PRICE AUTO CALC =====
function setupFuelAutoCalc() {
  const literEl = document.getElementById('fuelLiter');
  const amountEl = document.getElementById('fuelAmount');
  const previewId = 'fuelUnitPrice';

  function updateFuelPreview() {
    const liter = parseFloat(literEl.value) || 0;
    const amount = parseFloat(amountEl.value) || 0;
    let preview = document.getElementById(previewId);
    if (!preview) {
      preview = document.createElement('div');
      preview.id = previewId;
      preview.className = 'fuel-unit-price';
      // Insert after fuel amount row
      const row = amountEl.closest('.field-row');
      if (row) row.parentNode.insertBefore(preview, row.nextSibling);
    }
    if (liter > 0 && amount > 0) {
      const unitPrice = Math.round(amount / liter);
      preview.innerHTML = `<i class="fa-solid fa-calculator"></i> 리터당 단가: <strong>${fmt(unitPrice)}원/L</strong>`;
      preview.style.display = 'flex';
    } else {
      preview.style.display = 'none';
    }
  }

  literEl.addEventListener('input', updateFuelPreview);
  amountEl.addEventListener('input', updateFuelPreview);
}

// ===== DARK MODE =====
function initDarkMode() {
  const saved = localStorage.getItem('carlog_darkmode');
  if (saved === 'true') {
    document.documentElement.classList.add('dark');
  }
}

function toggleDarkMode() {
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('carlog_darkmode', isDark);
  showToast(isDark ? '다크 모드 켜짐' : '라이트 모드 켜짐', 'success');
  // Update meta theme-color
  document.querySelector('meta[name="theme-color"]').content = isDark ? '#111827' : '#2563EB';
}

// ===== SWIPE TO DELETE =====
function setupSwipe() {
  let startX = 0, currentItem = null, swiping = false;

  document.addEventListener('touchstart', e => {
    const item = e.target.closest('.swipe-item');
    if (!item) return;
    startX = e.touches[0].clientX;
    currentItem = item;
    swiping = false;
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!currentItem) return;
    const dx = e.touches[0].clientX - startX;
    if (dx < -20) {
      swiping = true;
      const shift = Math.max(dx, -80);
      currentItem.style.transform = `translateX(${shift}px)`;
      currentItem.style.transition = 'none';
      // Show delete bg
      if (!currentItem.querySelector('.swipe-bg')) {
        const bg = document.createElement('div');
        bg.className = 'swipe-bg';
        bg.innerHTML = '<i class="fa-regular fa-trash-can"></i>';
        currentItem.appendChild(bg);
      }
    }
  }, { passive: true });

  document.addEventListener('touchend', () => {
    if (!currentItem) return;
    const transform = currentItem.style.transform;
    const match = transform.match(/translateX\((-?\d+)/);
    const dx = match ? parseInt(match[1]) : 0;

    if (dx <= -60) {
      // Trigger delete
      const type = currentItem.dataset.type;
      const idx = parseInt(currentItem.dataset.idx);
      if (type && !isNaN(idx)) {
        currentItem.style.transition = 'transform 0.2s, opacity 0.2s';
        currentItem.style.transform = 'translateX(-100%)';
        currentItem.style.opacity = '0';
        setTimeout(() => deleteRecord(type, idx), 250);
      }
    } else {
      currentItem.style.transition = 'transform 0.2s';
      currentItem.style.transform = '';
      const bg = currentItem.querySelector('.swipe-bg');
      if (bg) bg.remove();
    }

    if (swiping) {
      // Prevent click from firing after swipe
      currentItem.style.pointerEvents = 'none';
      setTimeout(() => { if (currentItem) currentItem.style.pointerEvents = ''; }, 300);
    }
    currentItem = null;
    swiping = false;
  });
}

// ===== INIT =====
async function init() {
  initDarkMode();

  // Load from cloud (non-blocking)
  try {
    if (db) {
      const cloudLoaded = await loadFromCloud();
      if (cloudLoaded) CONFIG = loadConfig();
    }
  } catch(e) { console.warn('클라우드 동기화 스킵'); }

  loadSampleData();
  renderCarGrid();
  setupDriveDistPreview();
  setupFuelAutoCalc();
  setupSwipe();
  document.getElementById('driverName').addEventListener('keydown', e => { if (e.key === 'Enter') driverLogin(); });
  document.getElementById('adminCode').addEventListener('keydown', e => { if (e.key === 'Enter') adminLogin(); });

  // Show sync status
  if (db) {
    console.log('Supabase 연결됨 - 클라우드 동기화 활성화');
  }
}

document.addEventListener('DOMContentLoaded', init);
