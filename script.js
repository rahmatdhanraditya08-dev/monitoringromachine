// ============================================================
// FIREBASE CONFIG – GANTI DENGAN MILIK ANDA
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyCmS-FbsELKP1-uGm_ACvxauaW121useqM",
  authDomain: "monitoringromachine.firebaseapp.com",
  databaseURL: "https://monitoringromachine-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "monitoringromachine",
  storageBucket: "monitoringromachine.firebasestorage.app",
  messagingSenderId: "1012384116308",
  appId: "1:1012384116308:web:80eed5623d6177ee8787c1",
  measurementId: "G-8BYRDXEB4W"
};

// ============================================================
// KONFIGURASI TANGKI
// ============================================================
const TANKS = [
  { id: 0, capacity: 3300, height: 200 },
  { id: 1, capacity: 3300, height: 200 },
  { id: 2, capacity: 1100, height: 150 }
];

// ============================================================
// DATA STORAGE (localStorage) – update per 5 menit
// ============================================================
const STORAGE_KEY = 'ro_history';
const MAX_POINTS = 8640; // 24h * 12 per jam (5 menit interval)

let history = [];
let chart = null;
let currentData = { sensor1: 0, sensor2: 0, sensor3: 0, suhu: 0 };
let historyLoaded = false;

// ---------- Load / Save ----------
function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) history = JSON.parse(raw);
  } catch (e) { history = []; }
}
function saveHistory() {
  try {
    if (history.length > MAX_POINTS) history = history.slice(-MAX_POINTS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch (e) {}
}

// ---------- Add point (only if 5 minutes passed) ----------
let lastSaveTime = 0;
function addDataPoint(s1, s2, s3, temp) {
  const now = Date.now();
  if (now - lastSaveTime < 300000) return; // 5 menit
  lastSaveTime = now;
  const d = new Date();
  const startDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0,0,0);
  if (d < startDay) return;
  history.push({ timestamp: now, s1, s2, s3, suhu: temp });
  saveHistory();
  updateRecordCount();
}

// ---------- Clear ----------
function clearHistory() {
  if (confirm('Clear all stored data?')) {
    history = [];
    saveHistory();
    updateChart();
    updateRecordCount();
  }
}

// ============================================================
// FETCH DATA FROM FIREBASE (REAL-TIME, 2 detik)
// ============================================================
function fetchFirebaseData() {
  const url = firebaseConfig.databaseURL + '/sensor/data.json';
  fetch(url)
    .then(res => res.ok ? res.json() : Promise.reject('HTTP ' + res.status))
    .then(data => {
      if (data) {
        currentData.sensor1 = data.sensor1 || 0;
        currentData.sensor2 = data.sensor2 || 0;
        currentData.sensor3 = data.sensor3 || 0;
        currentData.suhu = data.suhu || 0;
        updateUI();
        addDataPoint(currentData.sensor1, currentData.sensor2, currentData.sensor3, currentData.suhu);
        updateChart();
        document.getElementById('lastUpdate').innerText = new Date().toLocaleTimeString();
      }
    })
    .catch(err => {
      console.warn('Firebase real-time error:', err);
      document.getElementById('lastUpdate').innerText = '⚠️ Offline';
    });
}

// ============================================================
// FETCH HISTORY (untuk grafik 24 jam, diambil setiap 5 menit)
// ============================================================
function fetchHistory() {
  const url = firebaseConfig.databaseURL + '/history.json';
  fetch(url)
    .then(res => res.ok ? res.json() : Promise.reject('HTTP ' + res.status))
    .then(data => {
      if (data) {
        // Convert object to array
        const points = Object.values(data);
        // Sort by timestamp
        points.sort((a, b) => a.timestamp - b.timestamp);
        // Replace history with fetched data
        history = points;
        saveHistory();
        updateChart();
        updateRecordCount();
        historyLoaded = true;
      }
    })
    .catch(err => console.warn('History fetch error:', err));
}

// ============================================================
// UPDATE UI
// ============================================================
function updateUI() {
  const s = [currentData.sensor1, currentData.sensor2, currentData.sensor3];
  s.forEach((dist, i) => {
    const level = Math.max(0, TANKS[i].height - dist);
    const pct = Math.min(100, (level / TANKS[i].height) * 100);
    const vol = (level / TANKS[i].height) * TANKS[i].capacity;
    const id = i + 1;
    document.getElementById(`level${id}`).innerText = level.toFixed(1);
    document.getElementById(`vol${id}`).innerText = Math.round(vol);
    document.getElementById(`pct${id}`).innerText = Math.round(pct);
    document.getElementById(`water${id}`).style.height = pct + '%';
  });
  const temp = currentData.suhu || 0;
  document.getElementById('tempDisplay').innerHTML = temp.toFixed(1) + ' °C';
}

function updateRecordCount() {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0,0,0);
  const count = history.filter(p => p.timestamp >= start.getTime()).length;
  document.getElementById('recordCount').innerText = count;
}

// ============================================================
// CHART
// ============================================================
function initChart() {
  const ctx = document.getElementById('tempChart').getContext('2d');
  chart = new Chart(ctx, {
    type: 'line',
    data: { labels: [], datasets: [{ label: 'Temperature (°C)', data: [], borderColor: '#e67e22', backgroundColor: 'rgba(230,126,34,0.05)', tension: 0.2, fill: true, pointRadius: 2 }] },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { display: false } },
      scales: { y: { min: 0, max: 50, title: { display: true, text: '°C' } }, x: { title: { display: true, text: 'Time' } } }
    }
  });
}
function updateChart() {
  if (!chart) return;
  const points = history.slice(-100);
  const labels = points.map(p => new Date(p.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}));
  const data = points.map(p => p.suhu);
  chart.data.labels = labels;
  chart.data.datasets[0].data = data;
  chart.update();
}

// ============================================================
// EXPORT EXCEL (full day data)
// ============================================================
function exportExcel() {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0,0,0);
  const dayData = history.filter(p => p.timestamp >= start.getTime());
  if (!dayData.length) { alert('No data today yet.'); return; }
  const rows = [['Timestamp','Sensor1 (cm)','Sensor2 (cm)','Sensor3 (cm)','Temperature (°C)']];
  dayData.forEach(p => {
    rows.push([new Date(p.timestamp).toLocaleString(), p.s1, p.s2, p.s3, p.suhu]);
  });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'RO Monitoring');
  XLSX.writeFile(wb, `RO_${today.toISOString().slice(0,10)}.xlsx`);
}

// ============================================================
// THEME TOGGLE
// ============================================================
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  const icon = document.querySelector('#themeToggle i');
  icon.className = isDark ? 'fas fa-moon' : 'fas fa-sun';
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
  loadHistory();
  initChart();
  updateChart();
  updateRecordCount();

  // First fetch real-time data
  fetchFirebaseData();
  // Fetch history for chart
  fetchHistory();

  // Refresh real-time every 2 seconds
  setInterval(fetchFirebaseData, 2000);
  // Refresh history every 5 minutes (to sync with ESP32 history interval)
  setInterval(fetchHistory, 300000);

  // Event listeners
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);
  document.getElementById('exportExcel').addEventListener('click', exportExcel);
  document.getElementById('refreshBtn').addEventListener('click', function() {
    fetchFirebaseData();
    fetchHistory();
  });
});