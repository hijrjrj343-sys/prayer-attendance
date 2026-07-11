/* ═══════════════════════════════════════════════════════════════
   Prayer Attendance System - Pure HTML/CSS/JS (localStorage)
   ═══════════════════════════════════════════════════════════════ */

let currentPage = 'dashboard';
let html5QrCode = null;
let isScanning = false;
let charts = {};
let recentScans = [];

// ─── Data Layer (localStorage) ─────────────────────────────────
const DB = {
    get(key, fallback = []) {
        try {
            const data = localStorage.getItem('prayer_' + key);
            return data ? JSON.parse(data) : fallback;
        } catch { return fallback; }
    },
    set(key, value) {
        localStorage.setItem('prayer_' + key, JSON.stringify(value));
    },
    nextId(key) {
        const items = this.get(key);
        return items.length > 0 ? Math.max(...items.map(i => i.id)) + 1 : 1;
    }
};

// ─── Initialize Default Data ───────────────────────────────────
function initDefaultData() {
    if (DB.get('prayers').length === 0) {
        DB.set('prayers', [
            { id: 1, name: 'الفجر', name_en: 'Fajr', time_start: '04:30', time_end: '05:30', is_active: 1 },
            { id: 2, name: 'الظهر', name_en: 'Dhuhr', time_start: '12:00', time_end: '13:00', is_active: 1 },
            { id: 3, name: 'العصر', name_en: 'Asr', time_start: '15:00', time_end: '16:00', is_active: 1 },
            { id: 4, name: 'المغرب', name_en: 'Maghrib', time_start: '18:00', time_end: '19:00', is_active: 1 },
            { id: 5, name: 'العشاء', name_en: 'Isha', time_start: '19:30', time_end: '20:30', is_active: 1 },
        ]);
    }
}

// ─── Students CRUD ─────────────────────────────────────────────
function getStudents(search = '') {
    let students = DB.get('students');
    if (search) {
        const s = search.toLowerCase();
        students = students.filter(st =>
            st.name.includes(s) || st.barcode.toLowerCase().includes(s) || (st.grade || '').includes(s)
        );
    }
    return students.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
}

function addStudent(data) {
    const students = DB.get('students');
    if (students.some(s => s.barcode === data.barcode)) {
        return { success: false, error: 'الباركود مستخدم بالفعل' };
    }
    data.id = DB.nextId('students');
    data.created_at = new Date().toISOString();
    students.push(data);
    DB.set('students', students);
    return { success: true, student: data };
}

function updateStudent(id, data) {
    const students = DB.get('students');
    const idx = students.findIndex(s => s.id === id);
    if (idx === -1) return { success: false, error: 'الطالب غير موجود' };
    if (students.some(s => s.barcode === data.barcode && s.id !== id)) {
        return { success: false, error: 'الباركود مستخدم بالفعل' };
    }
    students[idx] = { ...students[idx], ...data };
    DB.set('students', students);
    return { success: true, student: students[idx] };
}

function deleteStudent(id) {
    let students = DB.get('students');
    students = students.filter(s => s.id !== id);
    DB.set('students', students);
    let attendance = DB.get('attendance');
    attendance = attendance.filter(a => a.student_id !== id);
    DB.set('attendance', attendance);
    return { success: true };
}

function importStudents(list) {
    const students = DB.get('students');
    let imported = 0;
    const errors = [];
    for (const s of list) {
        if (!s.name || !s.barcode) continue;
        if (students.some(st => st.barcode === s.barcode)) {
            errors.push(`الباركود ${s.barcode} مستخدم بالفعل`);
            continue;
        }
        s.id = DB.nextId('students');
        s.created_at = new Date().toISOString();
        students.push(s);
        imported++;
    }
    DB.set('students', students);
    return { success: true, imported, errors };
}

// ─── Prayer Times CRUD ─────────────────────────────────────────
function getPrayers() {
    return DB.get('prayers').sort((a, b) => a.id - b.id);
}

function addPrayer(data) {
    const prayers = getPrayers();
    data.id = DB.nextId('prayers');
    prayers.push(data);
    DB.set('prayers', prayers);
    return { success: true };
}

function updatePrayer(id, data) {
    const prayers = getPrayers();
    const idx = prayers.findIndex(p => p.id === id);
    if (idx === -1) return { success: false };
    prayers[idx] = { ...prayers[idx], ...data };
    DB.set('prayers', prayers);
    return { success: true };
}

function deletePrayer(id) {
    let prayers = getPrayers();
    prayers = prayers.filter(p => p.id !== id);
    DB.set('prayers', prayers);
    return { success: true };
}

// ─── Attendance ────────────────────────────────────────────────
function recordAttendance(barcode) {
    const today = getToday();
    const students = DB.get('students');
    const student = students.find(s => s.barcode === barcode);
    if (!student) return { success: false, error: 'لم يتم التعرف على الطالب' };

    const now = new Date();
    const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
    const prayers = getPrayers().filter(p => p.is_active);
    const prayer = prayers.find(p => currentTime >= p.time_start && currentTime <= p.time_end);
    if (!prayer) return { success: false, error: 'لا توجد صلاة حالياً في هذا الوقت' };

    const attendance = DB.get('attendance');
    if (attendance.some(a => a.student_id === student.id && a.prayer_id === prayer.id && a.date === today)) {
        return { success: false, error: 'تم تسجيل الحضور مسبقاً لهذه الصلاة' };
    }

    const record = {
        id: DB.nextId('attendance'),
        student_id: student.id,
        prayer_id: prayer.id,
        date: today,
        scan_time: now.toISOString()
    };
    attendance.push(record);
    DB.set('attendance', attendance);

    return {
        success: true,
        student: { name: student.name, grade: student.grade, barcode: student.barcode },
        prayer: { name: prayer.name, name_en: prayer.name_en },
        time: now.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
}

function getAttendance(date, prayerId = null) {
    let attendance = DB.get('attendance');
    const students = DB.get('students');
    const prayers = getPrayers();

    attendance = attendance.filter(a => a.date === date);
    if (prayerId) attendance = attendance.filter(a => a.prayer_id == prayerId);

    return attendance.map(a => {
        const student = students.find(s => s.id === a.student_id);
        const prayer = prayers.find(p => p.id === a.prayer_id);
        return {
            ...a,
            student_name: student?.name || 'محذوف',
            student_grade: student?.grade || '',
            student_barcode: student?.barcode || '',
            prayer_name: prayer?.name || '',
            prayer_name_en: prayer?.name_en || ''
        };
    }).sort((a, b) => new Date(b.scan_time) - new Date(a.scan_time));
}

function getAbsent(date, prayerId = null) {
    const students = DB.get('students');
    let attendance = DB.get('attendance').filter(a => a.date === date);
    if (prayerId) attendance = attendance.filter(a => a.prayer_id == prayerId);

    const presentIds = new Set(attendance.map(a => a.student_id));
    return students.filter(s => !presentIds.has(s.id));
}

// ─── Statistics ────────────────────────────────────────────────
function getDailyStats(date) {
    const students = DB.get('students');
    const prayers = getPrayers().filter(p => p.is_active);
    const total = students.length;

    return {
        total_students: total,
        prayers: prayers.map(p => {
            const count = DB.get('attendance').filter(a => a.prayer_id === p.id && a.date === date).length;
            return {
                prayer_name: p.name,
                prayer_name_en: p.name_en,
                count,
                total,
                percentage: total > 0 ? Math.round(count / total * 100) : 0
            };
        })
    };
}

function getWeeklyStats() {
    const attendance = DB.get('attendance');
    const prayers = getPrayers();
    const result = [];
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];

        for (const p of prayers.filter(p => p.is_active)) {
            const count = attendance.filter(a => a.date === dateStr && a.prayer_id === p.id).length;
            if (count > 0) {
                result.push({ date: dateStr, prayer_name: p.name, count });
            }
        }
    }
    return result;
}

function getTopAbsent(days = 30) {
    const students = DB.get('students');
    const attendance = DB.get('attendance');
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - days);
    const startStr = startDate.toISOString().split('T')[0];

    const totalDays = new Set(
        attendance.filter(a => a.date >= startStr).map(a => a.date)
    ).size || 1;

    return students.map(s => {
        const attended = new Set(
            attendance.filter(a => a.student_id === s.id && a.date >= startStr).map(a => a.date)
        ).size;
        return { ...s, attended_days: attended, total_days: totalDays };
    }).sort((a, b) => a.attended_days - b.attended_days).slice(0, 10);
}

// ─── Helpers ───────────────────────────────────────────────────
function getToday() {
    return new Date().toISOString().split('T')[0];
}

function generateBarcode() {
    return 'STU' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
}

function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ─── Initialize ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initDefaultData();
    initNavigation();
    initClock();
    initEventListeners();
    loadDashboard();
});

// ─── Navigation ────────────────────────────────────────────────
function initNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', e => {
            e.preventDefault();
            navigateTo(item.dataset.page);
        });
    });
}

function navigateTo(page) {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.querySelector(`[data-page="${page}"]`).classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${page}`).classList.add('active');

    const titles = { dashboard: 'الرئيسية', scanner: 'مسح الباركود', students: 'الطلبة', attendance: 'سجل الحضور', reports: 'التقارير', settings: 'الإعدادات' };
    document.getElementById('headerTitle').textContent = titles[page] || '';
    currentPage = page;
    document.getElementById('sidebar').classList.remove('open');

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
    document.getElementById('liveClock').textContent = timeStr;
    document.getElementById('currentTime').textContent = timeStr;

    const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
    const prayers = getPrayers().filter(p => p.is_active);
    const current = prayers.find(p => currentTime >= p.time_start && currentTime <= p.time_end);
    document.getElementById('currentPrayer').textContent = current ? `الصلاة الحالية: ${current.name}` : 'لا توجد صلاة حالياً';
}

// ─── Event Listeners ───────────────────────────────────────────
function initEventListeners() {
    document.getElementById('mobileMenuBtn').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
    document.getElementById('studentSearch')?.addEventListener('input', debounce(loadStudents, 300));
    document.getElementById('attendanceDate')?.addEventListener('change', loadAttendance);
    document.getElementById('attendancePrayer')?.addEventListener('change', loadAttendance);

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            loadAttendance();
        });
    });

    document.getElementById('startScanBtn')?.addEventListener('click', startScanner);
    document.getElementById('stopScanBtn')?.addEventListener('click', stopScanner);
    document.getElementById('manualSubmit')?.addEventListener('click', () => {
        const v = document.getElementById('manualBarcode').value.trim();
        if (v) { recordAttendance(v); document.getElementById('manualBarcode').value = ''; }
    });
    document.getElementById('manualBarcode')?.addEventListener('keypress', e => { if (e.key === 'Enter') document.getElementById('manualSubmit').click(); });

    document.getElementById('addStudentBtn')?.addEventListener('click', () => showStudentModal());
    document.getElementById('importStudentsBtn')?.addEventListener('click', () => document.getElementById('importFileInput').click());
    document.getElementById('importFileInput')?.addEventListener('change', handleImport);
    document.getElementById('addPrayerBtn')?.addEventListener('click', () => showPrayerModal());
    document.getElementById('exportPdfBtn')?.addEventListener('click', exportPDF);
    document.getElementById('exportExcelBtn')?.addEventListener('click', exportExcel);
    document.getElementById('clearAttendanceBtn')?.addEventListener('click', clearAttendance);
    document.getElementById('backupDbBtn')?.addEventListener('click', backupData);

    document.getElementById('modalClose')?.addEventListener('click', closeModal);
    document.getElementById('modalOverlay')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });

    document.addEventListener('click', e => {
        const sb = document.getElementById('sidebar');
        const mb = document.getElementById('mobileMenuBtn');
        if (!sb.contains(e.target) && !mb.contains(e.target)) sb.classList.remove('open');
    });
}

// ─── Dashboard ─────────────────────────────────────────────────
function loadDashboard() {
    const date = getToday();
    const stats = getDailyStats(date);
    const attendance = getAttendance(date);

    document.getElementById('totalStudents').textContent = stats.total_students;
    const uniquePresent = new Set(attendance.map(a => a.student_id));
    const presentCount = uniquePresent.size;
    const absentCount = Math.max(0, stats.total_students - presentCount);
    const rate = stats.total_students > 0 ? Math.round(presentCount / stats.total_students * 100) : 0;

    document.getElementById('todayPresent').textContent = presentCount;
    document.getElementById('todayAbsent').textContent = absentCount;
    document.getElementById('attendanceRate').textContent = rate + '%';

    renderDashboardChart(stats.prayers);
    renderDashboardPrayers(stats.prayers);
    renderRecentAttendance(attendance.slice(0, 10));
}

function renderDashboardChart(prayers) {
    const ctx = document.getElementById('dashboardChart');
    if (!ctx) return;
    if (charts.dashboard) charts.dashboard.destroy();
    charts.dashboard = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: prayers.map(p => p.prayer_name),
            datasets: [{ data: prayers.map(p => p.count), backgroundColor: ['#2da44e', '#0969da', '#bf8700', '#cf222e', '#8250df'], borderWidth: 0 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { family: 'Cairo' } } } } }
    });
}

function renderDashboardPrayers(prayers) {
    const c = document.getElementById('dashboardPrayers');
    if (!c) return;
    c.innerHTML = prayers.map(p => `
        <div class="prayer-item">
            <span class="prayer-name"><i class="fas fa-mosque"></i> ${p.prayer_name}</span>
            <span class="prayer-time">${p.prayer_name_en}</span>
            <span class="prayer-count">${p.count}/${p.total}</span>
        </div>
    `).join('');
}

function renderRecentAttendance(list) {
    const tbody = document.getElementById('recentAttendance');
    if (!tbody) return;
    if (!list.length) { tbody.innerHTML = '<tr><td colspan="4" class="empty-state"><p>لا توجد سجلات بعد</p></td></tr>'; return; }
    tbody.innerHTML = list.map(a => `
        <tr>
            <td>${a.student_name}</td>
            <td>${a.student_grade || '-'}</td>
            <td><span class="badge badge-success">${a.prayer_name}</span></td>
            <td>${new Date(a.scan_time).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}</td>
        </tr>
    `).join('');
}

// ─── Scanner ───────────────────────────────────────────────────
function initScanner() {
    if (html5QrCode) { html5QrCode.clear().catch(() => {}); html5QrCode = null; }
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
            onScanSuccess, () => {}
        );
        isScanning = true;
        document.getElementById('startScanBtn').style.display = 'none';
        document.getElementById('stopScanBtn').style.display = '';
        document.getElementById('scannerStatus').innerHTML = '<i class="fas fa-camera" style="color:var(--primary)"></i><span style="color:var(--primary)">جاري المسح... وجّه الكاميرا نحو الباركود</span>';
    } catch (err) {
        document.getElementById('scannerStatus').innerHTML = '<i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i><span style="color:var(--danger)">فشل في تشغيل الكاميرا. تحقق من الأذونات.</span>';
        showToast('فشل في تشغيل الكاميرا', 'error');
    }
}

async function stopScanner() {
    if (html5QrCode && isScanning) {
        try { await html5QrCode.stop(); } catch (e) {}
        isScanning = false;
        document.getElementById('startScanBtn').style.display = '';
        document.getElementById('stopScanBtn').style.display = 'none';
        document.getElementById('scannerStatus').innerHTML = '<i class="fas fa-camera"></i><span>اضغط لبدء المسح</span>';
    }
}

async function onScanSuccess(decodedText) {
    try { document.getElementById('scanSound').play(); } catch (e) {}
    const result = recordAttendance(decodedText);
    if (result.success) {
        showScanResult(result);
        showToast(`تم تسجيل حضور ${result.student.name} - ${result.prayer.name}`, 'success');
        addToRecentScans(result);
    } else {
        showScanError(result.error);
        showToast(result.error, 'error');
    }
}

function showScanResult(data) {
    document.getElementById('scanError').style.display = 'none';
    const r = document.getElementById('scanResult');
    r.style.display = 'block';
    document.getElementById('resultName').textContent = data.student.name;
    document.getElementById('resultPrayer').innerHTML = `<i class="fas fa-mosque"></i> ${data.prayer.name}`;
    document.getElementById('resultTime').innerHTML = `<i class="fas fa-clock"></i> ${data.time}`;
    setTimeout(() => { r.style.display = 'none'; }, 5000);
}

function showScanError(msg) {
    document.getElementById('scanResult').style.display = 'none';
    const e = document.getElementById('scanError');
    e.style.display = 'block';
    document.getElementById('resultError').textContent = msg;
    setTimeout(() => { e.style.display = 'none'; }, 3000);
}

function addToRecentScans(data) {
    recentScans.unshift({ name: data.student.name, prayer: data.prayer.name, time: data.time });
    if (recentScans.length > 20) recentScans.pop();
    document.getElementById('recentScans').innerHTML = recentScans.map(s => `
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
function loadStudents() {
    const search = document.getElementById('studentSearch')?.value || '';
    const students = getStudents(search);
    const tbody = document.getElementById('studentsTable');
    if (!students.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><i class="fas fa-users"></i><p>لا يوجد طلبة</p></td></tr>'; return; }
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
                    <button class="btn btn-sm btn-secondary" onclick="showStudentModal(${s.id})" title="تعديل"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-info" onclick="printBarcode('${s.barcode}','${s.name.replace(/'/g, "\\'")}')" title="طباعة"><i class="fas fa-print"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="deleteStudentConfirm(${s.id})" title="حذف"><i class="fas fa-trash"></i></button>
                </div>
            </td>
        </tr>
    `).join('');
}

function showStudentModal(studentId = null) {
    let student = { name: '', barcode: '', grade: '', phone: '', parent_phone: '' };
    if (studentId) {
        const found = DB.get('students').find(s => s.id === studentId);
        if (found) student = found;
    }
    const isNew = !studentId;
    const barcode = isNew ? generateBarcode() : student.barcode;

    document.getElementById('modalTitle').textContent = isNew ? 'إضافة طالب جديد' : 'تعديل بيانات الطالب';
    document.getElementById('modalBody').innerHTML = `
        <form id="studentForm" onsubmit="return false">
            <div class="form-group">
                <label>اسم الطالب</label>
                <input type="text" class="input-field" style="width:100%" id="studentName" value="${student.name}" required>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>الباركود</label>
                    <input type="text" class="input-field" style="width:100%" id="studentBarcode" value="${barcode}" ${!isNew ? 'readonly' : ''} required>
                </div>
                <div class="form-group">
                    <label>الصف</label>
                    <input type="text" class="input-field" style="width:100%" id="studentGrade" value="${student.grade || ''}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>هاتف الطالب</label>
                    <input type="text" class="input-field" style="width:100%" id="studentPhone" value="${student.phone || ''}">
                </div>
                <div class="form-group">
                    <label>هاتف ولي الأمر</label>
                    <input type="text" class="input-field" style="width:100%" id="studentParentPhone" value="${student.parent_phone || ''}">
                </div>
            </div>
            ${isNew ? '<div class="form-group"><label>معاينة الباركود</label><div class="barcode-display"><svg id="barcodePreview"></svg></div></div>' : ''}
        </form>
    `;

    if (isNew) {
        setTimeout(() => {
            JsBarcode("#barcodePreview", barcode, { format: "CODE128", width: 2, height: 50, displayValue: true, fontSize: 14, margin: 5 });
        }, 100);
    }

    document.getElementById('modalFooter').innerHTML = `
        <button class="btn btn-primary" onclick="saveStudent(${studentId || 'null'})"><i class="fas fa-save"></i> ${isNew ? 'حفظ' : 'تحديث'}</button>
        <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
    `;
    openModal();
}

function saveStudent(studentId) {
    const data = {
        name: document.getElementById('studentName').value.trim(),
        barcode: document.getElementById('studentBarcode').value.trim(),
        grade: document.getElementById('studentGrade').value.trim(),
        phone: document.getElementById('studentPhone').value.trim(),
        parent_phone: document.getElementById('studentParentPhone').value.trim()
    };
    if (!data.name || !data.barcode) { showToast('يرجى ملء الحقول المطلوبة', 'error'); return; }

    const result = studentId ? updateStudent(studentId, data) : addStudent(data);
    if (result.success) {
        showToast(studentId ? 'تم التحديث' : 'تمت الإضافة', 'success');
        closeModal();
        loadStudents();
    } else {
        showToast(result.error, 'error');
    }
}

function deleteStudentConfirm(id) {
    if (!confirm('هل أنت متأكد من حذف هذا الطالب؟')) return;
    deleteStudent(id);
    showToast('تم الحذف', 'success');
    loadStudents();
}

function printBarcode(barcode, name) {
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>باركود - ${name}</title>
    <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
    <style>body{font-family:Arial;text-align:center;padding:40px}h2{margin-bottom:20px}</style>
    </head><body><h2>${name}</h2><svg id="bc"></svg>
    <script>JsBarcode("#bc","${barcode}",{format:"CODE128",width:2,height:60,fontSize:16,margin:10});window.print();window.close();<\/script>
    </body></html>`);
    w.document.close();
}

// ─── Import ────────────────────────────────────────────────────
function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (ev) {
        try {
            const wb = XLSX.read(ev.target.result, { type: 'array' });
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
            const students = rows.map(r => ({
                name: r['الاسم'] || r['name'] || r['Name'] || '',
                barcode: r['الباركود'] || r['barcode'] || r['Barcode'] || '',
                grade: r['الصف'] || r['grade'] || r['Grade'] || '',
                phone: r['الهاتف'] || r['phone'] || '',
                parent_phone: r['هاتف_ولي_الأمر'] || r['parent_phone'] || ''
            })).filter(s => s.name && s.barcode);

            if (!students.length) { showToast('لم يتم العثور على بيانات', 'error'); return; }
            const result = importStudents(students);
            showToast(`تم استيراد ${result.imported} طالب`, 'success');
            if (result.errors.length) showToast(`${result.errors.length} أخطاء`, 'warning');
            loadStudents();
        } catch { showToast('خطأ في قراءة الملف', 'error'); }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
}

// ─── Attendance ────────────────────────────────────────────────
function loadAttendance() {
    const date = document.getElementById('attendanceDate')?.value || getToday();
    const prayerId = document.getElementById('attendancePrayer')?.value || null;
    const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab || 'present';

    if (!document.getElementById('attendanceDate').value) document.getElementById('attendanceDate').value = date;

    const select = document.getElementById('attendancePrayer');
    if (select.options.length <= 1) {
        getPrayers().forEach(p => { const o = document.createElement('option'); o.value = p.id; o.textContent = p.name; select.appendChild(o); });
    }

    if (activeTab === 'present') {
        const list = getAttendance(date, prayerId);
        document.getElementById('attendanceTableHead').innerHTML = '<th>#</th><th>الاسم</th><th>الصف</th><th>الصلاة</th><th>الوقت</th>';
        const tbody = document.getElementById('attendanceTable');
        if (!list.length) { tbody.innerHTML = '<tr><td colspan="5" class="empty-state"><p>لا يوجد سجلات حضور</p></td></tr>'; return; }
        tbody.innerHTML = list.map((a, i) => `
            <tr>
                <td>${i + 1}</td>
                <td><strong>${a.student_name}</strong></td>
                <td>${a.student_grade || '-'}</td>
                <td><span class="badge badge-success">${a.prayer_name}</span></td>
                <td>${new Date(a.scan_time).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}</td>
            </tr>
        `).join('');
    } else {
        const list = getAbsent(date, prayerId);
        document.getElementById('attendanceTableHead').innerHTML = '<th>#</th><th>الاسم</th><th>الصف</th><th>الباركود</th>';
        const tbody = document.getElementById('attendanceTable');
        if (!list.length) { tbody.innerHTML = '<tr><td colspan="4" class="empty-state"><p>جميع الطلبة حاضرون</p></td></tr>'; return; }
        tbody.innerHTML = list.map((s, i) => `
            <tr><td>${i + 1}</td><td><strong>${s.name}</strong></td><td>${s.grade || '-'}</td><td><code>${s.barcode}</code></td></tr>
        `).join('');
    }
}

// ─── Reports ───────────────────────────────────────────────────
function loadReports() {
    const daily = getDailyStats(getToday());
    const weekly = getWeeklyStats();
    const topAbsent = getTopAbsent(30);

    renderPrayerChart(daily.prayers);
    renderWeeklyChart(weekly);
    renderTopAbsent(topAbsent);
}

function renderPrayerChart(prayers) {
    const ctx = document.getElementById('prayerChart');
    if (!ctx) return;
    if (charts.prayer) charts.prayer.destroy();
    charts.prayer = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: prayers.map(p => p.prayer_name),
            datasets: [
                { label: 'الحاضرون', data: prayers.map(p => p.count), backgroundColor: '#2da44e', borderRadius: 6 },
                { label: 'الغائبات', data: prayers.map(p => p.total - p.count), backgroundColor: '#cf222e44', borderRadius: 6 }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true } }, plugins: { legend: { labels: { font: { family: 'Cairo' } } } } }
    });
}

function renderWeeklyChart(weekly) {
    const ctx = document.getElementById('weeklyChart');
    if (!ctx) return;
    if (charts.weekly) charts.weekly.destroy();

    const dateMap = {};
    weekly.forEach(w => { if (!dateMap[w.date]) dateMap[w.date] = {}; dateMap[w.date][w.prayer_name] = w.count; });
    const dates = Object.keys(dateMap).sort();
    const names = [...new Set(weekly.map(w => w.prayer_name))];
    const colors = ['#2da44e', '#0969da', '#bf8700', '#cf222e', '#8250df'];

    charts.weekly = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates.map(d => new Date(d).toLocaleDateString('ar-SA', { weekday: 'short', month: 'short', day: 'numeric' })),
            datasets: names.map((n, i) => ({
                label: n,
                data: dates.map(d => dateMap[d][n] || 0),
                borderColor: colors[i % colors.length],
                backgroundColor: colors[i % colors.length] + '22',
                tension: 0.3, fill: false
            }))
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } }, plugins: { legend: { labels: { font: { family: 'Cairo' } } } } }
    });
}

function renderTopAbsent(students) {
    const tbody = document.getElementById('topAbsentTable');
    if (!tbody) return;
    if (!students.length) { tbody.innerHTML = '<tr><td colspan="5" class="empty-state"><p>لا توجد بيانات</p></td></tr>'; return; }
    tbody.innerHTML = students.map((s, i) => {
        const pct = s.total_days > 0 ? Math.round(s.attended_days / s.total_days * 100) : 0;
        return `<tr>
            <td>${i + 1}</td><td><strong>${s.name}</strong></td><td>${s.grade || '-'}</td>
            <td>${s.attended_days} يوم</td>
            <td><span class="badge ${pct < 30 ? 'badge-danger' : pct < 60 ? 'badge-warning' : 'badge-success'}">${pct}%</span></td>
        </tr>`;
    }).join('');
}

// ─── Settings ──────────────────────────────────────────────────
function loadSettings() {
    const prayers = getPrayers();
    document.getElementById('prayersTable').innerHTML = prayers.map((p, i) => `
        <tr>
            <td>${i + 1}</td><td><strong>${p.name}</strong></td><td>${p.time_start}</td><td>${p.time_end}</td>
            <td><span class="badge ${p.is_active ? 'badge-success' : 'badge-danger'}">${p.is_active ? 'مفعلة' : 'معطلة'}</span></td>
            <td>
                <div class="btn-group">
                    <button class="btn btn-sm btn-secondary" onclick="showPrayerModal(${p.id})"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="deletePrayerConfirm(${p.id})"><i class="fas fa-trash"></i></button>
                </div>
            </td>
        </tr>
    `).join('');
}

function showPrayerModal(prayerId = null) {
    let prayer = { name: '', name_en: '', time_start: '12:00', time_end: '13:00', is_active: 1 };
    if (prayerId) { const found = getPrayers().find(p => p.id === prayerId); if (found) prayer = found; }
    const isNew = !prayerId;

    document.getElementById('modalTitle').textContent = isNew ? 'إضافة صلاة' : 'تعديل الصلاة';
    document.getElementById('modalBody').innerHTML = `
        <form onsubmit="return false">
            <div class="form-row">
                <div class="form-group"><label>اسم الصلاة (عربي)</label><input type="text" class="input-field" style="width:100%" id="prayerName" value="${prayer.name}" required></div>
                <div class="form-group"><label>اسم الصلاة (إنجليزي)</label><input type="text" class="input-field" style="width:100%" id="prayerNameEn" value="${prayer.name_en || ''}"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>وقت البداية</label><input type="time" class="input-field" style="width:100%" id="prayerStart" value="${prayer.time_start}" required></div>
                <div class="form-group"><label>وقت النهاية</label><input type="time" class="input-field" style="width:100%" id="prayerEnd" value="${prayer.time_end}" required></div>
            </div>
        </form>
    `;
    document.getElementById('modalFooter').innerHTML = `
        <button class="btn btn-primary" onclick="savePrayer(${prayerId || 'null'})"><i class="fas fa-save"></i> ${isNew ? 'حفظ' : 'تحديث'}</button>
        <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
    `;
    openModal();
}

function savePrayer(id) {
    const data = {
        name: document.getElementById('prayerName').value.trim(),
        name_en: document.getElementById('prayerNameEn').value.trim(),
        time_start: document.getElementById('prayerStart').value,
        time_end: document.getElementById('prayerEnd').value,
        is_active: 1
    };
    if (!data.name || !data.time_start || !data.time_end) { showToast('يرجى ملء الحقول', 'error'); return; }
    id ? updatePrayer(id, data) : addPrayer(data);
    showToast(id ? 'تم التحديث' : 'تمت الإضافة', 'success');
    closeModal();
    loadSettings();
}

function deletePrayerConfirm(id) {
    if (!confirm('هل أنت متأكد؟')) return;
    deletePrayer(id);
    showToast('تم الحذف', 'success');
    loadSettings();
}

// ─── Export ────────────────────────────────────────────────────
function exportExcel() {
    const date = getToday();
    const students = getStudents();
    const prayers = getPrayers().filter(p => p.is_active);
    const attendance = DB.get('attendance');

    const data = students.map(s => {
        const row = { 'اسم الطالب': s.name, 'الباركود': s.barcode, 'الصف': s.grade || '' };
        prayers.forEach(p => {
            row[p.name] = attendance.some(a => a.student_id === s.id && a.prayer_id === p.id && a.date === date) ? '✓' : '✗';
        });
        return row;
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'الحضور');
    XLSX.writeFile(wb, `attendance_${date}.xlsx`);
    showToast('تم التصدير بنجاح', 'success');
}

function exportPDF() {
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const date = getToday();
        const stats = getDailyStats(date);

        doc.setFontSize(18);
        doc.text('Prayer Attendance Report', 105, 20, { align: 'center' });
        doc.setFontSize(12);
        doc.text(`Date: ${date}`, 105, 30, { align: 'center' });
        doc.setFontSize(11);
        doc.text(`Total Students: ${stats.total_students}`, 20, 45);

        let y = 55;
        doc.setFontSize(13);
        doc.text('Attendance Summary:', 20, y);
        y += 10;
        stats.prayers.forEach(p => {
            doc.setFontSize(11);
            doc.text(`${p.prayer_name} (${p.prayer_name_en}): ${p.count} / ${stats.total_students}`, 25, y);
            y += 8;
        });
        y += 10;
        doc.setFontSize(10);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 20, y);
        doc.save(`attendance_${date}.pdf`);
        showToast('تم التصدير بنجاح', 'success');
    } catch { showToast('خطأ في التصدير', 'error'); }
}

// ─── Settings Actions ──────────────────────────────────────────
function clearAttendance() {
    if (!confirm('هل أنت متأكد من مسح جميع سجلات الحضور؟')) return;
    DB.set('attendance', []);
    showToast('تم مسح السجلات', 'success');
    loadSettings();
}

function backupData() {
    const data = {
        students: DB.get('students'),
        prayers: DB.get('prayers'),
        attendance: DB.get('attendance')
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_${getToday()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('تم تحميل النسخة الاحتياطية', 'success');
}

// ─── Modal & Toast ─────────────────────────────────────────────
function openModal() { document.getElementById('modalOverlay').classList.add('active'); }
function closeModal() { document.getElementById('modalOverlay').classList.remove('active'); }

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const icons = { success: 'fas fa-check-circle', error: 'fas fa-times-circle', warning: 'fas fa-exclamation-triangle', info: 'fas fa-info-circle' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="${icons[type]}"></i><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(-20px)'; setTimeout(() => toast.remove(), 300); }, 3000);
}
