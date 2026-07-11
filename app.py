import sqlite3
from flask import Flask, render_template, jsonify, request
from flask_cors import CORS
from database import get_db, init_db, dict_from_row, dict_from_rows
from datetime import datetime, date

app = Flask(__name__)
CORS(app)

init_db()


@app.route('/')
def index():
    return render_template('index.html')


# ─── Students API ───────────────────────────────────────────────

@app.route('/api/students', methods=['GET'])
def get_students():
    search = request.args.get('search', '')
    db = get_db()
    if search:
        rows = db.execute(
            "SELECT * FROM students WHERE name LIKE ? OR barcode LIKE ? OR grade LIKE ? ORDER BY name",
            (f'%{search}%', f'%{search}%', f'%{search}%')
        ).fetchall()
    else:
        rows = db.execute("SELECT * FROM students ORDER BY name").fetchall()
    db.close()
    return jsonify(dict_from_rows(rows))


@app.route('/api/students', methods=['POST'])
def add_student():
    data = request.json
    db = get_db()
    try:
        db.execute(
            "INSERT INTO students (name, barcode, grade, phone, parent_phone) VALUES (?, ?, ?, ?, ?)",
            (data['name'], data['barcode'], data.get('grade', ''), data.get('phone', ''), data.get('parent_phone', ''))
        )
        db.commit()
        student = db.execute("SELECT * FROM students WHERE barcode = ?", (data['barcode'],)).fetchone()
        db.close()
        return jsonify({'success': True, 'student': dict_from_row(student)})
    except sqlite3.IntegrityError:
        db.close()
        return jsonify({'success': False, 'error': 'الباركود مستخدم بالفعل'}), 400


@app.route('/api/students/<int:student_id>', methods=['PUT'])
def update_student(student_id):
    data = request.json
    db = get_db()
    db.execute(
        "UPDATE students SET name=?, barcode=?, grade=?, phone=?, parent_phone=? WHERE id=?",
        (data['name'], data['barcode'], data.get('grade', ''), data.get('phone', ''), data.get('parent_phone', ''), student_id)
    )
    db.commit()
    student = db.execute("SELECT * FROM students WHERE id=?", (student_id,)).fetchone()
    db.close()
    return jsonify({'success': True, 'student': dict_from_row(student)})


@app.route('/api/students/<int:student_id>', methods=['DELETE'])
def delete_student(student_id):
    db = get_db()
    db.execute("DELETE FROM students WHERE id=?", (student_id,))
    db.commit()
    db.close()
    return jsonify({'success': True})


@app.route('/api/students/import', methods=['POST'])
def import_students():
    data = request.json
    students = data.get('students', [])
    db = get_db()
    imported = 0
    errors = []
    for s in students:
        try:
            db.execute(
                "INSERT INTO students (name, barcode, grade, phone, parent_phone) VALUES (?, ?, ?, ?, ?)",
                (s['name'], s['barcode'], s.get('grade', ''), s.get('phone', ''), s.get('parent_phone', ''))
            )
            imported += 1
        except sqlite3.IntegrityError:
            errors.append(f"الباركود {s['barcode']} مستخدم بالفعل")
    db.commit()
    db.close()
    return jsonify({'success': True, 'imported': imported, 'errors': errors})


# ─── Prayer Times API ───────────────────────────────────────────

@app.route('/api/prayers', methods=['GET'])
def get_prayers():
    db = get_db()
    rows = db.execute("SELECT * FROM prayer_times ORDER BY id").fetchall()
    db.close()
    return jsonify(dict_from_rows(rows))


@app.route('/api/prayers', methods=['POST'])
def add_prayer():
    data = request.json
    db = get_db()
    db.execute(
        "INSERT INTO prayer_times (name, name_en, time_start, time_end, is_active) VALUES (?, ?, ?, ?, ?)",
        (data['name'], data.get('name_en', ''), data['time_start'], data['time_end'], data.get('is_active', 1))
    )
    db.commit()
    db.close()
    return jsonify({'success': True})


@app.route('/api/prayers/<int:prayer_id>', methods=['PUT'])
def update_prayer(prayer_id):
    data = request.json
    db = get_db()
    db.execute(
        "UPDATE prayer_times SET name=?, name_en=?, time_start=?, time_end=?, is_active=? WHERE id=?",
        (data['name'], data.get('name_en', ''), data['time_start'], data['time_end'], data.get('is_active', 1), prayer_id)
    )
    db.commit()
    db.close()
    return jsonify({'success': True})


@app.route('/api/prayers/<int:prayer_id>', methods=['DELETE'])
def delete_prayer(prayer_id):
    db = get_db()
    db.execute("DELETE FROM prayer_times WHERE id=?", (prayer_id,))
    db.commit()
    db.close()
    return jsonify({'success': True})


# ─── Attendance API ─────────────────────────────────────────────

@app.route('/api/attendance', methods=['POST'])
def record_attendance():
    data = request.json
    barcode = data.get('barcode', '')
    today = date.today().isoformat()
    db = get_db()

    student = db.execute("SELECT * FROM students WHERE barcode=?", (barcode,)).fetchone()
    if not student:
        db.close()
        return jsonify({'success': False, 'error': 'لم يتم التعرف على الطالب'}), 404

    now = datetime.now()
    current_time = now.strftime('%H:%M')

    prayer = db.execute(
        "SELECT * FROM prayer_times WHERE is_active=1 AND time_start <= ? AND time_end >= ? ORDER BY id DESC LIMIT 1",
        (current_time, current_time)
    ).fetchone()

    if not prayer:
        db.close()
        return jsonify({'success': False, 'error': 'لا توجد صلاة حالياً في هذا الوقت'}), 400

    try:
        db.execute(
            "INSERT INTO attendance (student_id, prayer_id, date, scan_time) VALUES (?, ?, ?, ?)",
            (student['id'], prayer['id'], today, now.isoformat())
        )
        db.commit()
        db.close()
        return jsonify({
            'success': True,
            'student': dict_from_row(student),
            'prayer': dict_from_row(prayer),
            'time': now.strftime('%H:%M:%S')
        })
    except sqlite3.IntegrityError:
        db.close()
        return jsonify({'success': False, 'error': 'تم تسجيل الحضور مسبقاً لهذه الصلاة'}), 400


@app.route('/api/attendance', methods=['GET'])
def get_attendance():
    query_date = request.args.get('date', date.today().isoformat())
    prayer_id = request.args.get('prayer_id', '')
    db = get_db()

    if prayer_id:
        rows = db.execute('''
            SELECT a.*, s.name as student_name, s.barcode, s.grade,
                   p.name as prayer_name, p.name_en as prayer_name_en
            FROM attendance a
            JOIN students s ON a.student_id = s.id
            JOIN prayer_times p ON a.prayer_id = p.id
            WHERE a.date = ? AND a.prayer_id = ?
            ORDER BY a.scan_time DESC
        ''', (query_date, prayer_id)).fetchall()
    else:
        rows = db.execute('''
            SELECT a.*, s.name as student_name, s.barcode, s.grade,
                   p.name as prayer_name, p.name_en as prayer_name_en
            FROM attendance a
            JOIN students s ON a.student_id = s.id
            JOIN prayer_times p ON a.prayer_id = p.id
            WHERE a.date = ?
            ORDER BY a.scan_time DESC
        ''', (query_date,)).fetchall()

    db.close()
    return jsonify(dict_from_rows(rows))


@app.route('/api/attendance/absent', methods=['GET'])
def get_absent():
    query_date = request.args.get('date', date.today().isoformat())
    prayer_id = request.args.get('prayer_id', '')
    db = get_db()

    if prayer_id:
        rows = db.execute('''
            SELECT s.* FROM students s
            WHERE s.id NOT IN (
                SELECT a.student_id FROM attendance a
                WHERE a.date = ? AND a.prayer_id = ?
            )
            ORDER BY s.name
        ''', (query_date, prayer_id)).fetchall()
    else:
        rows = db.execute('''
            SELECT s.* FROM students s
            WHERE s.id NOT IN (
                SELECT a.student_id FROM attendance a
                WHERE a.date = ?
            )
            ORDER BY s.name
        ''', (query_date,)).fetchall()

    db.close()
    return jsonify(dict_from_rows(rows))


# ─── Statistics API ─────────────────────────────────────────────

@app.route('/api/stats/daily', methods=['GET'])
def get_daily_stats():
    query_date = request.args.get('date', date.today().isoformat())
    db = get_db()

    total_students = db.execute("SELECT COUNT(*) FROM students").fetchone()[0]

    prayers = db.execute("SELECT * FROM prayer_times WHERE is_active=1 ORDER BY id").fetchall()
    stats = []
    for p in prayers:
        count = db.execute(
            "SELECT COUNT(*) FROM attendance WHERE prayer_id=? AND date=?",
            (p['id'], query_date)
        ).fetchone()[0]
        stats.append({
            'prayer_name': p['name'],
            'prayer_name_en': p['name_en'],
            'count': count,
            'total': total_students,
            'percentage': round(count / total_students * 100, 1) if total_students > 0 else 0
        })

    db.close()
    return jsonify({'total_students': total_students, 'prayers': stats})


@app.route('/api/stats/weekly', methods=['GET'])
def get_weekly_stats():
    db = get_db()
    rows = db.execute('''
        SELECT a.date, p.name as prayer_name,
               COUNT(DISTINCT a.student_id) as count
        FROM attendance a
        JOIN prayer_times p ON a.prayer_id = p.id
        WHERE a.date >= date('now', '-7 days')
        GROUP BY a.date, p.name
        ORDER BY a.date
    ''').fetchall()
    db.close()
    return jsonify(dict_from_rows(rows))


@app.route('/api/stats/student/<int:student_id>', methods=['GET'])
def get_student_stats(student_id):
    db = get_db()
    student = db.execute("SELECT * FROM students WHERE id=?", (student_id,)).fetchone()
    if not student:
        db.close()
        return jsonify({'error': 'Student not found'}), 404

    total_days = db.execute("SELECT COUNT(DISTINCT date) FROM attendance").fetchone()[0]
    attended = db.execute(
        "SELECT COUNT(DISTINCT date) FROM attendance WHERE student_id=?", (student_id,)
    ).fetchone()[0]

    prayers_stats = db.execute('''
        SELECT p.name, COUNT(a.id) as count
        FROM prayer_times p
        LEFT JOIN attendance a ON a.prayer_id = p.id AND a.student_id = ?
        WHERE p.is_active = 1
        GROUP BY p.id
    ''', (student_id,)).fetchall()

    db.close()
    return jsonify({
        'student': dict_from_row(student),
        'total_days': total_days,
        'attended': attended,
        'percentage': round(attended / total_days * 100, 1) if total_days > 0 else 0,
        'prayers': dict_from_rows(prayers_stats)
    })


@app.route('/api/stats/top-absent', methods=['GET'])
def get_top_absent():
    days = request.args.get('days', 30, type=int)
    db = get_db()
    rows = db.execute('''
        SELECT s.id, s.name, s.grade, s.barcode,
               COUNT(DISTINCT a.date) as attended_days
        FROM students s
        LEFT JOIN attendance a ON s.id = a.student_id
            AND a.date >= date('now', ?)
        GROUP BY s.id
        ORDER BY attended_days ASC
        LIMIT 10
    ''', (f'-{days} days',)).fetchall()
    db.close()
    return jsonify(dict_from_rows(rows))


# ─── Export API ─────────────────────────────────────────────────

@app.route('/api/export/excel', methods=['GET'])
def export_excel():
    query_date = request.args.get('date', date.today().isoformat())
    db = get_db()

    students = db.execute("SELECT * FROM students ORDER BY name").fetchall()
    prayers = db.execute("SELECT * FROM prayer_times WHERE is_active=1 ORDER BY id").fetchall()

    export_data = []
    for s in students:
        row = {'اسم الطالب': s['name'], 'الباركود': s['barcode'], 'الصف': s['grade']}
        for p in prayers:
            exists = db.execute(
                "SELECT id FROM attendance WHERE student_id=? AND prayer_id=? AND date=?",
                (s['id'], p['id'], query_date)
            ).fetchone()
            row[p['name']] = '✓' if exists else '✗'
        export_data.append(row)

    db.close()
    return jsonify({'data': export_data, 'date': query_date})


@app.route('/api/export/pdf', methods=['GET'])
def export_pdf_data():
    query_date = request.args.get('date', date.today().isoformat())
    db = get_db()

    stats = db.execute('''
        SELECT p.name as prayer_name,
               COUNT(DISTINCT a.student_id) as count
        FROM prayer_times p
        LEFT JOIN attendance a ON a.prayer_id = p.id AND a.date = ?
        WHERE p.is_active = 1
        GROUP BY p.id
    ''', (query_date,)).fetchall()

    total = db.execute("SELECT COUNT(*) FROM students").fetchone()[0]

    db.close()
    return jsonify({
        'date': query_date,
        'total_students': total,
        'prayers': dict_from_rows(stats)
    })


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
