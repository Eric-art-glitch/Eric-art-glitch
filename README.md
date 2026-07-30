# Turf Mafia — Pay in Full or Deposit (Daraja STK Push)

This project implements a minimal turf-booking payment flow using Daraja STK Push: pay
the full amount up front, or lock in the slot with a partial deposit and settle the
remaining balance at the turf. Split payments across multiple players are shelved for a
future v2.

## Implemented backend endpoints

- `POST /api/bookings` — create a booking with `payment_type: 'FULL' | 'DEPOSIT'` (and
  `deposit_percent` when depositing); computes the amount due now.
- `POST /api/bookings/:id/stk` — sends a single Daraja STK push for the booking's amount due.
- `POST /api/mpesa/callback/stk` — Daraja callback that confirms or fails the booking.
- `GET /api/bookings/:id` — booking status and remaining balance.

## Run

```bash
npm install
cp .env.example .env
npm run start
```

Frontend checkout skeleton (Vite):

```bash
npm run dev
```
