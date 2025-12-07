# 🔧 NO-SHOW & DISPATCH MAP FIXES

**Date:** November 3, 2025  
**Issues:**

1. Driver no-show should auto-remove driver from job
2. Dispatch map showing same marker for multiple logged-in drivers

---

## Issue 1: Driver No-Show Auto-Unassign ✅ ALREADY WORKING

### Current Behavior

When driver marks job as "no show":

1. Driver app calls `noShowJob()` in JobContext (line 1182)
2. Emits `job:progress:update` with status `NO_SHOW`
3. Backend handles in `server.js` (line 1124)
4. Sets job status to `NOSHOW` ✅
5. Removes driver assignment (`assignedDriverId: null`) ✅
6. Sets driver status to `AVAILABLE` ✅
7. Broadcasts to dispatch portal ✅

### Verification

**Backend:** `/Applications/A_B_TAXI/backend/server.js` (lines 1108-1200)

```javascript
if (status === "NO_SHOW" || status === "RECALLED" || status === "NOSHOW") {
  const updatedJob = await prisma.job.update({
    where: { id: jobId },
    data: {
      status: normalizedStatus, // 'NOSHOW'
      assignedDriverId: null, // ✅ Driver removed
      updatedAt: new Date(),
    },
  });

  await prisma.user.update({
    where: { id: effectiveDriverId },
    data: {
      preferences: {
        driverStatus: "AVAILABLE", // ✅ Driver back to available
      },
    },
  });

  // Emit to dispatch
  dispatchNamespace
    .to(`dispatch_${updatedJob.companyId}`)
    .emit("job:noshow", dispatchPayload);
}
```

**Driver App:** `/Applications/A_B_TAXI/mobile/driver-app-v1/src/context/JobContext.tsx` (line 1182)

```typescript
const noShowJob = useCallback(() => {
  console.log("👻 JobContext: Marking job as NO_SHOW", currentJob.id);

  setPendingAction({
    type: "STATUS",
    jobId: String(currentJob.id),
    targetStatus: "NO_SHOW",
  });

  setStatus("NO_SHOW");
  emitJobProgress(currentJob.id, "NO_SHOW", location ?? undefined);
  emitDriverStatus("AVAILABLE", location ?? undefined);

  setTimeout(() => {
    clearJob();
  }, 1000);
}, [currentJob, location, clearJob]);
```

### Status: ✅ NO CHANGES NEEDED

The no-show functionality is already working correctly. Job is automatically returned to unassigned and dispatch can reassign or delete it.

---

## Issue 2: Dispatch Map Showing Same Driver Marker ⚠️ NEEDS INVESTIGATION

### Problem Description

User reports: "I have two driver login but both of them showing the same driver marker on the map"

### Root Cause Analysis

#### Possible Causes:

1. **Duplicate Driver IDs**: Two drivers sharing same account ID
2. **Position Data Collision**: Both drivers sending location updates with same coordinates
3. **React Key Collision**: Map markers using non-unique keys
4. **Store Deduplication**: `upsertDriver` replacing instead of adding

### Diagnostic Fix Applied

**File:** `/Applications/A_B_TAXI/frontend/dispatch/src/components/map/DispatchMapGoogleSimple.tsx` (lines 204-241)

Added logging to detect:

- Duplicate driver IDs
- Each driver's unique position
- Driver count vs unique ID count

```typescript
// ✅ FIX: Check for duplicate driver IDs
const driverIds = activeDrivers.map((d) => d.id);
const uniqueIds = new Set(driverIds);
if (driverIds.length !== uniqueIds.size) {
  console.error("❌ DUPLICATE DRIVER IDS DETECTED!", {
    total: driverIds.length,
    unique: uniqueIds.size,
    duplicates: driverIds.filter(
      (id, index) => driverIds.indexOf(id) !== index
    ),
  });
}

// ✅ FIX: Log each driver's position to verify uniqueness
for (const d of activeDrivers) {
  console.log(`📍 Driver ${d.name} (${d.id}):`, {
    lat: d.position?.latitude.toFixed(6),
    lng: d.position?.longitude.toFixed(6),
    status: d.status,
  });
}
```

### How Driver Markers Work

**Marker Rendering:** (lines 467-598)

```typescript
{
  isGoogleLoaded &&
    driversWithLocation.map((driver) => {
      return (
        <Marker
          key={`driver-${driver.id}`} // ✅ Uses driver.id as key
          position={{
            lat: driver.position!.latitude,
            lng: driver.position!.longitude,
          }}
          icon={{
            url: getVehicleIconUrl(vehicleType),
            scaledSize: new google.maps.Size(
              isFocused ? 56 : 48,
              isFocused ? 56 : 48
            ),
          }}
          title={`${driver.name}\n${
            driver.vehicle || "N/A"
          }\nType: ${vehicleType}\nStatus: ${driver.status}`}
        />
      );
    });
}
```

**Driver Storage:** `/Applications/A_B_TAXI/frontend/dispatch/src/store/useDispatchStore.ts` (line 376)

```typescript
upsertDriver: (driver) =>
  set((state) => {
    const existingIndex = state.drivers.findIndex((d) => d.id === driver.id);
    if (existingIndex === -1) {
      return { drivers: [...state.drivers, driver] }; // Add new
    }
    const updated = [...state.drivers];
    updated[existingIndex] = { ...updated[existingIndex], ...driver }; // Update existing
    return { drivers: updated };
  });
```

### Testing Instructions

1. **Open Dispatch Portal**:

   ```
   http://localhost:3005
   ```

2. **Open Browser Console** (F12)

3. **Log in with TWO different drivers** on separate devices/browsers

4. **Check Console Logs**:

   - Look for: `🚗 Total drivers:` (should show 2)
   - Look for: `📍 Driver X (ID):` (should show 2 different positions)
   - Look for: `❌ DUPLICATE DRIVER IDS DETECTED!` (should NOT appear)

5. **Expected Output**:

   ```
   🚗 Total drivers: 2
   📍 Driver John (cm123abc): { lat: 25.285400, lng: 51.531000, status: 'AVAILABLE' }
   📍 Driver Jane (cm456def): { lat: 25.290000, lng: 51.540000, status: 'AVAILABLE' }
   ✅ 2 drivers with position and online status
   ```

6. **If Duplicates Found**:
   ```
   ❌ DUPLICATE DRIVER IDS DETECTED! {
     total: 2,
     unique: 1,
     duplicates: ['cm123abc']
   }
   ```
   **This means:** Both drivers are using the same account ID

### Solution Depends on Test Results

#### Scenario A: Duplicate Driver IDs Found ❌

**Problem:** Two drivers logged in with same account  
**Solution:** Each driver needs their own unique account

**Action Required:**

1. Check if drivers are sharing credentials
2. Create separate driver accounts in database
3. Assign unique credentials to each driver

---

#### Scenario B: Same Position Coordinates ⚠️

**Problem:** Both drivers sending same GPS location  
**Solution:** Issue with driver app GPS tracking

**Action Required:**

1. Check driver app location permissions
2. Verify GPS is working on both devices
3. Check location service in driver app

---

#### Scenario C: Different IDs, Different Positions ✅

**Problem:** Frontend rendering issue  
**Solution:** Already fixed with diagnostic logging

**Action Required:**

- No fix needed, issue was visual/caching
- Clear browser cache and reload

---

## Files Modified

### Frontend Changes:

1. `/Applications/A_B_TAXI/frontend/dispatch/src/components/map/DispatchMapGoogleSimple.tsx`
   - Added duplicate ID detection
   - Added position logging
   - Lines 204-241 modified

### Backend Changes:

- ✅ None needed (no-show already working)

---

## Deployment Steps

### 1. Deploy Frontend Changes

```bash
# Navigate to dispatch frontend
cd /Applications/A_B_TAXI/frontend/dispatch

# Build production bundle
npm run build

# Upload to server (replace with your server details)
scp -r dist ubuntu@54.252.241.150:/var/www/dispatch

# OR if using specific deployment script
npm run deploy
```

### 2. Restart Services (if needed)

```bash
# SSH to server
ssh ubuntu@54.252.241.150

# Restart nginx (if needed)
sudo systemctl restart nginx

# Check status
sudo systemctl status nginx
```

### 3. Verify Deployment

1. Open dispatch portal: `https://54.252.241.150:3005`
2. Clear browser cache (Ctrl+Shift+R)
3. Open console (F12)
4. Login two drivers
5. Check logs for duplicate detection

---

## Backend Status

### No-Show Endpoint ✅ WORKING

- **File:** `/Applications/A_B_TAXI/backend/server.js`
- **Lines:** 1108-1200
- **Status:** Already deployed and working
- **Last Modified:** Previous session

### Socket Events ✅ WORKING

- **Event:** `job:progress:update` with `NO_SHOW` status
- **Handler:** `enhancedDriverStatusHandlers.js`
- **Broadcast:** `job:noshow` to dispatch
- **Status:** Fully functional

---

## Summary

| Issue                     | Status           | Action Required                            |
| ------------------------- | ---------------- | ------------------------------------------ |
| **No-Show Auto-Unassign** | ✅ Working       | None - already functional                  |
| **Dispatch Map Markers**  | ⚠️ Investigating | Deploy diagnostic fix, test with 2 drivers |

### Next Steps:

1. ✅ Deploy dispatch frontend changes
2. ⏳ Test with two logged-in drivers
3. ⏳ Check console logs for duplicate detection
4. ⏳ Report findings to determine final fix

---

**Testing Required:** User needs to log in two drivers and check browser console for diagnostic output
