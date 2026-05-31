# ZenoBudget Dashboard

Modern single dashboard web app for:

- Daily routine calendar
- Commission-based income projection
- Manual income entry
- Budget categories and limits
- Expense calculator and tracking
- Account auth with persistent login sessions
- Dynamic user-level commission categories and hourly settings
- Email verification guard + password reset flow
- Recurring commission templates with automatic monthly projections
- Persistent online storage in Firebase Firestore

## Tech Stack

- React + TypeScript + Vite
- Firebase Authentication (email/password sessions) + Firestore (free tier)
- Recharts for dashboard analytics
- date-fns for calendar/date handling

## Run Locally

1. Install dependencies:

```bash
npm install
```

2. Copy env template:

```bash
cp .env.example .env
```

3. Add Firebase values in `.env` (instructions below).

4. Start dev server:

```bash
npm run dev
```

## Free Online Database Setup (Firebase, not Supabase)

1. Create a Firebase project at https://console.firebase.google.com (Spark plan is free).
2. Add a Web App to your Firebase project and copy the web config keys.
3. In Firebase Console:
  - Authentication -> Sign-in method -> enable `Email/Password`
   - Firestore Database -> Create database (production or test mode)
4. Put web config values in `.env` using `.env.example` fields.
5. Apply Firestore rules below.

### Firestore Rules

Use these rules to scope data per authenticated user:

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## Data Persistence Behavior

- Users sign in with email/password.
- Session persistence uses browser local auth state, so login stays active after refresh/reopen.
- Each account reads/writes only its own document tree under `users/{uid}`.

## Firestore Data Structure (Dynamic Per Account)

- `users/{uid}/meta/profile`
- `users/{uid}/commissionCategories/*`
- `users/{uid}/incomes/*`
- `users/{uid}/commissionTemplates/*`
- `users/{uid}/routines/*`
- `users/{uid}/budgets/*`
- `users/{uid}/expenses/*`

## Build

```bash
npm run build
```
