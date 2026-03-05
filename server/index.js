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

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (/^2547\d{8}$/.test(digits)) return digits;
  if (/^07\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  throw new Error('Phone must be 2547XXXXXXXX');
}

function splitEqual(total, count) {
  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}

function refreshGroupAndBooking(groupId) {
  const group = db.prepare('SELECT * FROM split_groups WHERE id = ?').get(groupId);
  if (!group) return;

  const paid = db.prepare("SELECT COALESCE(SUM(amount_paid), 0) AS total FROM split_participants WHERE group_id = ? AND status = 'PAID'").get(groupId).total;

  if (paid >= group.total_amount) {
    db.prepare("UPDATE split_groups SET status = 'COMPLETE' WHERE id = ?").run(groupId);
    db.prepare("UPDATE bookings SET status = 'CONFIRMED' WHERE id = ?").run(group.booking_id);
  }
}

app.post('/api/bookings', (req, res) => {
  const { pitch_id, start_time, end_time, total_amount, hold_minutes = 15 } = req.body;
  const hold_expires_at = new Date(Date.now() + hold_minutes * 60000).toISOString();
  const result = db.prepare('INSERT INTO bookings (pitch_id, start_time, end_time, total_amount, hold_expires_at) VALUES (?, ?, ?, ?, ?)')
    .run(pitch_id, start_time, end_time, total_amount, hold_expires_at);
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(booking);
});

app.post('/api/bookings/:id/split', (req, res) => {
  const bookingId = Number(req.params.id);
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  const { players, number_of_players } = req.body;
  let participantInputs = [];
  let split_method = 'EQUAL';

  if (Array.isArray(players) && players.length) {
    participantInputs = players;
    split_method = players.some((p) => p.amount_due != null) ? 'CUSTOM' : 'EQUAL';
  } else if (Number.isInteger(number_of_players) && number_of_players > 0) {
    participantInputs = Array.from({ length: number_of_players }, (_, i) => ({ name: `Player ${i + 1}`, phone: `2547000000${String(i).padStart(2, '0')}` }));
  } else {
    return res.status(400).json({ error: 'Provide players[] or number_of_players' });
  }

  const deadline_at = booking.hold_expires_at;
  const groupResult = db.prepare('INSERT INTO split_groups (booking_id, total_amount, split_method, deadline_at) VALUES (?, ?, ?, ?)')
    .run(bookingId, booking.total_amount, split_method, deadline_at);
  const groupId = Number(groupResult.lastInsertRowid);

  const equalShares = splitEqual(booking.total_amount, participantInputs.length);

  const insertParticipant = db.prepare('INSERT INTO split_participants (group_id, name, phone, amount_due, status) VALUES (?, ?, ?, ?, ?)');

  const participants = participantInputs.map((p, idx) => {
    const amount_due = Number.isInteger(p.amount_due) ? p.amount_due : equalShares[idx];
    const safePhone = normalizePhone(p.phone);
    const result = insertParticipant.run(groupId, p.name || `Player ${idx + 1}`, safePhone, amount_due, 'INVITED');
    return db.prepare('SELECT * FROM split_participants WHERE id = ?').get(result.lastInsertRowid);
  });

  const invite_links = participants.map((p) => ({ participant_id: p.id, url: `/payments/checkout?participant=${p.id}` }));
  const group = db.prepare('SELECT * FROM split_groups WHERE id = ?').get(groupId);

  res.status(201).json({ group, participants, invite_links });
});

app.post('/api/split/participants/:participantId/stk', async (req, res) => {
  const participantId = Number(req.params.participantId);
  const participant = db.prepare('SELECT * FROM split_participants WHERE id = ?').get(participantId);
  if (!participant) return res.status(404).json({ error: 'Participant not found' });

  const group = db.prepare('SELECT * FROM split_groups WHERE id = ?').get(participant.group_id);
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(group.booking_id);

  try {
    const response = await pushStk({
      phone: participant.phone,
      amount: participant.amount_due,
      bookingId: booking.id
    });

    db.prepare("UPDATE split_participants SET status = 'STK_SENT', checkout_request_id = ?, merchant_request_id = ? WHERE id = ?")
      .run(response.CheckoutRequestID, response.MerchantRequestID, participantId);

    res.json({ ok: true, response });
  } catch (error) {
    db.prepare("UPDATE split_participants SET status = 'FAILED' WHERE id = ?").run(participantId);
    res.status(502).json({ ok: false, error: error.message });
  }
});

app.post('/api/mpesa/callback/stk', (req, res) => {
  const callback = req.body?.Body?.stkCallback;
  if (!callback?.CheckoutRequestID) return res.status(400).json({ error: 'Missing CheckoutRequestID' });

  const participant = db.prepare('SELECT * FROM split_participants WHERE checkout_request_id = ?').get(callback.CheckoutRequestID);
  if (!participant) return res.status(404).json({ error: 'Unknown CheckoutRequestID' });

  const itemMap = Object.fromEntries((callback.CallbackMetadata?.Item || []).map((x) => [x.Name, x.Value]));
  const amount = Number(itemMap.Amount || 0);
  const receipt = itemMap.MpesaReceiptNumber || null;
  const phone = itemMap.PhoneNumber ? String(itemMap.PhoneNumber) : null;

  const exists = receipt ? db.prepare('SELECT id FROM payments WHERE mpesa_receipt = ?').get(receipt) : null;
  if (exists) return res.json({ ok: true, duplicate: true });

  if (callback.ResultCode === 0) {
    if (phone && phone !== participant.phone) {
      return res.status(400).json({ error: 'Phone mismatch' });
    }
    if (amount !== participant.amount_due) {
      db.prepare("UPDATE split_participants SET status = 'FAILED' WHERE id = ?").run(participant.id);
      db.prepare('INSERT INTO payments (participant_id, amount, mpesa_receipt, result_code, result_desc, raw_callback_json) VALUES (?, ?, ?, ?, ?, ?)')
        .run(participant.id, amount, receipt, callback.ResultCode, 'Amount mismatch', JSON.stringify(req.body));
      return res.status(400).json({ error: 'Amount mismatch' });
    }

    db.prepare("UPDATE split_participants SET status = 'PAID', amount_paid = ? WHERE id = ?").run(amount, participant.id);
    db.prepare('INSERT INTO payments (participant_id, amount, mpesa_receipt, result_code, result_desc, paid_at, raw_callback_json) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(participant.id, amount, receipt, callback.ResultCode, callback.ResultDesc, new Date().toISOString(), JSON.stringify(req.body));
    refreshGroupAndBooking(participant.group_id);
  } else {
    db.prepare("UPDATE split_participants SET status = 'FAILED' WHERE id = ?").run(participant.id);
    db.prepare('INSERT INTO payments (participant_id, amount, mpesa_receipt, result_code, result_desc, raw_callback_json) VALUES (?, ?, ?, ?, ?, ?)')
      .run(participant.id, amount, receipt, callback.ResultCode, callback.ResultDesc, JSON.stringify(req.body));
  }

  res.json({ ok: true });
});

app.get('/api/split/groups/:groupId', (req, res) => {
  const groupId = Number(req.params.groupId);
  const group = db.prepare('SELECT * FROM split_groups WHERE id = ?').get(groupId);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  const participants = db.prepare('SELECT * FROM split_participants WHERE group_id = ? ORDER BY id').all(groupId);
  const paid_amount = participants.reduce((sum, p) => sum + (p.status === 'PAID' ? p.amount_paid : 0), 0);

  res.json({
    group,
    paid_amount,
    pending_amount: group.total_amount - paid_amount,
    participants
  });
});

setInterval(() => {
  const now = new Date().toISOString();
  const expiredBookings = db.prepare("SELECT id FROM bookings WHERE status = 'HELD' AND hold_expires_at < ?").all(now);
  for (const booking of expiredBookings) {
    db.prepare("UPDATE bookings SET status = 'CANCELLED' WHERE id = ?").run(booking.id);
    db.prepare("UPDATE split_groups SET status = 'EXPIRED' WHERE booking_id = ? AND status = 'OPEN'").run(booking.id);
    db.prepare("UPDATE split_participants SET status = 'EXPIRED' WHERE group_id IN (SELECT id FROM split_groups WHERE booking_id = ?)").run(booking.id);
  }
}, 30_000);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on ${port}`);
});
