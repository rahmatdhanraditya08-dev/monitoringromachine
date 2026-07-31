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
// KONFIGURASI TANGKI (sesuai ukuran sebenarnya)
// ============================================================
const TANKS = [
    { id: 0, capacity: 3300, height: 210 },  // Main Tank 1
    { id: 1, capacity: 3300, height: 210 },  // Main Tank 2
    { id: 2, capacity: 1100, height: 110 }   // Primary Tank (Toren 3)
];

// ============================================================
// DATA STORAGE
// ============================================================
const STORAGE_KEY = 'ro_history';
const MAX_POINTS = 8640;
const HISTORY_INTERVAL = 300000; // 5 menit

let history = [];
let chart = null;
let currentData = { sensor1: 0, sensor2: 0, sensor3: 0, suhu: 0 };
let lastSaveTime = 0;

// ---------- Interval ----------
let updateInterval = 300000; // default 5 menit
let intervalId = null;

// ---------- Load / Save ----------
function loadHistory() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            history = JSON.parse(raw);
            console.log(`✅ History loaded: ${history.length} points`);
        } else {
            console.log('ℹ️ No history found in localStorage.');
        }
    } catch (e) {
        console.error('❌ Load history error:', e);
        history = [];
    }
}
function saveHistory() {
    try {
        if (history.length > MAX_POINTS) history = history.slice(-MAX_POINTS);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
        console.log(`💾 History saved: ${history.length} points`);
    } catch (e) {
        console.error('❌ Save history error:', e);
    }
}

// ---------- Add point ----------
function addDataPoint(s1, s2, s3, temp) {
    const now = Date.now();
    if (now - lastSaveTime < HISTORY_INTERVAL) return;
    lastSaveTime = now;
    const d = new Date(now);
    const startDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
    if (now < startDay.getTime()) return;
    history.push({ timestamp: now, s1, s2, s3, suhu: temp });
    saveHistory();
    updateRecordCount();
    updateChart();
    console.log(`📊 Data point added at ${new Date(now).toLocaleString()}`);
}

// ---------- Seed dummy ----------
function seedDummyData() {
    if (history.length > 0) {
        console.log('History already has data, skipping seed.');
        return;
    }
    console.log('🌱 Seeding dummy data...');
    const now = Date.now();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    let ts = start.getTime();
    let count = 0;
    while (ts < now) {
        const s1 = 80 + Math.random() * 40;
        const s2 = 70 + Math.random() * 50;
        const s3 = 50 + Math.random() * 30;
        const temp = 25 + Math.random() * 8;
        history.push({ timestamp: ts, s1, s2, s3, suhu: temp });
        ts += HISTORY_INTERVAL;
        count++;
    }
    saveHistory();
    updateRecordCount();
    updateChart();
    console.log(`✅ Seeded ${count} dummy points.`);
}

// ============================================================
// FETCH DATA FROM FIREBASE
// ============================================================
function fetchFirebaseData() {
    const url = firebaseConfig.databaseURL + '/sensor/data.json';
    console.log('🔄 Fetching from Firebase at', new Date().toLocaleTimeString());
    fetch(url)
        .then(res => {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        })
        .then(data => {
            if (data) {
                currentData.sensor1 = data.sensor1 || 0;
                currentData.sensor2 = data.sensor2 || 0;
                currentData.sensor3 = data.sensor3 || 0;
                currentData.suhu = data.suhu || 0;
                updateUI();
                addDataPoint(currentData.sensor1, currentData.sensor2, currentData.sensor3, currentData.suhu);
                document.getElementById('lastUpdate').innerText = new Date().toLocaleTimeString();
                console.log('✅ Firebase data updated:', currentData);
            } else {
                console.warn('⚠️ Firebase returned empty data.');
            }
        })
        .catch(err => {
            console.warn('⚠️ Firebase error:', err.message);
            document.getElementById('lastUpdate').innerText = '⚠️ Offline';
        });
}

// ============================================================
// UPDATE UI
// ============================================================
function updateUI() {
    const s = [currentData.sensor1, currentData.sensor2, currentData.sensor3];
    s.forEach((dist, i) => {
        const maxH = TANKS[i].height;
        const level = Math.max(0, maxH - dist);
        const pct = Math.min(100, (level / maxH) * 100);
        const vol = (level / maxH) * TANKS[i].capacity;
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
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
    const count = history.filter(p => p.timestamp >= start.getTime()).length;
    document.getElementById('recordCount').innerText = count;
    console.log(`📋 Records today: ${count}`);
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
    console.log('📈 Chart initialized.');
}
function updateChart() {
    if (!chart) return;
    const points = history.slice(-100);
    const labels = points.map(p => new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    const data = points.map(p => p.suhu);
    chart.data.labels = labels;
    chart.data.datasets[0].data = data;
    chart.update();
}

// ============================================================
// EXPORT EXCEL (LENGKAP)
// ============================================================
function exportExcel() {
    console.log('📤 Export Excel called. History length:', history.length);
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
    const dayData = history.filter(p => p.timestamp >= start.getTime());
    console.log('📊 Today data points:', dayData.length);

    if (!dayData.length) {
        const msg = `No data today yet. History total: ${history.length} points.\n\nTry:\n1. Wait 5 minutes for data collection\n2. Click "Refresh Data"\n3. Double-click the title to seed dummy data`;
        alert(msg);
        return;
    }

    const headers = [
        'Timestamp',
        'T1 Jarak (cm)', 'T1 Level (cm)', 'T1 Volume (L)', 'T1 %',
        'T2 Jarak (cm)', 'T2 Level (cm)', 'T2 Volume (L)', 'T2 %',
        'T3 Jarak (cm)', 'T3 Level (cm)', 'T3 Volume (L)', 'T3 %',
        'Temperature (°C)'
    ];

    const rows = [headers];

    dayData.forEach(p => {
        const row = [new Date(p.timestamp).toLocaleString()];
        const jarak = [p.s1, p.s2, p.s3];
        for (let i = 0; i < 3; i++) {
            const dist = jarak[i] || 0;
            const maxH = TANKS[i].height;
            const level = Math.max(0, maxH - dist);
            const pct = (level / maxH) * 100;
            const vol = (level / maxH) * TANKS[i].capacity;
            row.push(
                dist.toFixed(1),
                level.toFixed(1),
                vol.toFixed(1),
                pct.toFixed(1)
            );
        }
        row.push(p.suhu.toFixed(1));
        rows.push(row);
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'RO Monitoring');
    XLSX.writeFile(wb, `RO_${today.toISOString().slice(0, 10)}.xlsx`);
    console.log('✅ Excel exported successfully.');
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
// INTERVAL CONTROL (FIXED)
// ============================================================
function startAutoUpdate() {
    // Hentikan interval lama jika ada
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        console.log('🛑 Old interval stopped.');
    }
    
    console.log(`🔄 Starting auto-update with interval: ${updateInterval/1000} detik`);
    
    // Jalankan fetch pertama kali segera
    fetchFirebaseData();
    
    // Set interval baru
    intervalId = setInterval(function() {
        console.log(`⏰ Auto-update trigger at ${new Date().toLocaleTimeString()}`);
        fetchFirebaseData();
    }, updateInterval);
    
    // Tampilkan interval di UI
    let display = '';
    if (updateInterval >= 60000) {
        display = (updateInterval / 60000) + ' menit';
    } else {
        display = (updateInterval / 1000) + ' detik';
    }
    document.getElementById('currentInterval').innerText = display;
    console.log(`✅ Auto-update running: every ${display}`);
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Dashboard initializing...');

    loadHistory();
    initChart();

    if (history.length === 0) {
        seedDummyData();
    }

    updateChart();
    updateRecordCount();

    // ===== SETUP INTERVAL DARI DROPDOWN =====
    const select = document.getElementById('intervalSelect');
    if (select) {
        // Set default dari dropdown
        updateInterval = parseInt(select.value) || 300000;
        console.log(`📌 Default interval from dropdown: ${updateInterval/1000} detik`);
        
        // Start auto-update
        startAutoUpdate();
        
        // Event listener perubahan dropdown
        select.addEventListener('change', function() {
            updateInterval = parseInt(this.value);
            console.log(`📌 Interval changed to: ${updateInterval/1000} detik`);
            startAutoUpdate(); // restart dengan interval baru
            let display = '';
            if (updateInterval >= 60000) {
                display = (updateInterval / 60000) + ' menit';
            } else {
                display = (updateInterval / 1000) + ' detik';
            }
            alert(`Interval update diubah menjadi ${display}.`);
        });
    } else {
        // Fallback jika tidak ada dropdown
        console.warn('⚠️ Dropdown interval tidak ditemukan, pakai default 5 menit');
        updateInterval = 300000;
        startAutoUpdate();
    }

    // Event listeners tombol
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
    document.getElementById('exportExcel').addEventListener('click', exportExcel);
    document.getElementById('refreshBtn').addEventListener('click', function() {
        console.log('🔄 Manual refresh triggered.');
        fetchFirebaseData();
    });

    // Double-click title to seed dummy
    const title = document.querySelector('.brand h1');
    if (title) {
        title.addEventListener('dblclick', function() {
            if (confirm('Seed dummy data for testing?')) {
                if (history.length > 0 && confirm('Clear existing history first?')) {
                    history = [];
                }
                seedDummyData();
                updateChart();
                updateRecordCount();
                alert(`✅ Seeded ${history.length} dummy points. Try export Excel now.`);
            }
        });
        console.log('💡 Double-click the title to seed dummy data.');
    }

    console.log(`✅ Dashboard ready. History: ${history.length} points.`);
    console.log(`✅ Auto-update running every ${updateInterval/1000} detik.`);
});