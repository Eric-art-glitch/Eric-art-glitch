import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Login } from './Login.jsx';
import { PaymentsCheckout } from './payments-checkout.jsx';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000';

function App() {
  const [user, setUser] = useState(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) return null;
    try {
      // Decode payload (not verified on client — server validates on each request)
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.exp * 1000 < Date.now()) { localStorage.removeItem('auth_token'); return null; }
      return { id: payload.userId, phone: payload.phone };
    } catch { return null; }
  });

  function logout() {
    localStorage.removeItem('auth_token');
    setUser(null);
  }

  if (!user) return <Login onLogin={setUser} />;

  return (
    <>
      <div style={{ fontFamily: 'sans-serif', padding: '8px 16px', background: '#f5f5f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Signed in as <strong>{user.phone}</strong></span>
        <button onClick={logout} style={{ padding: '4px 12px' }}>Sign out</button>
      </div>
      <PaymentsCheckout />
    </>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
