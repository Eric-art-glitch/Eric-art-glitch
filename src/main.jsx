import React from 'react';
import { createRoot } from 'react-dom/client';
import { PaymentsCheckout } from './payments-checkout.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PaymentsCheckout />
  </React.StrictMode>
);
