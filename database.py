import sqlite3
import os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), 'data', 'attendance.db')


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = get_db()
    cursor = conn.cursor()

    cursor.executescript('''
        CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            barcode TEXT UNIQUE NOT NULL,
            grade TEXT DEFAULT '',
            phone TEXT DEFAULT '',
            parent_phone TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS prayer_times (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            name_en TEXT NOT NULL,
            time_start TEXT NOT NULL,
            time_end TEXT NOT NULL,
            is_active INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            prayer_id INTEGER NOT NULL,
            scan_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            date DATE NOT NULL,
            FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
            FOREIGN KEY (prayer_id) REFERENCES prayer_times(id),
            UNIQUE(student_id, prayer_id, date)
        );
    ''')

    cursor.execute("SELECT COUNT(*) FROM prayer_times")
    if cursor.fetchone()[0] == 0:
        default_prayers = [
            ('الفجر', 'Fajr', '04:30', '05:30', 1),
            ('الظهر', 'Dhuhr', '12:00', '13:00', 1),
            ('العصر', 'Asr', '15:00', '16:00', 1),
            ('المغرب', 'Maghrib', '18:00', '19:00', 1),
            ('العشاء', 'Isha', '19:30', '20:30', 1),
        ]
        cursor.executemany(
            "INSERT INTO prayer_times (name, name_en, time_start, time_end, is_active) VALUES (?, ?, ?, ?, ?)",
            default_prayers
        )

    conn.commit()
    conn.close()


def dict_from_row(row):
    if row is None:
        return None
    return dict(row)


def dict_from_rows(rows):
    return [dict(row) for row in rows]
