import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { db, initDb } from './db.js';
import { pushStk } from './daraja.js';

dotenv.config();
initDb();

const app = express();
app.use(cors());
app.use(express.json());

const MIN_DEPOSIT_PERCENT = 10;
const MAX_DEPOSIT_PERCENT = 90;

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (/^2547\d{8}$/.test(digits)) return digits;
  if (/^07\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  throw new Error('Phone must be 2547XXXXXXXX');
}

function resolveAmountDue(totalAmount, paymentType, depositPercent) {
  if (paymentType === 'FULL') return totalAmount;

  if (
    !Number.isInteger(depositPercent) ||
    depositPercent < MIN_DEPOSIT_PERCENT ||
    depositPercent > MAX_DEPOSIT_PERCENT
  ) {
    throw new Error(`deposit_percent must be an integer between ${MIN_DEPOSIT_PERCENT} and ${MAX_DEPOSIT_PERCENT}`);
  }

  return Math.ceil((totalAmount * depositPercent) / 100);
}

app.post('/api/bookings', (req, res) => {
  const {
    pitch_id,
    start_time,
    end_time,
    total_amount,
    hold_minutes = 15,
    payment_type = 'FULL',
    deposit_percent,
    phone
  } = req.body;

  if (payment_type !== 'FULL' && payment_type !== 'DEPOSIT') {
    return res.status(400).json({ error: "payment_type must be 'FULL' or 'DEPOSIT'" });
  }

  let safePhone;
  let amount_due;
  try {
    safePhone = normalizePhone(phone);
    amount_due = resolveAmountDue(total_amount, payment_type, deposit_percent);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const hold_expires_at = new Date(Date.now() + hold_minutes * 60000).toISOString();
  const result = db.prepare(
    `INSERT INTO bookings
      (pitch_id, start_time, end_time, total_amount, payment_type, deposit_percent, amount_due, phone, hold_expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    pitch_id,
    start_time,
    end_time,
    total_amount,
    payment_type,
    payment_type === 'DEPOSIT' ? deposit_percent : null,
    amount_due,
    safePhone,
    hold_expires_at
  );

  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(booking);
});

app.post('/api/bookings/:id/stk', async (req, res) => {
  const bookingId = Number(req.params.id);
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  if (booking.status !== 'HELD' && booking.status !== 'STK_SENT') {
    return res.status(400).json({ error: `Booking is not awaiting payment (status: ${booking.status})` });
  }

  try {
    const response = await pushStk({
      phone: booking.phone,
      amount: booking.amount_due,
      bookingId: booking.id,
      paymentType: booking.payment_type
    });

    db.prepare("UPDATE bookings SET status = 'STK_SENT', checkout_request_id = ?, merchant_request_id = ? WHERE id = ?")
      .run(response.CheckoutRequestID, response.MerchantRequestID, bookingId);

    res.json({ ok: true, response });
  } catch (error) {
    res.status(502).json({ ok: false, error: error.message });
  }
});

app.post('/api/mpesa/callback/stk', (req, res) => {
  const callback = req.body?.Body?.stkCallback;
  if (!callback?.CheckoutRequestID) return res.status(400).json({ error: 'Missing CheckoutRequestID' });

  const booking = db.prepare('SELECT * FROM bookings WHERE checkout_request_id = ?').get(callback.CheckoutRequestID);
  if (!booking) return res.status(404).json({ error: 'Unknown CheckoutRequestID' });

  const itemMap = Object.fromEntries((callback.CallbackMetadata?.Item || []).map((x) => [x.Name, x.Value]));
  const amount = Number(itemMap.Amount || 0);
  const receipt = itemMap.MpesaReceiptNumber || null;
  const phone = itemMap.PhoneNumber ? String(itemMap.PhoneNumber) : null;

  const exists = receipt ? db.prepare('SELECT id FROM payments WHERE mpesa_receipt = ?').get(receipt) : null;
  if (exists) return res.json({ ok: true, duplicate: true });

  if (callback.ResultCode === 0) {
    if (phone && phone !== booking.phone) {
      return res.status(400).json({ error: 'Phone mismatch' });
    }
    if (amount !== booking.amount_due) {
      db.prepare('INSERT INTO payments (booking_id, amount, mpesa_receipt, result_code, result_desc, raw_callback_json) VALUES (?, ?, ?, ?, ?, ?)')
        .run(booking.id, amount, receipt, callback.ResultCode, 'Amount mismatch', JSON.stringify(req.body));
      return res.status(400).json({ error: 'Amount mismatch' });
    }

    db.prepare("UPDATE bookings SET status = 'CONFIRMED', amount_paid = ? WHERE id = ?").run(amount, booking.id);
    db.prepare('INSERT INTO payments (booking_id, amount, mpesa_receipt, result_code, result_desc, paid_at, raw_callback_json) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(booking.id, amount, receipt, callback.ResultCode, callback.ResultDesc, new Date().toISOString(), JSON.stringify(req.body));
  } else {
    db.prepare("UPDATE bookings SET status = 'HELD' WHERE id = ?").run(booking.id);
    db.prepare('INSERT INTO payments (booking_id, amount, mpesa_receipt, result_code, result_desc, raw_callback_json) VALUES (?, ?, ?, ?, ?, ?)')
      .run(booking.id, amount, receipt, callback.ResultCode, callback.ResultDesc, JSON.stringify(req.body));
  }

  res.json({ ok: true });
});

app.get('/api/bookings/:id', (req, res) => {
  const bookingId = Number(req.params.id);
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  res.json({
    booking,
    remaining_balance: booking.total_amount - booking.amount_paid
  });
});

setInterval(() => {
  const now = new Date().toISOString();
  db.prepare("UPDATE bookings SET status = 'CANCELLED' WHERE status IN ('HELD', 'STK_SENT') AND hold_expires_at < ?")
    .run(now);
}, 30_000);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on ${port}`);
});
