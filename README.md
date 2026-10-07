# Smart Hostel Room Allocation System

This is a modern digital allocation portal designed for colleges to manage room assignments at scale (~20,000 students). It allows students to form friend groups, lock beds atomically in real-time (BookMyShow-style seat selection), and receive adjacent room cluster suggestions, while giving wardens tools to manage inventory and run Excel reports.

---

## Workspace Architecture

- **`backend/`**: Express + Node backend connecting to MongoDB and Redis caching.
- **`frontend/`**: React + Vite SPA styled using high-fidelity dark/light mode Vanilla CSS.

---

## Performance & Indexing Plan

To ensure sub-millisecond query responses during the high-traffic initial booking rush:

### Primary Mongoose Indexes (configured in models)

1. **`Room.js`**
   - `{ building: 1 }`: Fast searches by hostel building.
   - `{ category: 1 }`: Filters rooms based on eligibility (UG/PG/PhD).
   - `{ floor: 1 }` and `{ building: 1, floor: 1 }`: Speeds up loading the active floor grid map.
   - `{ 'beds.status': 1 }`: Filters open beds for students looking for bookings.
2. **`Hold.js`**
   - `{ studentRef: 1 }`: Quick lookups to see if a student already has a pending lock.
   - `{ roomId: 1, bedNumber: 1 }`: Lock checking for active sessions.
   - `{ expiresAt: 1 }`: TTL index that automatically releases pending holds after 5 minutes.

---

## Concurrency Layer (holds & Redis)

1. **Hold-then-confirm Flow**: Clicking an open bed triggers an atomic hold database lock (`findOneAndUpdate`). If the bed is open, it transitions to `'held'`.
2. **Redis caching**: Holds are cached in Redis (`hold:roomId:bedNumber`) with a 5-minute TTL. This helps intercept requests at the caching layer.
3. **Rollbacks & Cleanup**: If booking checkout fails or expires, the TTL deletes the `Hold` document. A background scanner in `server.js` sweeps and resets orphaned rooms back to `'open'`.

---

## Setup & Running Instructions

### Prerequisites
- Node.js (v18+)
- MongoDB running locally or a cloud URI
- Redis server running locally or a cloud URI

### 1. Start the Backend API
```bash
cd backend
npm install
cp .env.example .env # Customize database URIs
npm run dev
```

### 2. Start the Frontend App
```bash
cd ../frontend
npm install
npm run dev
```
Open `http://localhost:3000` in your web browser.

---

## Warden Credentials Seeding
To access the Warden dashboard, create an account using the Role switch in the registration portal.
