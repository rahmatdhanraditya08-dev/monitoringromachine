// ============================================================
// FIREBASE CONFIG
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
const MAX_POINTS = 8640;
const HISTORY_INTERVAL = 300000; // 5 menit

let history = [];
let chart = null;
let currentData = { sensor1: 0, sensor2: 0, sensor3: 0, suhu: 0 };
let lastSaveTime = 0;

// ---------- Load / Save ----------
function loadHistory() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            history = JSON.parse(raw);
            console.log(`History loaded: ${history.length} points`);
        } else {
            console.log('No history found in localStorage.');
        }
    } catch (e) {
        console.error('Load history error:', e);
        history = [];
    }
}
function saveHistory() {
    try {
        if (history.length > MAX_POINTS) history = history.slice(-MAX_POINTS);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
        console.log(`History saved: ${history.length} points`);
    } catch (e) {
        console.error('Save history error:', e);
    }
}

// ---------- Add point (only if 5 minutes passed) ----------
function addDataPoint(s1, s2, s3, temp) {
    const now = Date.now();
    if (now - lastSaveTime < HISTORY_INTERVAL) return;
    lastSaveTime = now;
    const d = new Date(now);
    const startDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0,0,0);
    if (now < startDay.getTime()) return;
    history.push({ timestamp: now, s1, s2, s3, suhu: temp });
    saveHistory();
    updateRecordCount();
    updateChart();
    console.log(`Data point added at ${new Date(now).toLocaleString()}`);
}

// ---------- Seed dummy data for testing (only if history empty) ----------
function seedDummyData() {
    if (history.length > 0) {
        console.log('History already has data, skipping seed.');
        return;
    }
    console.log('Seeding dummy data for testing...');
    const now = Date.now();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    let ts = start.getTime();
    while (ts < now) {
        const s1 = 80 + Math.random() * 40;   // 80-120 cm
        const s2 = 70 + Math.random() * 50;
        const s3 = 50 + Math.random() * 30;
        const temp = 25 + Math.random() * 8;
        history.push({ timestamp: ts, s1, s2, s3, suhu: temp });
        ts += HISTORY_INTERVAL;
    }
    saveHistory();
    updateRecordCount();
    updateChart();
    console.log(`Seeded ${history.length} dummy points.`);
}

// ---------- Clear ----------
function clearHistory() {
    if (confirm('Clear all stored data?')) {
        history = [];
        saveHistory();
        updateChart();
        updateRecordCount();
        console.log('History cleared.');
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
                document.getElementById('lastUpdate').innerText = new Date().toLocaleTimeString();
                console.log('Firebase data updated:', currentData);
            }
        })
        .catch(err => {
            console.warn('Firebase real-time error:', err);
            document.getElementById('lastUpdate').innerText = '⚠️ Offline';
        });
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
            scales: {
                y: { min: 0, max: 50, title: { display: true, text: '°C' } },
                x: { title: { display: true, text: 'Time' } }
            }
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
    console.log('Export Excel called. History length:', history.length);
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0,0,0);
    const dayData = history.filter(p => p.timestamp >= start.getTime());
    console.log('Today data points:', dayData.length);
    if (!dayData.length) {
        alert('No data today yet.\n\nIf you just opened the page, wait for 5 minutes or click "Refresh Data" to fetch from Firebase.\nYou can also click "Seed Dummy Data" to test Excel export.');
        return;
    }
    const rows = [['Timestamp','Sensor1 (cm)','Sensor2 (cm)','Sensor3 (cm)','Temperature (°C)']];
    dayData.forEach(p => {
        rows.push([new Date(p.timestamp).toLocaleString(), p.s1, p.s2, p.s3, p.suhu]);
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'RO Monitoring');
    XLSX.writeFile(wb, `RO_${today.toISOString().slice(0,10)}.xlsx`);
    console.log('Excel exported successfully.');
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

    // Jika history kosong, seed dummy data agar Excel bisa diuji
    if (history.length === 0) {
        seedDummyData();
    }

    // First fetch real-time data
    fetchFirebaseData();

    // Refresh real-time every 2 seconds
    setInterval(fetchFirebaseData, 2000);

    // Event listeners
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
    document.getElementById('exportExcel').addEventListener('click', exportExcel);
    document.getElementById('refreshBtn').addEventListener('click', function() {
        fetchFirebaseData();
    });

    // Tambahkan tombol rahasia: klik 2 kali judul untuk seed dummy data
    const title = document.querySelector('.brand h1');
    if (title) {
        title.addEventListener('dblclick', function() {
            if (confirm('Seed dummy data for testing?')) {
                seedDummyData();
                updateChart();
                updateRecordCount();
            }
        });
    }

    console.log('Dashboard initialized. History length:', history.length);
});