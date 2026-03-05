# M-PESA Split Payments System (Daraja STK Push)

This project implements a minimal booking split-payment flow using Daraja STK Push.

## Implemented backend endpoints

- `POST /api/bookings`
- `POST /api/bookings/:id/split`
- `POST /api/split/participants/:participantId/stk`
- `POST /api/mpesa/callback/stk`
- `GET /api/split/groups/:groupId`

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
