export const AdminUser = {
  CREATE_USER: '/api/admin/driver/createUser',
  GET_USER_LIST: '/api/admin/driver/getUsers',
  GET_ONLINE_DRIVER_LIST: '/api/dispatch/drivers',
  DELETE_USER: (userId: string) => `/api/admin/driver/deleteUser/${userId}`,
  UPDATE_USER: (userId: string) => `/api/admin/driver/updateUser/${userId}`
};

export const VehicleManagement = {
  CREATE_VEHICLE: '/api/vehicles/create_vehicle',
  GET_ALL_VEHICLE_LIST: '/api/vehicles/get_vehicle_list',
  GET_SINGLE_VEHICLE: (vehicleId: string) => `/api/vehicles/get_vehicle/${vehicleId}`,
  UPDATE_VEHICLE: (vehicleId: string) => `/api/vehicles/update_vehicle/${vehicleId}`,
  DELETE_VEHICLE: (vehicleId: string) => `/api/vehicles/delete_vehicle/${vehicleId}`,
  VEHICLE_ASSIGN_TO_DRIVER: '/api/driver-vehicles/assign',
  DRIVER_ALL_ASSIGN_VEHICLES: (driverId: string) =>
    `/api/driver-vehicles/driver/${driverId}/vehicles`,
  GET_DRIVERS_BY_VEHICLES: (vehicleId: string) =>
    `/api/driver-vehicles/vehicle/${vehicleId}/drivers`,
  REMOVED_ASSIGN_VEHICLE_FROM_DRIVER: (driverId: string, vehicleId: string) =>
    `/api/driver-vehicles/unassign/driver/${driverId}/vehicle/${vehicleId}`
};

export const ZoneManagement = {
  CREATE_ZONE: '/api/admin/zones/createZone',
  GET_ALL_ZONES: '/api/dispatch/zones',
  GET_SINGLE_ZONE: (id: string) => `/api/admin/zones/getSingleZone/${id}`,
  UPDATE_ZONE: (id: string) => `/api/admin/zones/updateZone/${id}`,
  DELETE_ZONE: (id: string) => `/api/admin/zones/deleteZone/${id}`,
  DETECT_ZONE: '/api/admin/zones/detect'
};

export const TariffManagement = {
  CREATE_TARIFF: '/api/tariffs',
  GET_ALL_TARIFFS: '/api/dispatch/tariffs',
  GET_SINGLE_TARIFF: (id: string) => `/api/tariffs/${id}`,
  UPDATE_TARIFF: (id: string) => `/api/tariffs/${id}`,
  DELETE_TARIFF: (id: string) => `/api/tariffs/${id}`
};

export const RideManagement = {
  CREATE_RIDE_BY_DISPATCHER: '/api/dispatch/jobs',
  CANCEL_RIDE: (jobId: string) => `/api/dispatch/jobs/${jobId}/cancel`,
  job_take: (jobId: string) => `/api/dispatch/jobs/${jobId}/assign`,
  GET_DRIVER_ACTIVE_RIDE: '/api/dispatch/jobs',
  GET_PENDING_RIDES: '/api/dispatch/jobs?status=PENDING',
  AllJobStatusCount: '/api/dispatch/jobs/counters',
  CHANGE_RIDE_STATUS: (rideId: string) =>
    `/api/dispatch/jobs/${rideId}/status`,
  ASSIGNED_JOB_TO_DRIVER: (rideId: string) =>
    `/api/dispatch/jobs/${rideId}/assign`,
  GET_STRIPE_CREATE_PAYMENT_INTENT: '/api/rider/ride/create-payment-intent',
  CREATE_NFC_PAYMENT_INTENT: '/api/rider/ride/create-nfc-payment-intent',
  GET_STRIPE_SCAN_CREATE_PAYMENT_INTENT: '/api/rider/ride/scan-create-payment-intent'
};

export const VehicleTypeManagement = {
  CREATE_VEHICLE_TYPE: '/api/vehicle-type',
  GET_ALL_VEHICLE_TYPES: '/api/dispatch/vehicle-types',
  GET_VEHICLE_TYPE_BY_ID: (id: string) => `/api/vehicle-type/${id}`,
  UPDATE_VEHICLE_TYPE: (id: string) => `/api/vehicle-type/${id}`,
  DELETE_VEHICLE_TYPE: (id: string) => `/api/vehicle-type/${id}`
};
