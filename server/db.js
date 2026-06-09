import Database from 'better-sqlite3';

const db = new Database('app.db');
db.pragma('journal_mode = WAL');

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pitch_id INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      total_amount INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('HELD', 'CONFIRMED', 'CANCELLED')) DEFAULT 'HELD',
      hold_expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS split_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL,
      total_amount INTEGER NOT NULL,
      split_method TEXT NOT NULL CHECK(split_method IN ('EQUAL', 'CUSTOM')),
      deadline_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('OPEN', 'COMPLETE', 'EXPIRED')) DEFAULT 'OPEN',
      FOREIGN KEY (booking_id) REFERENCES bookings(id)
    );

    CREATE TABLE IF NOT EXISTS split_participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      amount_due INTEGER NOT NULL,
      amount_paid INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK(status IN ('INVITED', 'STK_SENT', 'PAID', 'FAILED', 'EXPIRED')) DEFAULT 'INVITED',
      checkout_request_id TEXT UNIQUE,
      merchant_request_id TEXT,
      FOREIGN KEY (group_id) REFERENCES split_groups(id)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      participant_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      mpesa_receipt TEXT UNIQUE,
      result_code INTEGER NOT NULL,
      result_desc TEXT,
      paid_at TEXT,
      raw_callback_json TEXT NOT NULL,
      FOREIGN KEY (participant_id) REFERENCES split_participants(id)
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT UNIQUE NOT NULL,
      name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS otps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      otp_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

export { db };
