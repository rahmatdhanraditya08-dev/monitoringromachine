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

const TANKS = [
    { id: 0, capacity: 3300, height: 210 },
    { id: 1, capacity: 3300, height: 210 },
    { id: 2, capacity: 1100, height: 110 }
];

const STORAGE_KEY = 'ro_history_v2';
const DAILY_LOG_KEY = 'ro_daily_logs_v2';
const MAX_POINTS = 10000;
const TEMP_WINDOW_SIZE = 5;
const HISTORY_INTERVAL = 300000;
const WORK_START_HOUR = 7;
const WORK_END_HOUR = 17;

let history = [];
let dailyLogs = [];
let chart = null;
let currentData = { sensor1: 0, sensor2: 0, sensor3: 0, suhu: 0, suhuRaw: 0 };
let temperatureSamples = [];
let lastSaveTime = 0;
let updateInterval = 2000;
let intervalId = null;
let lastDataTimestamp = 0;

function toNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
}

function getDateKey(date = new Date()) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function average(values) {
    if (!values.length) return 0;
    const total = values.reduce((sum, item) => sum + Number(item || 0), 0);
    return total / values.length;
}

function loadHistory() {
    try {
        const rawHistory = localStorage.getItem(STORAGE_KEY);
        if (rawHistory) {
            history = JSON.parse(rawHistory);
        }
        const rawDaily = localStorage.getItem(DAILY_LOG_KEY);
        if (rawDaily) {
            dailyLogs = JSON.parse(rawDaily);
        }
        console.log(`✅ History loaded: ${history.length} points, ${dailyLogs.length} daily logs`);
    } catch (error) {
        console.error('❌ Load storage error:', error);
        history = [];
        dailyLogs = [];
    }
}

function saveHistory() {
    try {
        if (history.length > MAX_POINTS) history = history.slice(-MAX_POINTS);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch (error) {
        console.error('❌ Save history error:', error);
    }
}

function saveDailyLogs() {
    try {
        localStorage.setItem(DAILY_LOG_KEY, JSON.stringify(dailyLogs));
    } catch (error) {
        console.error('❌ Save daily logs error:', error);
    }
}

function updateRecordCount() {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
    const count = history.filter((point) => point.timestamp >= start.getTime()).length;
    document.getElementById('recordCount').innerText = count;
}

function showToast(title, message) {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<strong>${title}</strong><small>${message}</small>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3200);
}

function updateStatusIndicators() {
    const realtimeStatus = document.getElementById('realtimeStatus');
    const logStatus = document.getElementById('logStatus');
    const excelStatus = document.getElementById('excelStatus');

    if (!realtimeStatus || !logStatus || !excelStatus) return;

    if (lastDataTimestamp) {
        const delay = Date.now() - lastDataTimestamp;
        realtimeStatus.textContent = delay < 15000 ? 'Live' : 'Delay';
    } else {
        realtimeStatus.textContent = 'Menunggu';
    }

    if (dailyLogs.length) {
        logStatus.textContent = 'Siap unduh';
        excelStatus.textContent = 'Siap';
    } else {
        logStatus.textContent = 'Menunggu data';
        excelStatus.textContent = 'N/A';
    }
}

function updateUI() {
    const sensors = [currentData.sensor1, currentData.sensor2, currentData.sensor3];
    sensors.forEach((dist, index) => {
        const maxHeight = TANKS[index].height;
        const level = Math.max(0, maxHeight - dist);
        const percentage = Math.min(100, (level / maxHeight) * 100);
        const volume = (level / maxHeight) * TANKS[index].capacity;
        const id = index + 1;

        document.getElementById(`level${id}`).innerText = level.toFixed(1);
        document.getElementById(`vol${id}`).innerText = Math.round(volume);
        document.getElementById(`pct${id}`).innerText = Math.round(percentage);
        document.getElementById(`water${id}`).style.height = `${percentage}%`;
    });

    const tempValue = currentData.suhu || 0;
    document.getElementById('tempDisplay').innerHTML = `${tempValue.toFixed(1)} °C`;
    document.getElementById('lastUpdate').innerText = new Date().toLocaleTimeString();
    updateStatusIndicators();
}

function updateChart() {
    if (!chart) return;

    const points = history.slice(-100);
    chart.data.labels = points.map((point) => new Date(point.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    chart.data.datasets[0].data = points.map((point) => Number(point.suhu || 0));
    chart.update();
}

function initChart() {
    const ctx = document.getElementById('tempChart').getContext('2d');
    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Temperature (°C)',
                data: [],
                borderColor: '#f59e0b',
                backgroundColor: 'rgba(245,158,11,0.08)',
                tension: 0.28,
                fill: true,
                pointRadius: 2,
                pointHoverRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: { legend: { display: false } },
            scales: {
                y: { min: 0, max: 60, title: { display: true, text: '°C' } },
                x: { title: { display: true, text: 'Time' } }
            }
        }
    });
}

function addDataPoint(sensor1, sensor2, sensor3, rawTemp) {
    const now = Date.now();
    const tempValue = toNumber(rawTemp);

    temperatureSamples.push(tempValue);
    if (temperatureSamples.length > TEMP_WINDOW_SIZE) {
        temperatureSamples.shift();
    }

    const avgTemp = average(temperatureSamples);
    currentData.sensor1 = toNumber(sensor1);
    currentData.sensor2 = toNumber(sensor2);
    currentData.sensor3 = toNumber(sensor3);
    currentData.suhuRaw = tempValue;
    currentData.suhu = avgTemp;

    updateUI();

    const shouldLogHistory = now - lastSaveTime >= HISTORY_INTERVAL || history.length === 0;
    if (shouldLogHistory) {
        lastSaveTime = now;
        history.push({
            timestamp: now,
            s1: currentData.sensor1,
            s2: currentData.sensor2,
            s3: currentData.sensor3,
            suhu: avgTemp,
            suhuRaw: tempValue
        });
        saveHistory();
        updateRecordCount();
        updateChart();
        addDailyLogEntry(currentData.sensor1, currentData.sensor2, currentData.sensor3, avgTemp, now);
        lastDataTimestamp = now;
        showToast('Data terbaru masuk', `Terakhir update: ${new Date(now).toLocaleTimeString()}`);
    }
}

function addDailyLogEntry(sensor1, sensor2, sensor3, tempValue, timestamp = Date.now()) {
    const time = new Date(timestamp);
    const hour = time.getHours();

    if (hour < WORK_START_HOUR || hour >= WORK_END_HOUR) {
        return;
    }

    const dateKey = getDateKey(time);
    const existingDay = dailyLogs.filter((log) => log.dateKey === dateKey);
    const lastLog = existingDay[existingDay.length - 1];

    if (lastLog && timestamp - lastLog.timestamp < HISTORY_INTERVAL - 1000) {
        return;
    }

    dailyLogs.push({
        id: `${dateKey}-${timestamp}`,
        dateKey,
        timestamp,
        sensor1: toNumber(sensor1),
        sensor2: toNumber(sensor2),
        sensor3: toNumber(sensor3),
        suhu: Number(tempValue || 0)
    });

    saveDailyLogs();
    renderDailyLogTable();
    updateStatusIndicators();
    showToast('Log 5 menit siap', `Log ${dateKey} tersimpan dan siap diunduh.`);
}

function getDailySummary(dateKey) {
    const filters = dailyLogs.filter((log) => log.dateKey === dateKey);
    if (!filters.length) return null;

    const temps = filters.map((log) => Number(log.suhu || 0));
    return {
        dateKey,
        total: filters.length,
        avgTemp: average(temps),
        start: new Date(filters[0].timestamp),
        end: new Date(filters[filters.length - 1].timestamp)
    };
}

function renderDailyLogTable() {
    const tableBody = document.getElementById('dailyLogTableBody');
    if (!tableBody) return;

    const uniqueDays = [...new Set(dailyLogs.map((log) => log.dateKey))].sort((a, b) => a.localeCompare(b));

    if (!uniqueDays.length) {
        tableBody.innerHTML = '<tr><td colspan="6" class="empty-state">Belum ada log harian.</td></tr>';
        return;
    }

    const rowsHtml = uniqueDays.map((dateKey) => {
        const summary = getDailySummary(dateKey);
        if (!summary) return '';

        return `
            <tr>
                <td>${summary.dateKey}</td>
                <td>${summary.total}</td>
                <td>${summary.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                <td>${summary.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                <td>${summary.avgTemp.toFixed(1)} °C</td>
                <td><button class="log-download-btn" data-date="${summary.dateKey}">Download</button></td>
            </tr>
        `;
    }).join('');

    tableBody.innerHTML = rowsHtml;
    updateStatusIndicators();

    tableBody.querySelectorAll('.log-download-btn').forEach((button) => {
        button.addEventListener('click', () => exportDailyLog(button.dataset.date));
    });
}

function exportDailyLog(dateKey) {
    const filtered = dailyLogs.filter((log) => log.dateKey === dateKey);
    if (!filtered.length) {
        alert('Tidak ada data untuk tanggal tersebut.');
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
    filtered.forEach((log) => {
        const row = [new Date(log.timestamp).toLocaleString()];
        const tankValues = [log.sensor1, log.sensor2, log.sensor3];

        tankValues.forEach((dist, index) => {
            const maxHeight = TANKS[index].height;
            const level = Math.max(0, maxHeight - dist);
            const pct = (level / maxHeight) * 100;
            const vol = (level / maxHeight) * TANKS[index].capacity;
            row.push(dist.toFixed(1), level.toFixed(1), vol.toFixed(1), pct.toFixed(1));
        });

        row.push(Number(log.suhu || 0).toFixed(1));
        rows.push(row);
    });

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, `RO_${dateKey}`);
    XLSX.writeFile(workbook, `RO_Log_${dateKey}.xlsx`);
}

function exportExcel() {
    const todayKey = getDateKey();
    const dayData = history.filter((point) => getDateKey(new Date(point.timestamp)) === todayKey);

    if (!dayData.length) {
        alert('Belum ada data hari ini. Tunggu beberapa menit hingga data muncul.');
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
    dayData.forEach((point) => {
        const row = [new Date(point.timestamp).toLocaleString()];
        const values = [point.s1, point.s2, point.s3];

        values.forEach((dist, index) => {
            const maxHeight = TANKS[index].height;
            const level = Math.max(0, maxHeight - dist);
            const pct = (level / maxHeight) * 100;
            const vol = (level / maxHeight) * TANKS[index].capacity;
            row.push(dist.toFixed(1), level.toFixed(1), vol.toFixed(1), pct.toFixed(1));
        });

        row.push(Number(point.suhu || 0).toFixed(1));
        rows.push(row);
    });

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'RO Monitoring');
    XLSX.writeFile(workbook, `RO_${todayKey}.xlsx`);
}

function fetchFirebaseData() {
    const cacheBuster = Date.now();
    const url = `${firebaseConfig.databaseURL}/sensor/data.json?_t=${cacheBuster}`;

    fetch(url, {
        cache: 'no-cache',
        headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        }
    })
    .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    })
    .then((data) => {
        if (!data) {
            throw new Error('Firebase returned empty data');
        }

        const sensor1 = Number(data.sensor1 || 0);
        const sensor2 = Number(data.sensor2 || 0);
        const sensor3 = Number(data.sensor3 || 0);
        const suhu = Number(data.suhu || 0);

        lastDataTimestamp = Date.now();
        addDataPoint(sensor1, sensor2, sensor3, suhu);
        console.log('✅ Firebase data updated:', { sensor1, sensor2, sensor3, suhu });
    })
    .catch((error) => {
        console.warn('⚠️ Firebase error:', error.message);
        document.getElementById('lastUpdate').innerText = 'Offline';
        const realtimeStatus = document.getElementById('realtimeStatus');
        if (realtimeStatus) realtimeStatus.textContent = 'Offline';
    });
}

function seedDummyData() {
    if (history.length > 0) {
        return;
    }

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    let ts = start.getTime();
    const now = Date.now();
    let count = 0;

    while (ts <= now) {
        const s1 = 110 + Math.random() * 40;
        const s2 = 100 + Math.random() * 50;
        const s3 = 60 + Math.random() * 30;
        const suhu = 24 + Math.random() * 8;

        history.push({
            timestamp: ts,
            s1,
            s2,
            s3,
            suhu,
            suhuRaw: suhu
        });

        if (new Date(ts).getHours() >= WORK_START_HOUR && new Date(ts).getHours() < WORK_END_HOUR) {
            addDailyLogEntry(s1, s2, s3, suhu, ts);
        }

        ts += HISTORY_INTERVAL;
        count += 1;
    }

    saveHistory();
    saveDailyLogs();
    updateRecordCount();
    updateChart();
    renderDailyLogTable();
    console.log(`🌱 Seeded ${count} dummy points.`);
}

function toggleTheme() {
    const html = document.documentElement;
    const isDark = html.getAttribute('data-theme') === 'dark';
    html.setAttribute('data-theme', isDark ? 'light' : 'dark');
    const icon = document.querySelector('#themeToggle i');
    icon.className = isDark ? 'fas fa-moon' : 'fas fa-sun';
}

function startAutoUpdate() {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }

    fetchFirebaseData();
    intervalId = setInterval(fetchFirebaseData, updateInterval);

    let display = updateInterval >= 60000 ? `${updateInterval / 60000} menit` : `${updateInterval / 1000} detik`;
    document.getElementById('currentInterval').innerText = display.includes('menit') ? display.replace(' menit', '') : display.replace(' detik', '');
}

function downloadTodayLog() {
    const todayKey = getDateKey();
    exportDailyLog(todayKey);
}

function downloadAllLogs() {
    const uniqueDays = [...new Set(dailyLogs.map((log) => log.dateKey))].sort((a, b) => a.localeCompare(b));
    if (!uniqueDays.length) {
        alert('Belum ada log untuk di-download.');
        return;
    }

    const rows = [
        [
            'Tanggal',
            'Timestamp',
            'T1 Jarak (cm)', 'T1 Level (cm)', 'T1 Volume (L)', 'T1 %',
            'T2 Jarak (cm)', 'T2 Level (cm)', 'T2 Volume (L)', 'T2 %',
            'T3 Jarak (cm)', 'T3 Level (cm)', 'T3 Volume (L)', 'T3 %',
            'Temperature (°C)'
        ]
    ];

    uniqueDays.forEach((dateKey) => {
        dailyLogs.filter((log) => log.dateKey === dateKey).forEach((log) => {
            const row = [dateKey, new Date(log.timestamp).toLocaleString()];
            const values = [log.sensor1, log.sensor2, log.sensor3];
            values.forEach((dist, index) => {
                const maxHeight = TANKS[index].height;
                const level = Math.max(0, maxHeight - dist);
                const pct = (level / maxHeight) * 100;
                const vol = (level / maxHeight) * TANKS[index].capacity;
                row.push(dist.toFixed(1), level.toFixed(1), vol.toFixed(1), pct.toFixed(1));
            });
            row.push(Number(log.suhu || 0).toFixed(1));
            rows.push(row);
        });
    });

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'RO_All_Logs');
    XLSX.writeFile(workbook, 'RO_All_Logs.xlsx');
}

window.addEventListener('DOMContentLoaded', () => {
    loadHistory();
    initChart();

    if (history.length === 0) {
        seedDummyData();
    }

    renderDailyLogTable();
    updateRecordCount();
    updateChart();
    updateStatusIndicators();

    const select = document.getElementById('intervalSelect');
    if (select) {
        updateInterval = Number(select.value) || 2000;
        startAutoUpdate();

        select.addEventListener('change', (event) => {
            updateInterval = Number(event.target.value) || 2000;
            startAutoUpdate();
            const display = updateInterval >= 60000 ? `${updateInterval / 60000} menit` : `${updateInterval / 1000} detik`;
            document.getElementById('currentInterval').innerText = display;
        });
    }

    setInterval(updateStatusIndicators, 5000);

    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
    const aboutProjectModal = document.getElementById('aboutProjectModal');
    const openAboutProject = () => {
        aboutProjectModal.classList.add('is-open');
        aboutProjectModal.setAttribute('aria-hidden', 'false');
        document.getElementById('closeAboutProject').focus();
    };
    const closeAboutProject = () => {
        aboutProjectModal.classList.remove('is-open');
        aboutProjectModal.setAttribute('aria-hidden', 'true');
    };
    document.getElementById('aboutProjectBtn').addEventListener('click', openAboutProject);
    document.getElementById('closeAboutProject').addEventListener('click', closeAboutProject);
    aboutProjectModal.addEventListener('click', (event) => {
        if (event.target.matches('[data-close-about]')) closeAboutProject();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && aboutProjectModal.classList.contains('is-open')) closeAboutProject();
    });
    document.getElementById('exportExcel').addEventListener('click', exportExcel);
    document.getElementById('refreshBtn').addEventListener('click', fetchFirebaseData);
    document.getElementById('downloadTodayBtn').addEventListener('click', downloadTodayLog);
    document.getElementById('downloadAllBtn').addEventListener('click', downloadAllLogs);

    document.querySelector('.brand h1').addEventListener('dblclick', () => {
        if (confirm('Seed dummy data for testing?')) {
            history = [];
            dailyLogs = [];
            saveHistory();
            saveDailyLogs();
            seedDummyData();
            renderDailyLogTable();
            updateChart();
            updateRecordCount();
        }
    });
});