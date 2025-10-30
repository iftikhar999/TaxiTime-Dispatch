# TaxiTime Dispatch Console

This package hosts the new dispatcher workstation for the TaxiTime platform. It is a Vite + React + TypeScript application that consumes the same REST and WebSocket APIs exposed by the backend service (`/api` + Socket.IO namespaces).

## Getting started

```bash
cd frontend/dispatch
npm install
npm run dev
```

The dev server defaults to **http://localhost:3004**. Update `VITE_API_BASE_URL` and `VITE_SOCKET_BASE_URL` in a local `.env` file if your backend is running on a different host.

## Current status

- Job board, driver status grid, zone queue, map view, and job composer panels are scaffolded with Tailwind styling.
- A Socket.IO client (`SocketProvider`) connects to the `/dispatch` namespace once the dispatcher authenticates; connection state is exposed via context.
- `zustand` powers the client-side store; the app loads mock data (`src/data/mockData.ts`) until the REST + socket integration is completed.
- The map uses OpenStreetMap tiles via `react-leaflet`. Driver markers render live positions and tooltips; socket events can update positions via `useDispatchStore`.

### Authentication

- The login screen calls `POST /auth/login` and only admits users with the `DISPATCHER` role. Successful authentication stores the JWT in local storage (`dispatch_token`) and hydrates the Socket.IO client with the dispatcher’s IDs.
- Logging out clears the token and informs the backend via `/auth/logout` before disconnecting the socket.

## Next steps

1. **Authentication / tenancy**
   - Replace the hard-coded dispatcher credentials in `SocketProvider` with tokens from the login response.
   - Gate route access behind proper auth (shared session cookie or JWT).

2. **Real data plumbing**
   - Replace mock setters in `App.tsx` with calls to backend endpoints (`/mobile/dispatcher/jobs`, `/drivers/status`, `/zones`, etc.).
   - Subscribe to socket feeds (`jobCreated`, `jobUpdated`, `driverStatus`, `driverLocationUpdate`) and hydrate the store.

3. **Job creation**
   - Wire `JobComposer` submission to the backend create-job endpoint.
   - Surface fare/tariff calculations and server-side validation errors.

4. **Zone queuing rules**
   - Fetch zone definitions (polygons + queue order) and draw them on the map.
   - Implement queue re-ordering controls and server sync.

5. **Driver interactions**
   - Enable send/offer/assign actions for each job card.
   - Add call/SMS shortcuts and integrate with the voice bridge used by operations.

6. **UI polish**
   - Add dark/light theme switch, responsive handling, and skeleton states for loading conditions.
   - Expand the map overlay to show job routes, POIs, and zone heatmaps (if enabled).

See `src/services/socket.ts` and `src/store/useDispatchStore.ts` for extension points when adding live data flows.
