import React, { useEffect, useMemo, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000';
const DEPOSIT_PRESETS = [25, 50, 75];

export function PaymentsCheckout() {
  const [mode, setMode] = useState('FULL');
  const [total, setTotal] = useState(2000);
  const [depositPercent, setDepositPercent] = useState(50);
  const [phone, setPhone] = useState('');
  const [booking, setBooking] = useState(null);
  const [status, setStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const amountDue = useMemo(() => {
    if (mode === 'FULL') return total;
    return Math.ceil((total * depositPercent) / 100);
  }, [mode, total, depositPercent]);

  const remainingBalance = total - amountDue;

  useEffect(() => {
    if (!booking || booking.status === 'CONFIRMED' || booking.status === 'CANCELLED') return;

    const interval = setInterval(async () => {
      const res = await fetch(`${API_BASE}/api/bookings/${booking.id}`);
      if (!res.ok) return;
      const data = await res.json();
      setBooking(data.booking);
      if (data.booking.status === 'CONFIRMED') {
        setStatus(mode === 'FULL' ? 'Payment received. Your slot is confirmed! 🎉' : 'Deposit received. Your slot is held — pay the rest at the turf.');
      } else if (data.booking.status === 'CANCELLED') {
        setStatus('Booking expired before payment was completed.');
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [booking, mode]);

  const requestPayment = async () => {
    setSubmitting(true);
    setStatus('Creating your booking...');
    try {
      const created = await fetch(`${API_BASE}/api/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pitch_id: 1,
          start_time: new Date().toISOString(),
          end_time: new Date(Date.now() + 3600000).toISOString(),
          total_amount: total,
          payment_type: mode,
          deposit_percent: mode === 'DEPOSIT' ? depositPercent : undefined,
          phone
        })
      }).then((r) => r.json());

      if (created.error) {
        setStatus(`Error: ${created.error}`);
        return;
      }

      setBooking(created);
      setStatus('Sending M-Pesa prompt to your phone...');

      const stk = await fetch(`${API_BASE}/api/bookings/${created.id}/stk`, { method: 'POST' }).then((r) => r.json());

      if (!stk.ok) {
        setStatus(`Error: ${stk.error}`);
        return;
      }

      setStatus('Enter your M-Pesa PIN on your phone to complete payment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main style={{ fontFamily: 'sans-serif', maxWidth: 720, margin: '1rem auto' }}>
      <h1>Turf Mafia — Book & Pay</h1>
      <p>Reserve your slot now: pay in full, or lock it in with a deposit and settle the rest at the turf.</p>

      <label>
        <input type="radio" checked={mode === 'FULL'} onChange={() => setMode('FULL')} /> Pay in full
      </label>{' '}
      <label>
        <input type="radio" checked={mode === 'DEPOSIT'} onChange={() => setMode('DEPOSIT')} /> Pay a deposit
      </label>

      <section style={{ marginTop: 16 }}>
        <label style={{ display: 'block', marginBottom: 6 }}>
          Total amount (KES){' '}
          <input type="number" min="1" value={total} onChange={(e) => setTotal(Number(e.target.value) || 0)} />
        </label>

        {mode === 'DEPOSIT' && (
          <div style={{ marginBottom: 6 }}>
            {DEPOSIT_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setDepositPercent(p)}
                style={{ fontWeight: depositPercent === p ? 'bold' : 'normal', marginRight: 6 }}
              >
                {p}%
              </button>
            ))}
            <input
              type="number"
              min="10"
              max="90"
              value={depositPercent}
              onChange={(e) => setDepositPercent(Number(e.target.value) || 0)}
              style={{ width: 60, marginLeft: 6 }}
            />
            %
          </div>
        )}

        <label style={{ display: 'block', marginBottom: 6 }}>
          Phone{' '}
          <input placeholder="2547xxxxxxxx" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>

        <p>
          <strong>Pay now: KES {amountDue}</strong>
          {mode === 'DEPOSIT' && <span> &mdash; remaining balance KES {remainingBalance} due at the turf</span>}
        </p>

        <button onClick={requestPayment} disabled={submitting}>
          {mode === 'FULL' ? 'Pay full amount' : 'Pay deposit'}
        </button>
      </section>

      <p>{status}</p>
      {booking && (
        <p>
          Booking #{booking.id} — status: {booking.status}
        </p>
      )}
    </main>
  );
}
