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
      payment_type TEXT NOT NULL CHECK(payment_type IN ('FULL', 'DEPOSIT')) DEFAULT 'FULL',
      deposit_percent INTEGER,
      amount_due INTEGER NOT NULL,
      amount_paid INTEGER NOT NULL DEFAULT 0,
      phone TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('HELD', 'STK_SENT', 'CONFIRMED', 'CANCELLED')) DEFAULT 'HELD',
      hold_expires_at TEXT NOT NULL,
      checkout_request_id TEXT UNIQUE,
      merchant_request_id TEXT
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      mpesa_receipt TEXT UNIQUE,
      result_code INTEGER NOT NULL,
      result_desc TEXT,
      paid_at TEXT,
      raw_callback_json TEXT NOT NULL,
      FOREIGN KEY (booking_id) REFERENCES bookings(id)
    );
  `);
}

export { db };
