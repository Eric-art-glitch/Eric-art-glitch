import React, { useMemo, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000';

export function PaymentsCheckout() {
  const [mode, setMode] = useState('SPLIT');
  const [total, setTotal] = useState(2000);
  const [players, setPlayers] = useState([
    { name: 'Alex', phone: '254712345678' },
    { name: 'Brian', phone: '254722345678' }
  ]);
  const [group, setGroup] = useState(null);
  const [status, setStatus] = useState('');

  const shares = useMemo(() => {
    if (!players.length) return [];
    const base = Math.floor(total / players.length);
    const remainder = total % players.length;
    return players.map((_, i) => base + (i < remainder ? 1 : 0));
  }, [players, total]);

  const addPlayer = () => setPlayers((prev) => [...prev, { name: '', phone: '' }]);

  const requestPayments = async () => {
    setStatus('Creating booking and split...');
    const booking = await fetch(`${API_BASE}/api/bookings`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pitch_id: 1, start_time: new Date().toISOString(), end_time: new Date(Date.now() + 3600000).toISOString(), total_amount: total })
    }).then((r) => r.json());

    const created = await fetch(`${API_BASE}/api/bookings/${booking.id}/split`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ players: players.map((p, i) => ({ ...p, amount_due: shares[i] })) })
    }).then((r) => r.json());

    for (const participant of created.participants) {
      await fetch(`${API_BASE}/api/split/participants/${participant.id}/stk`, { method: 'POST' });
    }

    setGroup(created.group);
    setStatus('STK requests sent.');
  };

  return (
    <main style={{ fontFamily: 'sans-serif', maxWidth: 720, margin: '1rem auto' }}>
      <h1>/payments/checkout</h1>
      <label>
        <input type="radio" checked={mode === 'FULL'} onChange={() => setMode('FULL')} /> Pay full
      </label>{' '}
      <label>
        <input type="radio" checked={mode === 'SPLIT'} onChange={() => setMode('SPLIT')} /> Split
      </label>

      {mode === 'SPLIT' && (
        <section>
          <h3>Players</h3>
          {players.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              <input placeholder="Name" value={p.name} onChange={(e) => setPlayers((prev) => prev.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))} />
              <input placeholder="2547xxxxxxxx" value={p.phone} onChange={(e) => setPlayers((prev) => prev.map((x, idx) => idx === i ? { ...x, phone: e.target.value } : x))} />
              <span>KES {shares[i] || 0}</span>
            </div>
          ))}
          <button onClick={addPlayer}>Add player</button>
          <button onClick={requestPayments}>Send payment requests</button>
        </section>
      )}

      <p>{status}</p>
      {group && <p>Group #{group.id} created. Poll <code>/api/split/groups/{group.id}</code> for progress.</p>}
      <ul>
        <li>✅ Paid</li>
        <li>⏳ Pending (STK sent)</li>
        <li>❌ Failed (Retry)</li>
      </ul>
      <progress max={total} value={0} />
      <p>Hold expires in 12:34</p>
      <button>Cover remaining</button>
    </main>
  );
}
