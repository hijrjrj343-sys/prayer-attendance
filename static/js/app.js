/* ═══════════════════════════════════════════════════════════════
   Prayer Attendance System - Main Application
   ═══════════════════════════════════════════════════════════════ */

const API = '';
let currentPage = 'dashboard';
let html5QrCode = null;
let isScanning = false;
let charts = {};
let recentScans = [];

// ─── Initialize ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initClock();
    loadDashboard();
    initEventListeners();
});

// ─── Navigation ────────────────────────────────────────────────
function initNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            navigateTo(page);
        });
    });
}

function navigateTo(page) {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.querySelector(`[data-page="${page}"]`).classList.add('active');

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${page}`).classList.add('active');

    const titles = {
        dashboard: 'الرئيسية',
        scanner: 'مسح الباركود',
        students: 'الطلبة',
        attendance: 'سجل الحضور',
        reports: 'التقارير',
        settings: 'الإعدادات'
    };
    document.getElementById('headerTitle').textContent = titles[page] || '';
    currentPage = page;

    // Close mobile sidebar
    document.getElementById('sidebar').classList.remove('open');

    // Load page data
    switch (page) {
        case 'dashboard': loadDashboard(); break;
        case 'students': loadStudents(); break;
        case 'attendance': loadAttendance(); break;
        case 'reports': loadReports(); break;
        case 'settings': loadSettings(); break;
        case 'scanner': initScanner(); break;
    }
}

// ─── Clock ─────────────────────────────────────────────────────
function initClock() {
    updateClock();
    setInterval(updateClock, 1000);
}

function updateClock() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = now.toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    document.getElementById('liveClock').textContent = timeStr;
    document.getElementById('currentTime').textContent = timeStr;

    // Determine current prayer
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const currentTime = `${hours}:${minutes}`;

    fetch(`${API}/api/prayers`)
        .then(r => r.json())
        .then(prayers => {
            let current = null;
            for (const p of prayers) {
                if (currentTime >= p.time_start && currentTime <= p.time_end) {
                    current = p;
                    break;
                }
            }
            document.getElementById('currentPrayer').textContent = current ? `الصلاة الحالية: ${current.name}` : 'لا توجد صلاة حالياً';
        })
        .catch(() => {});
}

// ─── Event Listeners ───────────────────────────────────────────
function initEventListeners() {
    // Mobile menu
    document.getElementById('mobileMenuBtn').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
    });

    // Student search
    document.getElementById('studentSearch')?.addEventListener('input', debounce(loadStudents, 300));

    // Attendance filters
    document.getElementById('attendanceDate')?.addEventListener('change', loadAttendance);
    document.getElementById('attendancePrayer')?.addEventListener('change', loadAttendance);

    // Tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            loadAttendance();
        });
    });

    // Scanner buttons
    document.getElementById('startScanBtn')?.addEventListener('click', startScanner);
    document.getElementById('stopScanBtn')?.addEventListener('click', stopScanner);

    // Manual barcode
    document.getElementById('manualSubmit')?.addEventListener('click', () => {
        const barcode = document.getElementById('manualBarcode').value.trim();
        if (barcode) {
            recordAttendance(barcode);
            document.getElementById('manualBarcode').value = '';
        }
    });

    document.getElementById('manualBarcode')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('manualSubmit').click();
        }
    });

    // Student buttons
    document.getElementById('addStudentBtn')?.addEventListener('click', () => showStudentModal());
    document.getElementById('importStudentsBtn')?.addEventListener('click', () => {
        document.getElementById('importFileInput').click();
    });
    document.getElementById('importFileInput')?.addEventListener('change', handleImport);

    // Prayer button
    document.getElementById('addPrayerBtn')?.addEventListener('click', () => showPrayerModal());

    // Export buttons
    document.getElementById('exportPdfBtn')?.addEventListener('click', exportPDF);
    document.getElementById('exportExcelBtn')?.addEventListener('click', exportExcel);

    // Settings buttons
    document.getElementById('clearAttendanceBtn')?.addEventListener('click', clearAttendance);
    document.getElementById('backupDbBtn')?.addEventListener('click', backupDatabase);

    // Modal close
    document.getElementById('modalClose')?.addEventListener('click', closeModal);
    document.getElementById('modalOverlay')?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeModal();
    });

    // Close sidebar on outside click (mobile)
    document.addEventListener('click', (e) => {
        const sidebar = document.getElementById('sidebar');
        const menuBtn = document.getElementById('mobileMenuBtn');
        if (!sidebar.contains(e.target) && !menuBtn.contains(e.target)) {
            sidebar.classList.remove('open');
        }
    });
}

// ─── Dashboard ─────────────────────────────────────────────────
async function loadDashboard() {
    try {
        const [statsRes, attendanceRes] = await Promise.all([
            fetch(`${API}/api/stats/daily`),
            fetch(`${API}/api/attendance`)
        ]);

        const stats = await statsRes.json();
        const attendance = await attendanceRes.json();

        document.getElementById('totalStudents').textContent = stats.total_students;

        // Calculate today's stats
        const uniquePresent = new Set(attendance.map(a => a.student_id));
        const presentCount = uniquePresent.size;
        const absentCount = Math.max(0, stats.total_students - presentCount);
        const rate = stats.total_students > 0 ? Math.round(presentCount / stats.total_students * 100) : 0;

        document.getElementById('todayPresent').textContent = presentCount;
        document.getElementById('todayAbsent').textContent = absentCount;
        document.getElementById('attendanceRate').textContent = rate + '%';

        // Dashboard chart
        renderDashboardChart(stats.prayers);

        // Prayers list
        renderDashboardPrayers(stats.prayers);

        // Recent attendance
        renderRecentAttendance(attendance.slice(0, 10));

    } catch (err) {
        console.error('Dashboard error:', err);
    }
}

function renderDashboardChart(prayers) {
    const ctx = document.getElementById('dashboardChart');
    if (!ctx) return;

    if (charts.dashboard) charts.dashboard.destroy();

    charts.dashboard = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: prayers.map(p => p.prayer_name),
            datasets: [{
                data: prayers.map(p => p.count),
                backgroundColor: ['#2da44e', '#0969da', '#bf8700', '#cf222e', '#8250df'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { font: { family: 'Cairo' } }
                }
            }
        }
    });
}

function renderDashboardPrayers(prayers) {
    const container = document.getElementById('dashboardPrayers');
    if (!container) return;

    container.innerHTML = prayers.map(p => `
        <div class="prayer-item">
            <span class="prayer-name"><i class="fas fa-mosque"></i> ${p.prayer_name}</span>
            <span class="prayer-time">${p.time_start} - ${p.time_end}</span>
            <span class="prayer-count">${p.count}/${p.total}</span>
        </div>
    `).join('');
}

function renderRecentAttendance(attendance) {
    const tbody = document.getElementById('recentAttendance');
    if (!tbody) return;

    if (attendance.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-state"><p>لا توجد سجلات بعد</p></td></tr>';
        return;
    }

    tbody.innerHTML = attendance.map((a, i) => `
        <tr>
            <td>${a.student_name}</td>
            <td>${a.grade || '-'}</td>
            <td><span class="badge badge-success">${a.prayer_name}</span></td>
            <td>${new Date(a.scan_time).toLocaleTimeString('ar-SA', {hour: '2-digit', minute: '2-digit'})}</td>
        </tr>
    `).join('');
}

// ─── Scanner ───────────────────────────────────────────────────
function initScanner() {
    if (html5QrCode) {
        html5QrCode.clear();
        html5QrCode = null;
    }
    isScanning = false;
    document.getElementById('startScanBtn').style.display = '';
    document.getElementById('stopScanBtn').style.display = 'none';
    document.getElementById('scannerStatus').innerHTML = '<i class="fas fa-camera"></i><span>اضغط لبدء المسح</span>';
}

async function startScanner() {
    try {
        document.getElementById('scannerStatus').innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>جاري تهيئة الكاميرا...</span>';

        html5QrCode = new Html5Qrcode("qr-reader");

        await html5QrCode.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 150 } },
            onScanSuccess,
            () => {}
        );

        isScanning = true;
        document.getElementById('startScanBtn').style.display = 'none';
        document.getElementById('stopScanBtn').style.display = '';
        document.getElementById('scannerStatus').innerHTML = '<i class="fas fa-camera" style="color:var(--primary)"></i><span style="color:var(--primary)">جاري المسح... وجّه الكاميرا نحو الباركود</span>';

    } catch (err) {
        console.error('Scanner error:', err);
        document.getElementById('scannerStatus').innerHTML = '<i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><span style="color:var(--danger)">فشل في تشغيل الكاميرا. تحقق من الأذونات.</span>';
        showToast('فشل في تشغيل الكاميرا', 'error');
    }
}

async function stopScanner() {
    if (html5QrCode && isScanning) {
        try {
            await html5QrCode.stop();
        } catch (e) {}
        isScanning = false;
        document.getElementById('startScanBtn').style.display = '';
        document.getElementById('stopScanBtn').style.display = 'none';
        document.getElementById('scannerStatus').innerHTML = '<i class="fas fa-camera"></i><span>اضغط لبدء المسح</span>';
    }
}

async function onScanSuccess(decodedText) {
    // Play sound
    try { document.getElementById('scanSound').play(); } catch (e) {}

    await recordAttendance(decodedText);
}

async function recordAttendance(barcode) {
    try {
        const res = await fetch(`${API}/api/attendance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ barcode })
        });

        const data = await res.json();

        if (data.success) {
            showScanResult(data);
            showToast(`تم تسجيل حضور ${data.student.name} - ${data.prayer.name}`, 'success');
            addToRecentScans(data);
        } else {
            showScanError(data.error);
            showToast(data.error, 'error');
        }
    } catch (err) {
        showScanError('خطأ في الاتصال بالخادم');
        showToast('خطأ في الاتصال', 'error');
    }
}

function showScanResult(data) {
    const resultDiv = document.getElementById('scanResult');
    const errorDiv = document.getElementById('scanError');

    errorDiv.style.display = 'none';
    resultDiv.style.display = 'block';

    document.getElementById('resultName').textContent = data.student.name;
    document.getElementById('resultPrayer').innerHTML = `<i class="fas fa-mosque"></i> ${data.prayer.name}`;
    document.getElementById('resultTime').innerHTML = `<i class="fas fa-clock"></i> ${data.time}`;

    // Auto hide after 5 seconds
    setTimeout(() => {
        resultDiv.style.display = 'none';
    }, 5000);
}

function showScanError(message) {
    const resultDiv = document.getElementById('scanResult');
    const errorDiv = document.getElementById('scanError');

    resultDiv.style.display = 'none';
    errorDiv.style.display = 'block';

    document.getElementById('resultError').textContent = message;

    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 3000);
}

function addToRecentScans(data) {
    recentScans.unshift({
        name: data.student.name,
        prayer: data.prayer.name,
        time: data.time
    });

    if (recentScans.length > 20) recentScans.pop();

    const container = document.getElementById('recentScans');
    container.innerHTML = recentScans.map(s => `
        <div class="scan-item">
            <div class="scan-icon"><i class="fas fa-check"></i></div>
            <div class="scan-info">
                <div class="scan-name">${s.name}</div>
                <div class="scan-prayer">${s.prayer}</div>
            </div>
            <div class="scan-time">${s.time}</div>
        </div>
    `).join('');
}

// ─── Students ──────────────────────────────────────────────────
async function loadStudents() {
    try {
        const search = document.getElementById('studentSearch')?.value || '';
        const res = await fetch(`${API}/api/students?search=${encodeURIComponent(search)}`);
        const students = await res.json();

        const tbody = document.getElementById('studentsTable');
        if (students.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><i class="fas fa-users"></i><p>لا يوجد طلبة</p></td></tr>';
            return;
        }

        tbody.innerHTML = students.map((s, i) => `
            <tr>
                <td>${i + 1}</td>
                <td><strong>${s.name}</strong></td>
                <td><code>${s.barcode}</code></td>
                <td>${s.grade || '-'}</td>
                <td>${s.phone || '-'}</td>
                <td>${s.parent_phone || '-'}</td>
                <td>
                    <div class="btn-group">
                        <button class="btn btn-sm btn-secondary" onclick="showStudentModal(${s.id})" title="تعديل">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-info" onclick="printBarcode('${s.barcode}', '${s.name}')" title="طباعة باركود">
                            <i class="fas fa-print"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="deleteStudent(${s.id})" title="حذف">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');

    } catch (err) {
        console.error('Load students error:', err);
    }
}

async function showStudentModal(studentId = null) {
    let student = { name: '', barcode: '', grade: '', phone: '', parent_phone: '' };

    if (studentId) {
        const res = await fetch(`${API}/api/students`);
        const students = await res.json();
        student = students.find(s => s.id === studentId) || student;
    }

    const title = studentId ? 'تعديل بيانات الطالب' : 'إضافة طالب جديد';
    const barcodes = studentId ? '' : generateBarcode();

    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = `
        <form id="studentForm">
            <div class="form-group">
                <label>اسم الطالب</label>
                <input type="text" class="input-field" style="width:100%" id="studentName" value="${student.name}" required>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>الباركود</label>
                    <input type="text" class="input-field" style="width:100%" id="studentBarcode" value="${student.barcode || barcodes}" ${studentId ? 'readonly' : ''} required>
                </div>
                <div class="form-group">
                    <label>الصف</label>
                    <input type="text" class="input-field" style="width:100%" id="studentGrade" value="${student.grade}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>هاتف الطالب</label>
                    <input type="text" class="input-field" style="width:100%" id="studentPhone" value="${student.phone}">
                </div>
                <div class="form-group">
                    <label>هاتف ولي الأمر</label>
                    <input type="text" class="input-field" style="width:100%" id="studentParentPhone" value="${student.parent_phone}">
                </div>
            </div>
            ${studentId ? '' : `
            <div class="form-group">
                <label>معاينة الباركود</label>
                <div class="barcode-display">
                    <svg id="barcodePreview"></svg>
                </div>
            </div>
            `}
        </form>
    `;

    if (!studentId) {
        setTimeout(() => {
            JsBarcode("#barcodePreview", barcodes, {
                format: "CODE128",
                width: 2,
                height: 50,
                displayValue: true,
                fontSize: 14,
                margin: 5
            });
        }, 100);
    }

    document.getElementById('modalFooter').innerHTML = `
        <button class="btn btn-primary" onclick="saveStudent(${studentId || 'null'})">
            <i class="fas fa-save"></i> ${studentId ? 'تحديث' : 'حفظ'}
        </button>
        <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
    `;

    openModal();
}

async function saveStudent(studentId) {
    const data = {
        name: document.getElementById('studentName').value.trim(),
        barcode: document.getElementById('studentBarcode').value.trim(),
        grade: document.getElementById('studentGrade').value.trim(),
        phone: document.getElementById('studentPhone').value.trim(),
        parent_phone: document.getElementById('studentParentPhone').value.trim()
    };

    if (!data.name || !data.barcode) {
        showToast('يرجى ملء الحقول المطلوبة', 'error');
        return;
    }

    try {
        const url = studentId ? `${API}/api/students/${studentId}` : `${API}/api/students`;
        const method = studentId ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await res.json();

        if (result.success) {
            showToast(studentId ? 'تم تحديث بيانات الطالب' : 'تم إضافة الطالب بنجاح', 'success');
            closeModal();
            loadStudents();
        } else {
            showToast(result.error || 'حدث خطأ', 'error');
        }
    } catch (err) {
        showToast('خطأ في الاتصال', 'error');
    }
}

async function deleteStudent(studentId) {
    if (!confirm('هل أنت متأكد من حذف هذا الطالب؟')) return;

    try {
        await fetch(`${API}/api/students/${studentId}`, { method: 'DELETE' });
        showToast('تم حذف الطالب', 'success');
        loadStudents();
    } catch (err) {
        showToast('خطأ في الحذف', 'error');
    }
}

function printBarcode(barcode, name) {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html><head><title>باركود - ${name}</title>
        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
        <style>body{font-family:Arial;text-align:center;padding:40px;} h2{margin-bottom:20px;} svg{margin:10px;}</style>
        </head><body>
        <h2>${name}</h2>
        <svg id="barcode"></svg>
        <script>JsBarcode("#barcode","${barcode}",{format:"CODE128",width:2,height:60,fontSize:16,margin:10});window.print();window.close();<\/script>
        </body></html>
    `);
    printWindow.document.close();
}

function generateBarcode() {
    return 'STU' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 5).toUpperCase();
}

// ─── Import Students ───────────────────────────────────────────
async function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet);

        const students = rows.map(row => ({
            name: row['الاسم'] || row['name'] || row['Name'] || '',
            barcode: row['الباركود'] || row['barcode'] || row['Barcode'] || '',
            grade: row['الصف'] || row['grade'] || row['Grade'] || '',
            phone: row['الهاتف'] || row['phone'] || row['Phone'] || '',
            parent_phone: row['هاتف_ولي_الأمر'] || row['parent_phone'] || ''
        })).filter(s => s.name && s.barcode);

        if (students.length === 0) {
            showToast('لم يتم العثور على بيانات صالحة', 'error');
            return;
        }

        const res = await fetch(`${API}/api/students/import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ students })
        });

        const result = await res.json();
        showToast(`تم استيراد ${result.imported} طالب بنجاح`, 'success');
        if (result.errors.length > 0) {
            showToast(`${result.errors.length} أخطاء`, 'warning');
        }
        loadStudents();

    } catch (err) {
        showToast('خطأ في قراءة الملف', 'error');
    }

    e.target.value = '';
}

// ─── Attendance ────────────────────────────────────────────────
async function loadAttendance() {
    try {
        const date = document.getElementById('attendanceDate')?.value || new Date().toISOString().split('T')[0];
        const prayerId = document.getElementById('attendancePrayer')?.value || '';
        const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab || 'present';

        // Load prayers for filter
        const prayersRes = await fetch(`${API}/api/prayers`);
        const prayers = await prayersRes.json();
        const select = document.getElementById('attendancePrayer');
        if (select.options.length <= 1) {
            prayers.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name;
                select.appendChild(opt);
            });
        }

        // Set today's date
        if (!document.getElementById('attendanceDate').value) {
            document.getElementById('attendanceDate').value = date;
        }

        if (activeTab === 'present') {
            const res = await fetch(`${API}/api/attendance?date=${date}&prayer_id=${prayerId}`);
            const attendance = await res.json();

            document.getElementById('attendanceTableHead').innerHTML = `
                <th>#</th><th>الاسم</th><th>الصف</th><th>الصلاة</th><th>الوقت</th>
            `;

            const tbody = document.getElementById('attendanceTable');
            if (attendance.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="empty-state"><p>لا يوجد سجلات حضور</p></td></tr>';
                return;
            }

            tbody.innerHTML = attendance.map((a, i) => `
                <tr>
                    <td>${i + 1}</td>
                    <td><strong>${a.student_name}</strong></td>
                    <td>${a.grade || '-'}</td>
                    <td><span class="badge badge-success">${a.prayer_name}</span></td>
                    <td>${new Date(a.scan_time).toLocaleTimeString('ar-SA', {hour: '2-digit', minute: '2-digit'})}</td>
                </tr>
            `).join('');
        } else {
            const url = prayerId
                ? `${API}/api/attendance/absent?date=${date}&prayer_id=${prayerId}`
                : `${API}/api/attendance/absent?date=${date}`;
            const res = await fetch(url);
            const absent = await res.json();

            document.getElementById('attendanceTableHead').innerHTML = `
                <th>#</th><th>الاسم</th><th>الصف</th><th>الباركود</th>
            `;

            const tbody = document.getElementById('attendanceTable');
            if (absent.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="empty-state"><p>جميع الطلبة حاضرون</p></td></tr>';
                return;
            }

            tbody.innerHTML = absent.map((s, i) => `
                <tr>
                    <td>${i + 1}</td>
                    <td><strong>${s.name}</strong></td>
                    <td>${s.grade || '-'}</td>
                    <td><code>${s.barcode}</code></td>
                </tr>
            `).join('');
        }

    } catch (err) {
        console.error('Load attendance error:', err);
    }
}

// ─── Reports ───────────────────────────────────────────────────
async function loadReports() {
    try {
        const date = new Date().toISOString().split('T')[0];
        const [dailyRes, weeklyRes, absentRes] = await Promise.all([
            fetch(`${API}/api/stats/daily?date=${date}`),
            fetch(`${API}/api/stats/weekly`),
            fetch(`${API}/api/stats/top-absent?days=30`)
        ]);

        const daily = await dailyRes.json();
        const weekly = await weeklyRes.json();
        const topAbsent = await absentRes.json();

        // Prayer chart
        renderPrayerChart(daily.prayers);

        // Weekly chart
        renderWeeklyChart(weekly);

        // Top absent table
        renderTopAbsent(topAbsent);

    } catch (err) {
        console.error('Reports error:', err);
    }
}

function renderPrayerChart(prayers) {
    const ctx = document.getElementById('prayerChart');
    if (!ctx) return;

    if (charts.prayer) charts.prayer.destroy();

    charts.prayer = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: prayers.map(p => p.prayer_name),
            datasets: [{
                label: 'الحاضرون',
                data: prayers.map(p => p.count),
                backgroundColor: '#2da44e',
                borderRadius: 6
            }, {
                label: 'الغائبات',
                data: prayers.map(p => p.total - p.count),
                backgroundColor: '#cf222e44',
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { stacked: true, grid: { display: false } },
                y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1 } }
            },
            plugins: {
                legend: {
                    labels: { font: { family: 'Cairo' } }
                }
            }
        }
    });
}

function renderWeeklyChart(weekly) {
    const ctx = document.getElementById('weeklyChart');
    if (!ctx) return;

    if (charts.weekly) charts.weekly.destroy();

    // Group by date
    const dateMap = {};
    weekly.forEach(w => {
        if (!dateMap[w.date]) dateMap[w.date] = {};
        dateMap[w.date][w.prayer_name] = w.count;
    });

    const dates = Object.keys(dateMap).sort();
    const prayerNames = [...new Set(weekly.map(w => w.prayer_name))];
    const colors = ['#2da44e', '#0969da', '#bf8700', '#cf222e', '#8250df'];

    charts.weekly = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates.map(d => new Date(d).toLocaleDateString('ar-SA', { weekday: 'short', month: 'short', day: 'numeric' })),
            datasets: prayerNames.map((name, i) => ({
                label: name,
                data: dates.map(d => dateMap[d][name] || 0),
                borderColor: colors[i % colors.length],
                backgroundColor: colors[i % colors.length] + '22',
                tension: 0.3,
                fill: false
            }))
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1 } }
            },
            plugins: {
                legend: {
                    labels: { font: { family: 'Cairo' } }
                }
            }
        }
    });
}

function renderTopAbsent(students) {
    const tbody = document.getElementById('topAbsentTable');
    if (!tbody) return;

    if (students.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state"><p>لا توجد بيانات</p></td></tr>';
        return;
    }

    tbody.innerHTML = students.map((s, i) => {
        const pct = s.attended_days > 0 ? Math.round(s.attended_days / 30 * 100) : 0;
        return `
            <tr>
                <td>${i + 1}</td>
                <td><strong>${s.name}</strong></td>
                <td>${s.grade || '-'}</td>
                <td>${s.attended_days} يوم</td>
                <td><span class="badge ${pct < 30 ? 'badge-danger' : pct < 60 ? 'badge-warning' : 'badge-success'}">${pct}%</span></td>
            </tr>
        `;
    }).join('');
}

// ─── Settings ──────────────────────────────────────────────────
async function loadSettings() {
    try {
        const res = await fetch(`${API}/api/prayers`);
        const prayers = await res.json();

        const tbody = document.getElementById('prayersTable');
        tbody.innerHTML = prayers.map((p, i) => `
            <tr>
                <td>${i + 1}</td>
                <td><strong>${p.name}</strong></td>
                <td>${p.time_start}</td>
                <td>${p.time_end}</td>
                <td><span class="badge ${p.is_active ? 'badge-success' : 'badge-danger'}">${p.is_active ? 'مفعلة' : 'معطلة'}</span></td>
                <td>
                    <div class="btn-group">
                        <button class="btn btn-sm btn-secondary" onclick="showPrayerModal(${p.id})">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="deletePrayer(${p.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');

    } catch (err) {
        console.error('Load settings error:', err);
    }
}

async function showPrayerModal(prayerId = null) {
    let prayer = { name: '', name_en: '', time_start: '12:00', time_end: '13:00', is_active: 1 };

    if (prayerId) {
        const res = await fetch(`${API}/api/prayers`);
        const prayers = await res.json();
        prayer = prayers.find(p => p.id === prayerId) || prayer;
    }

    document.getElementById('modalTitle').textContent = prayerId ? 'تعديل الصلاة' : 'إضافة صلاة جديدة';
    document.getElementById('modalBody').innerHTML = `
        <form id="prayerForm">
            <div class="form-row">
                <div class="form-group">
                    <label>اسم الصلاة (عربي)</label>
                    <input type="text" class="input-field" style="width:100%" id="prayerName" value="${prayer.name}" required>
                </div>
                <div class="form-group">
                    <label>اسم الصلاة (إنجليزي)</label>
                    <input type="text" class="input-field" style="width:100%" id="prayerNameEn" value="${prayer.name_en}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>وقت البداية</label>
                    <input type="time" class="input-field" style="width:100%" id="prayerStart" value="${prayer.time_start}" required>
                </div>
                <div class="form-group">
                    <label>وقت النهاية</label>
                    <input type="time" class="input-field" style="width:100%" id="prayerEnd" value="${prayer.time_end}" required>
                </div>
            </div>
        </form>
    `;

    document.getElementById('modalFooter').innerHTML = `
        <button class="btn btn-primary" onclick="savePrayer(${prayerId || 'null'})">
            <i class="fas fa-save"></i> ${prayerId ? 'تحديث' : 'حفظ'}
        </button>
        <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
    `;

    openModal();
}

async function savePrayer(prayerId) {
    const data = {
        name: document.getElementById('prayerName').value.trim(),
        name_en: document.getElementById('prayerNameEn').value.trim(),
        time_start: document.getElementById('prayerStart').value,
        time_end: document.getElementById('prayerEnd').value,
        is_active: 1
    };

    if (!data.name || !data.time_start || !data.time_end) {
        showToast('يرجى ملء جميع الحقول', 'error');
        return;
    }

    try {
        const url = prayerId ? `${API}/api/prayers/${prayerId}` : `${API}/api/prayers`;
        const method = prayerId ? 'PUT' : 'POST';

        await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        showToast(prayerId ? 'تم تحديث الصلاة' : 'تم إضافة الصلاة', 'success');
        closeModal();
        loadSettings();
    } catch (err) {
        showToast('خطأ في الحفظ', 'error');
    }
}

async function deletePrayer(prayerId) {
    if (!confirm('هل أنت متأكد من حذف هذه الصلاة؟')) return;

    try {
        await fetch(`${API}/api/prayers/${prayerId}`, { method: 'DELETE' });
        showToast('تم حذف الصلاة', 'success');
        loadSettings();
    } catch (err) {
        showToast('خطأ في الحذف', 'error');
    }
}

// ─── Export ────────────────────────────────────────────────────
async function exportExcel() {
    try {
        const date = new Date().toISOString().split('T')[0];
        const res = await fetch(`${API}/api/export/excel?date=${date}`);
        const data = await res.json();

        const ws = XLSX.utils.json_to_sheet(data.data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'الحضور');
        XLSX.writeFile(wb, `attendance_${date}.xlsx`);

        showToast('تم تصدير الملف بنجاح', 'success');
    } catch (err) {
        showToast('خطأ في التصدير', 'error');
    }
}

function exportPDF() {
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // Register Arabic font (use built-in)
        doc.setFont('helvetica');

        const date = new Date().toISOString().split('T')[0];

        doc.setFontSize(18);
        doc.text('Prayer Attendance Report', 105, 20, { align: 'center' });
        doc.setFontSize(12);
        doc.text(`Date: ${date}`, 105, 30, { align: 'center' });

        // Fetch data
        fetch(`${API}/api/export/pdf?date=${date}`)
            .then(r => r.json())
            .then(data => {
                let y = 45;
                doc.setFontSize(11);
                doc.text(`Total Students: ${data.total_students}`, 20, y);
                y += 15;

                doc.setFontSize(13);
                doc.text('Attendance Summary:', 20, y);
                y += 10;

                data.prayers.forEach(p => {
                    doc.setFontSize(11);
                    doc.text(`${p.prayer_name}: ${p.count} / ${data.total_students}`, 25, y);
                    y += 8;
                });

                y += 10;
                doc.setFontSize(10);
                doc.text(`Generated: ${new Date().toLocaleString()}`, 20, y);

                doc.save(`attendance_${date}.pdf`);
                showToast('تم تصدير PDF بنجاح', 'success');
            });
    } catch (err) {
        showToast('خطأ في تصدير PDF', 'error');
    }
}

// ─── Settings Actions ──────────────────────────────────────────
async function clearAttendance() {
    if (!confirm('هل أنت متأكد من مسح جميع سجلات الحضور؟ لا يمكن التراجع عن هذا الإجراء.')) return;

    try {
        const db = await fetch(`${API}/api/attendance`, { method: 'DELETE' });
        showToast('تم مسح السجلات', 'success');
    } catch (err) {
        showToast('خطأ', 'error');
    }
}

function backupDatabase() {
    showToast('جاري تحميل النسخة الاحتياطية...', 'info');
    // In a real app, this would download the SQLite file
    setTimeout(() => {
        showToast('يمكنك نسخ ملف data/attendance.db يدوياً', 'info');
    }, 1000);
}

// ─── Modal ─────────────────────────────────────────────────────
function openModal() {
    document.getElementById('modalOverlay').classList.add('active');
}

function closeModal() {
    document.getElementById('modalOverlay').classList.remove('active');
}

// ─── Toast Notifications ───────────────────────────────────────
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const icons = {
        success: 'fas fa-check-circle',
        error: 'fas fa-times-circle',
        warning: 'fas fa-exclamation-triangle',
        info: 'fas fa-info-circle'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="${icons[type]}"></i><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-20px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ─── Utilities ─────────────────────────────────────────────────
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}
