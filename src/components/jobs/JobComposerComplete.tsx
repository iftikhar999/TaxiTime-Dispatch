import {
    CardElement,
    Elements,
    useElements,
    useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import {
    Accessibility,
    Briefcase,
    Car,
    CreditCard,
    DollarSign,
    Mail,
    MapPin,
    Phone,
    User,
    Users
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useTheme } from "../../contexts/ThemeContext";
import { useDispatchController } from "../../hooks/useDispatchController";
import {
    searchCustomers,
    type Customer as CustomerType,
} from "../../services/customerService";
import {
    calculateDistance as calculateDistanceAPI,
    getLocationSuggestions,
    getPlaceDetails,
    type LocationSuggestion as LocationSuggestionType,
    type PlaceProvider,
} from "../../services/geocodingService";
import { createJob as createJobAPI } from "../../services/jobService";
import {
    createPaymentIntent,
    getDispatchPaymentConfig,
    type DispatchPaymentConfig,
} from "../../services/paymentService";
import {
    detectZone,
    getMapSettings,
    type Zone,
    type ZoneDetectionResult,
    type ZoneTariff,
} from "../../services/zoneService";
import { useDispatchStore } from "../../store/useDispatchStore";
import { isAssignableJobStatus } from "../../utils/jobStatusHelpers";

const GOOGLE_MAPS_API_KEY =
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY ||
  import.meta.env.VITE_GOOGLE_MAP_API_KEY ||
  "";

// const DEFAULT_PLACE_PROVIDER: PlaceProvider = "OPENSTREETMAP";
 const DEFAULT_PLACE_PROVIDER: PlaceProvider = "GOOGLE_MAPS";
interface Customer extends CustomerType {}
interface LocationSuggestion extends LocationSuggestionType {}

interface JobComposerCompleteProps {
  onJobCreated?: () => void;
  editJobData?: any; // Job data to edit
  isEditMode?: boolean; // Whether we're editing or creating
  onJobUpdated?: () => void; // Callback for when job is updated
}

interface JobFormState {
  // Customer
  customerId?: string;
  customerSearch: string;
  passengerName: string;
  phone: string;
  email: string;

  // Locations
  pickupAddress: string;
  pickupLat?: number;
  pickupLng?: number;
  dropoffAddress: string;
  dropoffLat?: number;
  dropoffLng?: number;
  
  // Intermediate stops/waypoints
  stops: Array<{
    address: string;
    latitude?: number;
    longitude?: number;
    order: number;
  }>;

  // Vehicle & Tariff
  vehicleType: string;
  tariffId: string;
  estimatedDistance?: number;
  estimatedFare?: number;
  baseFare?: number;
  distanceFare?: number;
  waitingFare?: number;

  // Job Details
  scheduledFor: "now" | "later";
  scheduledDate?: string;
  scheduledTime?: string;
  notes: string;
  validationCode: string;

  // Requirements
  passengers: number;
  bags: number;
  wheelchairs: number;
  vehiclesNeeded: number;

  // Payment
  paymentMethod: "cash" | "card";
  paymentIntentId?: string;
  currency?: string;

  // Driver Assignment
  driverAssignment: "manual" | "auto" | "unassigned";
  selectedDriverId?: string;
}

interface JobComposerInnerProps extends JobComposerCompleteProps {
  stripeConfig: DispatchPaymentConfig | null;
}

const JobComposerInner: React.FC<JobComposerInnerProps> = ({
  onJobCreated,
  editJobData,
  isEditMode = false,
  onJobUpdated,
  stripeConfig,
}) => {
  const { isDark } = useTheme();
  const stripe = useStripe();
  const elements = useElements();
  const tariffs = useDispatchStore((state) => state.tariffs);
  const drivers = useDispatchStore((state) => state.drivers);
  const updateJob = useDispatchStore((state) => state.updateJob);
  const loading = useDispatchStore((state) => state.loading);
  const jobDraft = useDispatchStore((state) => state.jobDraft);
  const updateJobDraft = useDispatchStore((state) => state.updateJobDraft);
  const clearJobDraft = useDispatchStore((state) => state.clearJobDraft);
  const [placeProvider, setPlaceProvider] = useState<PlaceProvider>(
    DEFAULT_PLACE_PROVIDER
  );
  const [mapProvider, setMapProvider] = useState<
    "GOOGLE_MAPS" | "OPENSTREETMAP"
  >("GOOGLE_MAPS");
  const cardPaymentsEnabled = Boolean(
    stripeConfig?.enabled && stripeConfig.publishableKey
  );

  useEffect(() => {
    if (!cardPaymentsEnabled && form.paymentMethod === "card") {
      handleChange("paymentMethod", "cash");
    }
  }, [cardPaymentsEnabled]);

  const placeProviderLabel = useMemo(
    () => (placeProvider === "GOOGLE_MAPS" ? "Google Places" : "OpenStreetMap"),
    [placeProvider]
  );
  const mapProviderLabel = useMemo(
    () => (mapProvider === "GOOGLE_MAPS" ? "Google Maps" : "OpenStreetMap"),
    [mapProvider]
  );

  useEffect(() => {
    let mounted = true;
    console.log("[JobComposer] Getting map settings...");
    getMapSettings()
      .then((settings) => {
        console.log("[JobComposer] Map settings received:", settings);
        if (!mounted || !settings) {
          return;
        }
        // Force Google Maps regardless of backend settings
        console.log("[JobComposer] Forcing Google Maps providers regardless of backend settings");
        setPlaceProvider("GOOGLE_MAPS");
        setMapProvider("GOOGLE_MAPS");
        console.log("[JobComposer] Final providers set to - Place: GOOGLE_MAPS, Map: GOOGLE_MAPS");
      })
      .catch((error) => {
        console.error("[JobComposer] Failed to load map settings", error);
        // Even on error, ensure we use Google Maps
        console.log("[JobComposer] API failed, using Google Maps as fallback");
        setPlaceProvider("GOOGLE_MAPS");
        setMapProvider("GOOGLE_MAPS");
      });

    return () => {
      mounted = false;
    };
  }, []);

  // Get refresh functions from controller
  const { fetchJobs, fetchJobCounters } = useDispatchController();
  const editJob = useDispatchStore((state) => state.editJob);

  const [form, setForm] = useState<JobFormState>({
    customerSearch: "",
    passengerName: "",
    phone: "",
    email: "",
    pickupAddress: "",
    dropoffAddress: "",
    stops: [], // Initialize empty stops array
    vehicleType: "",
    tariffId: "",
    scheduledFor: "now",
    notes: "",
    validationCode: "",
    passengers: 1,
    bags: 0,
    wheelchairs: 0,
    vehiclesNeeded: 1,
    paymentMethod: "cash",
    driverAssignment: "auto",
  });

  // State for edit mode initialization
  const [isInitializingEdit, setIsInitializingEdit] = useState(false);

  // Initialize form with edit data when in edit mode
  useEffect(() => {
    if (isEditMode && editJobData) {
      setIsInitializingEdit(true);
      
      // COMPREHENSIVE DATA DEBUGGING
      console.log("🚨 [CRITICAL DEBUG] Full editJobData:", JSON.stringify(editJobData, null, 2));
      console.log("🚨 [CRITICAL DEBUG] Requirements object:", JSON.stringify(editJobData.requirements, null, 2));
      console.log("🚨 [CRITICAL DEBUG] Customer object:", JSON.stringify(editJobData.customer, null, 2));
      console.log("🚨 [CRITICAL DEBUG] All possible passenger fields:", {
        'editJobData.passengers': editJobData.passengers,
        'editJobData.requirements?.passengers': editJobData.requirements?.passengers,
        'editJobData.requirements?.passengerCount': editJobData.requirements?.passengerCount,
        'editJobData.passengerCount': editJobData.passengerCount,
        'editJobData.rider?.passengers': editJobData.rider?.passengers,
      });
      console.log("🚨 [CRITICAL DEBUG] All possible email fields:", {
        'editJobData.email': editJobData.email,
        'editJobData.riderEmail': editJobData.riderEmail,
        'editJobData.customer?.email': editJobData.customer?.email,
        'editJobData.requirements?.email': editJobData.requirements?.email,
        'editJobData.passenger?.email': editJobData.passenger?.email,
      });
      console.log("🚨 [CRITICAL DEBUG] All possible bag fields:", {
        'editJobData.bags': editJobData.bags,
        'editJobData.requirements?.bags': editJobData.requirements?.bags,
        'editJobData.requirements?.bagCount': editJobData.requirements?.bagCount,
        'editJobData.bagCount': editJobData.bagCount,
      });
      console.log("🚨 [CRITICAL DEBUG] All possible wheelchair fields:", {
        'editJobData.wheelchairs': editJobData.wheelchairs,
        'editJobData.requirements?.wheelchairs': editJobData.requirements?.wheelchairs,
        'editJobData.requirements?.wheelchairCount': editJobData.requirements?.wheelchairCount,
        'editJobData.wheelchairCount': editJobData.wheelchairCount,
      });
      console.log("🚨 [CRITICAL DEBUG] All possible ride type fields:", {
        'editJobData.scheduledAt': editJobData.scheduledAt,
        'editJobData.scheduledFor': editJobData.scheduledFor,
        'editJobData.scheduledPickupTime': editJobData.scheduledPickupTime,
        'editJobData.isScheduled': editJobData.isScheduled,
        'editJobData.rideType': editJobData.rideType,
        'editJobData.type': editJobData.type,
      });
      
      // Determine driver assignment type
      let driverAssignment: "manual" | "auto" | "unassigned" = "auto";
      let selectedDriverId: string | undefined = undefined;
      
      if (editJobData.assignedDriverId || editJobData.driverId) {
        driverAssignment = "manual";
        selectedDriverId = editJobData.assignedDriverId || editJobData.driverId;
      } else if (isAssignableJobStatus(editJobData.status)) {
        driverAssignment = "unassigned";
      }
      
      // Determine scheduled time
      let scheduledFor: "now" | "later" = "now";
      let scheduledDate: string | undefined = undefined;
      let scheduledTime: string | undefined = undefined;
      
      // Check for scheduled time from multiple possible fields - check fullRawData first!
      const scheduleValue = editJobData.fullRawData?.scheduledAt || 
                           editJobData.scheduledAt || 
                           editJobData.scheduledFor || 
                           editJobData.scheduledPickupTime;
      
      console.log("🕐 [SCHEDULE CHECK] Schedule value:", scheduleValue);
      console.log("🕐 [SCHEDULE CHECK] fullRawData.scheduledAt:", editJobData.fullRawData?.scheduledAt);
      console.log("🕐 [SCHEDULE CHECK] scheduledAt:", editJobData.scheduledAt);
      
      if (scheduleValue) {
        scheduledFor = "later";
        const scheduleDate = new Date(scheduleValue);
        scheduledDate = scheduleDate.toISOString().split('T')[0];
        scheduledTime = scheduleDate.toTimeString().slice(0, 5);
        console.log("🕐 [SCHEDULE CHECK] Set to LATER with date:", scheduledDate, "time:", scheduledTime);
      } else {
        console.log("🕐 [SCHEDULE CHECK] Set to NOW (no schedule value found)");
      }

      // Extract customer name with all possible fallbacks
      const customerFirstName = editJobData.customer?.firstName || "";
      const customerLastName = editJobData.customer?.lastName || "";
      const customerFullName = customerFirstName && customerLastName ? 
        `${customerFirstName} ${customerLastName}`.trim() : 
        customerFirstName || customerLastName || "";
      
      const passengerName = editJobData.requirements?.passengerName || 
                           editJobData.riderName || 
                           editJobData.passengerName || 
                           customerFullName || "";

      const phone = editJobData.requirements?.passengerPhone || 
                   editJobData.riderPhone || 
                   editJobData.phone || 
                   editJobData.customer?.phone || "";

      const email = editJobData.riderEmail || 
                   editJobData.email || 
                   editJobData.customer?.email || "";

      console.log("🔥 [EXTRACTION CHECK] Email extraction:");
      console.log("  - editJobData.riderEmail:", editJobData.riderEmail);
      console.log("  - editJobData.email:", editJobData.email);
      console.log("  - editJobData.customer?.email:", editJobData.customer?.email);
      console.log("  - FINAL email value:", email);

      // Extract requirements with proper type conversion
      const passengers = Number(editJobData.requirements?.passengers || editJobData.passengers || 1);
      const bags = Number(editJobData.requirements?.bags || editJobData.bags || 0);
      const wheelchairs = Number(editJobData.requirements?.wheelchairs || editJobData.wheelchairs || 0);
      const vehiclesNeeded = Number(editJobData.requirements?.vehiclesNeeded || editJobData.vehiclesNeeded || 1);

      console.log("🔥 [EXTRACTION CHECK] Requirements extraction:");
      console.log("  - passengers:", passengers, "(from", editJobData.requirements?.passengers, "or", editJobData.passengers, ")");
      console.log("  - bags:", bags, "(from", editJobData.requirements?.bags, "or", editJobData.bags, ")");
      console.log("  - wheelchairs:", wheelchairs, "(from", editJobData.requirements?.wheelchairs, "or", editJobData.wheelchairs, ")");
      console.log("  - vehiclesNeeded:", vehiclesNeeded, "(from", editJobData.requirements?.vehiclesNeeded, "or", editJobData.vehiclesNeeded, ")");

      const newFormData = {
        customerId: editJobData.customerId,
        customerSearch: passengerName,
        passengerName,
        phone,
        email,
        pickupAddress: editJobData.pickupAddress || "",
        dropoffAddress: editJobData.dropoffAddress || "",
        stops: editJobData.stops || editJobData.requirements?.stops || [], // Load existing stops
        pickupLat: editJobData.pickupLocation?.latitude || editJobData.pickupLat || editJobData.pickupLatitude,
        pickupLng: editJobData.pickupLocation?.longitude || editJobData.pickupLng || editJobData.pickupLongitude,
        dropoffLat: editJobData.dropoffLocation?.latitude || editJobData.dropoffLat || editJobData.dropoffLatitude,
        dropoffLng: editJobData.dropoffLocation?.longitude || editJobData.dropoffLng || editJobData.dropoffLongitude,
        vehicleType: editJobData.vehicleType || editJobData.requirements?.vehicleType || "",
        tariffId: editJobData.requirements?.tariffId || editJobData.tariffId || editJobData.tariff?.id || "",
        scheduledFor,
        scheduledDate,
        scheduledTime,
        notes: editJobData.requirements?.notes || editJobData.notes || "",
        validationCode: editJobData.validationCode || "",
        passengers,
        bags,
        wheelchairs,
        vehiclesNeeded,
        paymentMethod: (editJobData.paymentMethod?.toLowerCase() || "cash") as "cash" | "card",
        driverAssignment,
        selectedDriverId,
        estimatedFare: editJobData.estimatedPrice || editJobData.fareEstimate || editJobData.estimatedFare,
        baseFare: editJobData.requirements?.fareBreakdown?.base || editJobData.fareBreakdown?.base || editJobData.baseFare,
        distanceFare: editJobData.requirements?.fareBreakdown?.distance || editJobData.fareBreakdown?.distance || editJobData.distanceFare,
        waitingFare: editJobData.requirements?.fareBreakdown?.waiting || editJobData.fareBreakdown?.waiting || editJobData.waitingFare,
        estimatedDistance: editJobData.estimatedDistance,
        currency: editJobData.requirements?.currency || editJobData.currency || "USD",
      };

      console.log("[JobComposer] NEW FORM DATA TO SET:", {
        passengerName,
        phone,
        email,
        passengers,
        bags,
        wheelchairs,
        vehiclesNeeded,
        tariffId: newFormData.tariffId,
        estimatedFare: newFormData.estimatedFare,
        currency: newFormData.currency,
        customerId: newFormData.customerId,
        fullNewFormData: newFormData
      });

      console.log("🔥 [BEFORE setForm] newFormData object:", newFormData);
      
      setForm(newFormData);

      console.log("🔥 [AFTER setForm] Verifying form state was set...");
      
      // Use setTimeout to check if form state was actually updated
      setTimeout(() => {
        console.log("🔥 [FORM STATE CHECK] Current form state after setForm:");
        console.log("  - email:", form.email);
        console.log("  - passengers:", form.passengers);
        console.log("  - bags:", form.bags);
        console.log("  - wheelchairs:", form.wheelchairs);
        console.log("  - scheduledFor:", form.scheduledFor);
      }, 100);

      console.log("[JobComposer] Form populated with values:", {
        customerId: newFormData.customerId,
        passengerName: newFormData.passengerName,
        phone: newFormData.phone,
        email: newFormData.email,
        passengers: newFormData.passengers,
        bags: newFormData.bags,
        wheelchairs: newFormData.wheelchairs,
        vehiclesNeeded: newFormData.vehiclesNeeded,
        tariffId: newFormData.tariffId,
        notes: newFormData.notes,
        estimatedFare: newFormData.estimatedFare,
        currency: newFormData.currency
      });

      // Wait a bit then allow other effects to run
      setTimeout(() => {
        setIsInitializingEdit(false);
      }, 500);

      // Also update jobDraft for map visualization
      if (editJobData.pickupLocation && editJobData.dropoffLocation) {
        updateJobDraft({
          pickup: {
            address: editJobData.pickupAddress || "",
            latitude: editJobData.pickupLocation.latitude,
            longitude: editJobData.pickupLocation.longitude,
          },
          dropoff: {
            address: editJobData.dropoffAddress || "",
            latitude: editJobData.dropoffLocation.latitude,
            longitude: editJobData.dropoffLocation.longitude,
          }
        });
      } else if (editJobData.pickupLat && editJobData.pickupLng && editJobData.dropoffLat && editJobData.dropoffLng) {
        updateJobDraft({
          pickup: {
            address: editJobData.pickupAddress || "",
            latitude: editJobData.pickupLat,
            longitude: editJobData.pickupLng,
          },
          dropoff: {
            address: editJobData.dropoffAddress || "",
            latitude: editJobData.dropoffLat,
            longitude: editJobData.dropoffLng,
          }
        });
      }

      console.log("[JobComposer] Form populated with edit data - Driver assignment:", driverAssignment, selectedDriverId);
    }
  }, [isEditMode, editJobData, updateJobDraft]);

  // Force form re-render when form state changes (debugging aid)
  useEffect(() => {
    console.log("[JobComposer] Current form state:", form);
  }, [form.passengers, form.bags, form.wheelchairs, form.vehiclesNeeded, form.passengerName, form.phone, form.email]);

  // Dropdown states
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [showPickupDropdown, setShowPickupDropdown] = useState(false);
  const [showDropoffDropdown, setShowDropoffDropdown] = useState(false);
  const [showDriverDropdown, setShowDriverDropdown] = useState(false);

  // Search results
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [pickupSuggestions, setPickupSuggestions] = useState<
    LocationSuggestion[]
  >([]);
  const [dropoffSuggestions, setDropoffSuggestions] = useState<
    LocationSuggestion[]
  >([]);
  
  // Stop autocomplete state
  const [stopSuggestions, setStopSuggestions] = useState<Record<number, LocationSuggestion[]>>({});
  const [activeStopIndex, setActiveStopIndex] = useState<number | null>(null);

  // Selected tariff details
  const [selectedTariff, setSelectedTariff] = useState<any>(null);

  // Zone detection
  const [detectedZone, setDetectedZone] = useState<Zone | null>(null);
  const [zoneTariffs, setZoneTariffs] = useState<ZoneTariff[]>([]);
  const [detectingZone, setDetectingZone] = useState(false);

  useEffect(() => {
    if (form.pickupLat && form.pickupLng) {
      const current = jobDraft?.pickup;
      if (
        !current ||
        current.latitude !== form.pickupLat ||
        current.longitude !== form.pickupLng ||
        current.address !== form.pickupAddress
      ) {
        updateJobDraft({
          pickup: {
            address: form.pickupAddress,
            latitude: form.pickupLat,
            longitude: form.pickupLng,
          },
        });
      }
    } else if (jobDraft?.pickup) {
      updateJobDraft({ pickup: undefined });
    }
  }, [
    form.pickupAddress,
    form.pickupLat,
    form.pickupLng,
    jobDraft?.pickup,
    updateJobDraft,
  ]);

  useEffect(() => {
    if (form.dropoffLat && form.dropoffLng) {
      const current = jobDraft?.dropoff;
      if (
        !current ||
        current.latitude !== form.dropoffLat ||
        current.longitude !== form.dropoffLng ||
        current.address !== form.dropoffAddress
      ) {
        updateJobDraft({
          dropoff: {
            address: form.dropoffAddress,
            latitude: form.dropoffLat,
            longitude: form.dropoffLng,
          },
        });
      }
    } else if (jobDraft?.dropoff) {
      updateJobDraft({ dropoff: undefined });
    }
  }, [
    form.dropoffAddress,
    form.dropoffLat,
    form.dropoffLng,
    jobDraft?.dropoff,
    updateJobDraft,
  ]);

  useEffect(() => {
    if (
      form.pickupLat &&
      form.pickupLng &&
      form.dropoffLat &&
      form.dropoffLng
    ) {
      const existing = jobDraft?.routePath;
      const isSame =
        existing &&
        existing.length === 2 &&
        existing[0].lat === form.pickupLat &&
        existing[0].lng === form.pickupLng &&
        existing[1].lat === form.dropoffLat &&
        existing[1].lng === form.dropoffLng;

      if (!isSame) {
        updateJobDraft({
          routePath: [
            { lat: form.pickupLat, lng: form.pickupLng },
            { lat: form.dropoffLat, lng: form.dropoffLng },
          ],
        });
      }
    } else if (jobDraft?.routePath?.length) {
      updateJobDraft({ routePath: undefined });
    }
  }, [
    form.pickupLat,
    form.pickupLng,
    form.dropoffLat,
    form.dropoffLng,
    jobDraft?.routePath,
    updateJobDraft,
  ]);

  useEffect(() => {
    if (
      !form.pickupLat &&
      !form.pickupLng &&
      !form.dropoffLat &&
      !form.dropoffLng &&
      jobDraft
    ) {
      clearJobDraft();
    }
  }, [
    form.pickupLat,
    form.pickupLng,
    form.dropoffLat,
    form.dropoffLng,
    jobDraft,
    clearJobDraft,
  ]);

  useEffect(() => {
    setPickupSuggestions([]);
    setDropoffSuggestions([]);
  }, [placeProvider]);

  // Set selectedTariff when form.tariffId changes (important for edit mode)
  useEffect(() => {
    if (form.tariffId && tariffs.length > 0) {
      const found = tariffs.find(t => t.id === form.tariffId || t.identifier === form.tariffId);
      if (found) {
        setSelectedTariff(found);
        console.log("[JobComposer] Selected tariff set for edit mode:", found);
      }
    } else if (form.tariffId && zoneTariffs.length > 0) {
      const found = zoneTariffs.find(zt => 
        (zt.tariffId === form.tariffId) || 
        (zt.tariff?.id === form.tariffId) || 
        (zt.tariff?.name === form.tariffId)
      );
      if (found) {
        setSelectedTariff(found.tariff || found);
        console.log("[JobComposer] Selected zone tariff set for edit mode:", found);
      }
    } else {
      setSelectedTariff(null);
    }
  }, [form.tariffId, tariffs, zoneTariffs]);

  // Additional useEffect to handle tariff matching by name when ID is not available
  useEffect(() => {
    if (!isInitializingEdit && isEditMode && editJobData && editJobData.tariffName && !form.tariffId && tariffs.length > 0) {
      const foundByName = tariffs.find(t => t.name === editJobData.tariffName);
      if (foundByName) {
        setForm(prev => ({ ...prev, tariffId: foundByName.id || foundByName.identifier || "" }));
        setSelectedTariff(foundByName);
        console.log("[JobComposer] Tariff matched by name for edit mode:", foundByName);
      }
    }
  }, [isEditMode, editJobData, tariffs, form.tariffId, isInitializingEdit]);

  // Auto-select first vehicle type and tariff as defaults (for new jobs only)
  useEffect(() => {
    if (!isEditMode && !isInitializingEdit) {
      // Set default vehicle type if not set
      if (!form.vehicleType) {
        setForm(prev => ({ ...prev, vehicleType: "SEDAN" }));
      }
      
      // Set default tariff if not set and tariffs are available
      if (!form.tariffId && tariffs.length > 0) {
        const defaultTariff = tariffs[0];
        const tariffId = defaultTariff.id || defaultTariff.identifier || "";
        if (tariffId) {
          setForm(prev => ({ ...prev, tariffId }));
          setSelectedTariff(defaultTariff);
          console.log("[JobComposer] Auto-selected first tariff as default:", defaultTariff);
        }
      }
    }
  }, [isEditMode, isInitializingEdit, tariffs, form.vehicleType, form.tariffId]);

  const handleChange = (field: keyof JobFormState, value: any) => {
    console.log(`[JobComposer] handleChange: ${field} = ${value}`);
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // Customer Search
  const handleCustomerSearch = async (query: string) => {
    handleChange("customerSearch", query);
    if (query.length < 2) {
      setCustomerResults([]);
      setShowCustomerDropdown(false);
      return;
    }

    try {
      const customers = await searchCustomers(query);
      setCustomerResults(customers);
      setShowCustomerDropdown(customers.length > 0);
    } catch (error) {
      console.error("Customer search failed:", error);
      toast.error("Failed to search customers");
      setCustomerResults([]);
    }
  };

  // Select Customer
  const selectCustomer = (customer: Customer) => {
    setForm((prev) => ({
      ...prev,
      customerId: customer.id,
      customerSearch: customer.name,
      passengerName: customer.name,
      phone: customer.phone,
      email: customer.email,
    }));
    setShowCustomerDropdown(false);
    toast.success(`Customer ${customer.name} selected`);
  };

  // Location Autocomplete - Beast Mode Edition
  const handlePickupSearch = async (query: string) => {
    console.log("[JobComposer] 🚀 BEAST MODE - Pickup search started:", { 
      query, 
      placeProvider, 
      length: query.length 
    });
    
    handleChange("pickupAddress", query);
    if (query.length < 3) {
      setPickupSuggestions([]);
      setShowPickupDropdown(false);
      return;
    }

    try {
      console.log("[JobComposer] 🌍 Calling enhanced getLocationSuggestions with:", { query, placeProvider });
      const suggestions = await getLocationSuggestions(query, placeProvider, {
        language: "en",
      });
      console.log("[JobComposer] ✅ Received suggestions:", suggestions);
      setPickupSuggestions(suggestions);
      setShowPickupDropdown(suggestions.length > 0);
    } catch (error) {
      console.error("[JobComposer] ❌ Pickup autocomplete failed:", error);
      toast.error("Failed to load location suggestions");
      setPickupSuggestions([]);
    }
  };

  const handleDropoffSearch = async (query: string) => {
    console.log("[JobComposer] 🚀 BEAST MODE - Dropoff search started:", { 
      query, 
      placeProvider, 
      length: query.length 
    });
    
    handleChange("dropoffAddress", query);
    if (query.length < 3) {
      setDropoffSuggestions([]);
      setShowDropoffDropdown(false);
      return;
    }

    try {
      console.log("[JobComposer] 🌍 Calling enhanced getLocationSuggestions with:", { query, placeProvider });
      const suggestions = await getLocationSuggestions(query, placeProvider, {
        language: "en",
      });
      setDropoffSuggestions(suggestions);
      setShowDropoffDropdown(suggestions.length > 0);
    } catch (error) {
      console.error("Dropoff autocomplete failed:", error);
      toast.error("Failed to load location suggestions");
      setDropoffSuggestions([]);
    }
  };

  // Select Location
  const selectPickupLocation = async (location: LocationSuggestion) => {
    try {
      // Fetch place details to get coordinates
      const details = await getPlaceDetails(location, placeProvider);
      setForm((prev) => ({
        ...prev,
        pickupAddress: details.formattedAddress ?? details.address,
        pickupLat: details.lat,
        pickupLng: details.lng,
      }));
      setShowPickupDropdown(false);
      setPickupSuggestions([]);
      toast.success("Pickup location set");

      // Detect zone for pickup location
      await detectPickupZone(details.lat, details.lng);
    } catch (error) {
      console.error("Failed to get place details:", error);
      toast.error("Failed to set pickup location");
    }
  };

  const selectDropoffLocation = async (location: LocationSuggestion) => {
    try {
      // Fetch place details to get coordinates
      const details = await getPlaceDetails(location, placeProvider);
      setForm((prev) => ({
        ...prev,
        dropoffAddress: details.formattedAddress ?? details.address,
        dropoffLat: details.lat,
        dropoffLng: details.lng,
      }));
      setShowDropoffDropdown(false);
      setDropoffSuggestions([]);
      toast.success("Dropoff location set");
    } catch (error) {
      console.error("Failed to get place details:", error);
      toast.error("Failed to set dropoff location");
    }
  };

  // Stop Autocomplete Search
  const handleStopSearch = async (query: string, index: number) => {
    // Update the stop address in form
    const newStops = [...form.stops];
    newStops[index] = { ...newStops[index], address: query };
    handleChange('stops', newStops);
    setActiveStopIndex(index);

    if (query.length < 3) {
      setStopSuggestions(prev => ({ ...prev, [index]: [] }));
      return;
    }

    try {
      const suggestions = await getLocationSuggestions(query, placeProvider, {
        language: "en",
      });
      setStopSuggestions(prev => ({ ...prev, [index]: suggestions }));
    } catch (error) {
      console.error("Stop autocomplete failed:", error);
      setStopSuggestions(prev => ({ ...prev, [index]: [] }));
    }
  };

  // Select Stop Location from Suggestions
  const selectStopLocation = async (location: LocationSuggestion, index: number) => {
    try {
      const details = await getPlaceDetails(location, placeProvider);
      const newStops = [...form.stops];
      newStops[index] = {
        ...newStops[index],
        address: details.formattedAddress ?? details.address,
        latitude: details.lat,
        longitude: details.lng,
      };
      handleChange('stops', newStops);
      setStopSuggestions(prev => ({ ...prev, [index]: [] }));
      setActiveStopIndex(null);
      toast.success(`Stop ${index + 1} set`);
    } catch (error) {
      console.error("Failed to get stop place details:", error);
      toast.error("Failed to set stop location");
    }
  };

  // Detect Zone for Pickup Location
  const detectPickupZone = async (lat: number, lng: number) => {
    try {
      setDetectingZone(true);
      const result: ZoneDetectionResult = await detectZone(lat, lng);

      if (result.zone) {
        setDetectedZone(result.zone);
        setZoneTariffs(result.tariffs);

        // Auto-select default tariff if available
        if (result.defaultTariff) {
          setForm((prev) => ({
            ...prev,
            tariffId: result.defaultTariff!.tariffId,
          }));
          setSelectedTariff(result.defaultTariff.tariff);
          toast.success(`Zone detected: ${result.zone.name}`);
        } else if (result.tariffs.length > 0) {
          // Use first tariff if no default
          setForm((prev) => ({
            ...prev,
            tariffId: result.tariffs[0].tariffId,
          }));
          setSelectedTariff(result.tariffs[0].tariff);
          toast.success(`Zone detected: ${result.zone.name}`);
        } else {
          toast(
            `Zone detected: ${result.zone.name}, but no tariffs available`,
            {
              icon: "ℹ️",
            }
          );
        }
      } else {
        // No zone detected, clear zone state
        setDetectedZone(null);
        setZoneTariffs([]);
        toast("No zone detected for this location", { icon: "ℹ️" });
      }
    } catch (error) {
      console.error("Zone detection failed:", error);
      // toast.error("Failed to detect zone"); // Silent failure, not critical
      setDetectedZone(null);
      setZoneTariffs([]);
    } finally {
      setDetectingZone(false);
    }
  };

  // Calculate Fare when locations and tariff are set
  useEffect(() => {
    if (
      !isInitializingEdit &&
      form.pickupLat &&
      form.pickupLng &&
      form.dropoffLat &&
      form.dropoffLng &&
      form.tariffId
    ) {
      calculateFare();
    }
  }, [form.pickupLat, form.dropoffLat, form.tariffId, isInitializingEdit]);

  const calculateFare = async () => {
    try {
      // Calculate distance using Google Distance Matrix API
      const distanceResult = await calculateDistanceAPI(
        { lat: form.pickupLat!, lng: form.pickupLng! },
        { lat: form.dropoffLat!, lng: form.dropoffLng! }
      );

      const distance = distanceResult.distance;
      const duration = distanceResult.duration;

      const tariff = tariffs.find(
        (t) => (t.id || t.identifier) === form.tariffId
      );
      if (!tariff) return;

      // Use actual tariff values from the selected tariff
      const baseFare = tariff.baseFare || 5.0;
      const perKm = tariff.perKm || 2.5;
      // perMinute is for waiting time, NOT trip duration
      // Waiting fare is only calculated during the actual ride when driver waits
      // For estimates, we don't include waiting fare

      const distanceFare = distance * perKm;
      // No waiting fare in estimates - it's calculated during the actual ride
      const totalFare = baseFare + distanceFare;

      setForm((prev) => ({
        ...prev,
        estimatedDistance: distance,
        baseFare,
        distanceFare,
        waitingFare: 0, // No waiting fare in estimates
        estimatedFare: totalFare,
        currency: tariff.currency || prev.currency || "USD",
      }));

      setSelectedTariff(tariff);
    } catch (error) {
      console.error("Fare calculation failed:", error);
      toast.error("Failed to calculate fare");
    }
  };

  // Reverse Locations
  const reverseLocations = () => {
    const nextPickupLat = form.dropoffLat;
    const nextPickupLng = form.dropoffLng;
    const nextDropoffLat = form.pickupLat;
    const nextDropoffLng = form.pickupLng;

    setForm((prev) => ({
      ...prev,
      pickupAddress: prev.dropoffAddress,
      pickupLat: prev.dropoffLat,
      pickupLng: prev.dropoffLng,
      dropoffAddress: prev.pickupAddress,
      dropoffLat: prev.pickupLat,
      dropoffLng: prev.pickupLng,
    }));

    if (nextPickupLat && nextPickupLng) {
      detectPickupZone(nextPickupLat, nextPickupLng);
    } else {
      setDetectedZone(null);
      setZoneTariffs([]);
    }

    toast.success("Locations reversed");
  };

  // Process Card Payment
  const [processingPayment, setProcessingPayment] = useState(false);

  const processCardPayment = useCallback(async (): Promise<string | null> => {
    if (form.paymentMethod !== "card") {
      return null;
    }

    if (!cardPaymentsEnabled) {
      toast.error("Card payments are not enabled for this company.");
      return null;
    }

    if (!stripe || !elements) {
      toast.error("Stripe is not ready yet. Please try again in a moment.");
      return null;
    }

    if (!form.estimatedFare || form.estimatedFare <= 0) {
      toast.error("Unable to process payment without a valid fare estimate.");
      return null;
    }

    const amount = Number(form.estimatedFare);
    const currency = (form.currency || "USD").toLowerCase();

    setProcessingPayment(true);
    try {
      const intent = await createPaymentIntent({
        amount,
        currency,
        description: `Dispatch job for ${form.passengerName || "customer"}`,
        metadata: {
          passengerName: form.passengerName || "",
          phone: form.phone || "",
        },
      });

      const card = elements.getElement(CardElement);
      if (!card) {
        throw new Error("Card details not found. Please re-enter the card.");
      }

      const confirmation = await stripe.confirmCardPayment(
        intent.clientSecret,
        {
          payment_method: {
            card,
            billing_details: {
              name: form.passengerName || undefined,
              phone: form.phone || undefined,
              email: form.email || undefined,
            },
          },
        }
      );

      if (confirmation.error) {
        throw confirmation.error;
      }

      toast.success("Payment processed successfully!");
      card.clear();
      return confirmation.paymentIntent?.id ?? intent.paymentIntentId;
    } catch (error) {
      console.error("Card payment error", error);
      const message =
        (error as any)?.message || "Payment failed. Please try again.";
      toast.error(message);
      return null;
    } finally {
      setProcessingPayment(false);
    }
  }, [
    cardPaymentsEnabled,
    elements,
    form.currency,
    form.email,
    form.estimatedFare,
    form.passengerName,
    form.paymentMethod,
    form.phone,
    stripe,
  ]);

  // Clear Form
  const clearForm = () => {
    setForm({
      customerSearch: "",
      passengerName: "",
      phone: "",
      email: "",
      pickupAddress: "",
      dropoffAddress: "",
      stops: [], // Clear stops
      vehicleType: "",
      tariffId: "",
      scheduledFor: "now",
      notes: "",
      validationCode: "",
      passengers: 1,
      bags: 0,
      wheelchairs: 0,
      vehiclesNeeded: 1,
      paymentMethod: "cash",
      currency: undefined,
      driverAssignment: "auto",
    });
    setCustomerResults([]);
    setPickupSuggestions([]);
    setDropoffSuggestions([]);
    setDetectedZone(null);
    setZoneTariffs([]);
    clearJobDraft();
    const cardElement = elements?.getElement(CardElement);
    cardElement?.clear();
  };

  // Submit Job
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    // Validation - Only pickup location is required
    // Dropoff, tariff, and customer details are optional
    if (!form.pickupAddress) {
      toast.error("Pickup address is required.");
      return;
    }

    if (!form.pickupLat || !form.pickupLng) {
      toast.error(
        "Please select a valid pickup location from the suggestions."
      );
      return;
    }

    // Optional validation warnings (not blocking)
    // Tariff is optional - if not selected, backend should use default
    // Customer details are optional
    // Dropoff is optional

    let paymentIntentId: string | null = null;
    if (form.paymentMethod === "card") {
      paymentIntentId = await processCardPayment();
      if (!paymentIntentId) {
        return;
      }
    }

    const loadingToast = toast.loading(isEditMode ? "Updating job..." : "Creating job...");

    try {
      // Prepare job payload with enhanced customer handling
      // ✅ FIX: When "now" is selected, send null to clear scheduled time
      const scheduledDateTime = 
        form.scheduledFor === "later" &&
        form.scheduledDate &&
        form.scheduledTime
          ? new Date(`${form.scheduledDate}T${form.scheduledTime}`)
          : null; // Send null instead of undefined to clear scheduled time
      
      const jobPayload = {
        customerId: form.customerId || undefined,
        pickupAddress: form.pickupAddress,
        pickupLat: form.pickupLat,
        pickupLng: form.pickupLng,
        dropoffAddress: form.dropoffAddress,
        dropoffLat: form.dropoffLat,
        dropoffLng: form.dropoffLng,
        // Intermediate stops/waypoints
        stops: form.stops.length > 0 ? form.stops.map((s, i) => ({ ...s, order: i + 1 })) : undefined,
        // Job source - DISPATCH for jobs created from dispatch panel
        source: 'DISPATCH',
        passengerName: form.passengerName,
        phone: form.phone,
        email: form.email || undefined,
        tariffId: form.tariffId,
        notes: form.notes || undefined,
        // ✅ FIX: Backend expects 'scheduledTime' for CREATE and 'scheduledFor' for UPDATE
        // Send null (not undefined) to clear scheduled time when changing to "now"
        scheduledTime: scheduledDateTime, // For create endpoint
        scheduledFor: scheduledDateTime, // For update endpoint
        passengers: form.passengers,
        bags: form.bags,
        wheelchairs: form.wheelchairs,
        vehiclesNeeded: form.vehiclesNeeded,
        paymentMethod: form.paymentMethod,
        paymentIntentId: paymentIntentId ?? undefined,
        currency: form.currency,
        estimatedFare: form.estimatedFare,
        estimatedDistance: form.estimatedDistance,
        baseFare: form.baseFare,
        distanceFare: form.distanceFare,
        waitingFare: form.waitingFare,
        driverAssignment: form.driverAssignment,
        driverId:
          form.driverAssignment === "manual"
            ? form.selectedDriverId
            : undefined,
      };

      // Debug logging for job creation/update
      console.log("[JobComposer] Submitting job payload:", {
        isEditMode,
        jobId: isEditMode ? editJobData?.id : 'new',
        customerId: jobPayload.customerId,
        passengerName: jobPayload.passengerName,
        scheduledDateTime: scheduledDateTime?.toISOString(),
        scheduledFor: form.scheduledFor,
        requirements: {
          passengers: jobPayload.passengers,
          bags: jobPayload.bags,
          wheelchairs: jobPayload.wheelchairs,
          vehiclesNeeded: jobPayload.vehiclesNeeded,
        },
        tariffId: jobPayload.tariffId,
        fullPayload: jobPayload
      });

      let response;
      if (isEditMode && editJobData) {
        // Update existing job
        console.log("[JobComposer] Updating job:", editJobData.id, "with payload:", jobPayload);
        await editJob(editJobData.id, jobPayload);
        response = { message: "Job updated successfully!" };
        
        // Force refresh the specific job in the store
        console.log("[JobComposer] Job update completed, refreshing store...");
      } else {
        // Create new job(s)
        const vehicleCount = form.vehiclesNeeded || 1;
        
        if (vehicleCount > 1) {
          // Create multiple jobs for multiple vehicles
          const jobPromises = [];
          for (let i = 0; i < vehicleCount; i++) {
            const vehicleJobPayload = {
              ...jobPayload,
              vehiclesNeeded: 1, // Each job is for one vehicle
              notes: `${jobPayload.notes || ""} (Vehicle ${i + 1} of ${vehicleCount})`.trim(),
            };
            jobPromises.push(createJobAPI(vehicleJobPayload));
          }
          
          const responses = await Promise.all(jobPromises);
          
          // Update store with all new jobs
          responses.forEach((response, index) => {
            if (response.data) {
              const newJob = {
                id: response.data.id || response.data.rideId,
                reference: response.data.rideId || response.data.id,
                pickupAddress: form.pickupAddress,
                dropoffAddress: form.dropoffAddress,
                status: (response.data.status || "UNASSIGNED") as any,
                requestedAt: new Date().toISOString(),
                riderName: form.passengerName,
                paymentMethod: form.paymentMethod,
                driverId: response.data.driverId,
                fareEstimate: form.estimatedFare,
                notes: `${form.notes || ""} (Vehicle ${index + 1} of ${vehicleCount})`.trim(),
                passengers: form.passengers,
                bags: form.bags,
                wheelchairs: form.wheelchairs,
                vehiclesNeeded: 1,
                scheduledFor: jobPayload.scheduledFor?.toISOString(),
                isScheduled: !!jobPayload.scheduledFor,
                pickupLocation: {
                  latitude: form.pickupLat!,
                  longitude: form.pickupLng!,
                  address: form.pickupAddress,
                },
                dropoffLocation: {
                  latitude: form.dropoffLat!,
                  longitude: form.dropoffLng!,
                  address: form.dropoffAddress,
                },
                routePath: [
                  { lat: form.pickupLat!, lng: form.pickupLng! },
                  { lat: form.dropoffLat!, lng: form.dropoffLng! },
                ],
                driverTrail: [],
              };
              updateJob(newJob);
            }
          });
          
          response = { 
            message: `${vehicleCount} jobs created successfully for multiple vehicles!` 
          };
        } else {
          // Create single job
          response = await createJobAPI(jobPayload);

          // Update the store with the new job
          if (response.data) {
            const newJob = {
              id: response.data.id || response.data.rideId,
              reference: response.data.rideId || response.data.id,
              pickupAddress: form.pickupAddress,
              dropoffAddress: form.dropoffAddress,
              status: (response.data.status || "UNASSIGNED") as any,
              requestedAt: new Date().toISOString(),
              riderName: form.passengerName,
              paymentMethod: form.paymentMethod,
              driverId: response.data.driverId,
              fareEstimate: form.estimatedFare,
              notes: form.notes,
              passengers: form.passengers,
              bags: form.bags,
              wheelchairs: form.wheelchairs,
              vehiclesNeeded: form.vehiclesNeeded,
              scheduledAt: scheduledDateTime?.toISOString(),
              scheduledFor: scheduledDateTime?.toISOString(),
              isScheduled: !!scheduledDateTime,
              pickupLocation: {
                latitude: form.pickupLat!,
                longitude: form.pickupLng!,
                address: form.pickupAddress,
              },
              dropoffLocation: {
                latitude: form.dropoffLat!,
                longitude: form.dropoffLng!,
                address: form.dropoffAddress,
              },
              routePath: [
                { lat: form.pickupLat!, lng: form.pickupLng! },
                { lat: form.dropoffLat!, lng: form.dropoffLng! },
              ],
              driverTrail: [],
            };
            updateJob(newJob);
          }
        }
      }

      toast.success(response.message || (isEditMode ? "Job updated successfully!" : "Job created successfully!"), {
        id: loadingToast,
      });

      clearForm();

      // Refresh jobs list and counters
      fetchJobs();
      fetchJobCounters();

      // Close the panel after successful creation/update
      if (isEditMode && onJobUpdated) {
        onJobUpdated();
      } else if (onJobCreated) {
        onJobCreated();
      }
    } catch (error: any) {
      console.error(isEditMode ? "Failed to update job" : "Failed to create job", error);
      
      // Enhanced error logging
      console.error("Error details:", {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
        isEditMode,
        formData: {
          customerId: form.customerId,
          passengerName: form.passengerName,
          tariffId: form.tariffId,
          requirements: {
            passengers: form.passengers,
            bags: form.bags,
            wheelchairs: form.wheelchairs,
            vehiclesNeeded: form.vehiclesNeeded
          }
        }
      });
      
      const errorMessage =
        error.response?.data?.message ||
        error.response?.data?.error ||
        error.message ||
        (isEditMode ? "Failed to update job. Please try again." : "Failed to create job. Please try again.");
      toast.error(errorMessage, { id: loadingToast });
    }
  };

  // Get active drivers
  const activeDrivers = drivers.filter(
    (d) => d.status === "AVAILABLE" || d.status === "BUSY"
  );

  return (
    <div className={`flex flex-col h-full ${isDark ? 'bg-slate-900' : 'bg-white'}`}>
      <form onSubmit={handleSubmit} className="flex-1 p-3 space-y-2 text-xs">
        {/* Row 1: Pickup & Dropoff side by side */}
        <div className="grid grid-cols-2 gap-2">
          <div className="relative">
            <label className={`block text-[10px] font-medium mb-0.5 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>Pickup *</label>
            <MapPin className="absolute left-2 top-[22px] text-blue-500 w-3 h-3 z-10" />
            <input
              type="text"
              placeholder="Pickup location"
              value={form.pickupAddress}
              onChange={(e) => handlePickupSearch(e.target.value)}
              onFocus={() => pickupSuggestions.length > 0 && setShowPickupDropdown(true)}
              required
              className={`w-full pl-7 pr-2 py-1.5 border rounded text-xs focus:ring-1 focus:ring-blue-500 ${isDark ? 'bg-slate-800 border-slate-600 text-slate-200 placeholder-slate-500' : 'border-gray-300'}`}
            />
            {showPickupDropdown && pickupSuggestions.length > 0 && (
              <div className={`absolute z-50 w-full mt-0.5 border rounded shadow-lg max-h-32 overflow-y-auto ${isDark ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-300'}`}>
                {pickupSuggestions.map((location) => (
                  <button key={location.id} type="button" onClick={() => selectPickupLocation(location)}
                    className={`w-full px-2 py-1 text-left text-xs border-b ${isDark ? 'hover:bg-slate-700 border-slate-700 text-slate-200' : 'hover:bg-blue-50 border-gray-100'}`}>
                    {location.description}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="relative">
            <label className={`block text-[10px] font-medium mb-0.5 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>Dropoff</label>
            <MapPin className="absolute left-2 top-[22px] text-green-500 w-3 h-3 z-10" />
            <input
              type="text"
              placeholder="Dropoff (optional)"
              value={form.dropoffAddress}
              onChange={(e) => handleDropoffSearch(e.target.value)}
              onFocus={() => dropoffSuggestions.length > 0 && setShowDropoffDropdown(true)}
              className={`w-full pl-7 pr-2 py-1.5 border rounded text-xs focus:ring-1 focus:ring-blue-500 ${isDark ? 'bg-slate-800 border-slate-600 text-slate-200 placeholder-slate-500' : 'border-gray-300'}`}
            />
            {showDropoffDropdown && dropoffSuggestions.length > 0 && (
              <div className={`absolute z-50 w-full mt-0.5 border rounded shadow-lg max-h-32 overflow-y-auto ${isDark ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-300'}`}>
                {dropoffSuggestions.map((location) => (
                  <button key={location.id} type="button" onClick={() => selectDropoffLocation(location)}
                    className={`w-full px-2 py-1 text-left text-xs border-b ${isDark ? 'hover:bg-slate-700 border-slate-700 text-slate-200' : 'hover:bg-blue-50 border-gray-100'}`}>
                    {location.description}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Intermediate Stops Section */}
        <div className={`border border-dashed rounded p-2 ${isDark ? 'border-purple-700 bg-purple-900/30' : 'border-purple-300 bg-purple-50/50'}`}>
          <div className="flex items-center justify-between mb-1">
            <span className={`text-[10px] font-medium ${isDark ? 'text-purple-400' : 'text-purple-700'}`}>Intermediate Stops ({form.stops.length})</span>
            <button
              type="button"
              onClick={() => {
                // Only allow adding stops if there's a dropoff address
                if (!form.dropoffAddress) {
                  toast.error("Please set a dropoff location first");
                  return;
                }
                const newStop = {
                  address: '',
                  order: form.stops.length + 1,
                };
                handleChange('stops', [...form.stops, newStop]);
              }}
              disabled={!form.dropoffAddress}
              className={`text-[10px] px-2 py-0.5 rounded ${form.dropoffAddress ? 'bg-purple-600 text-white hover:bg-purple-700' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
            >
              + Add Stop
            </button>
          </div>
          {form.stops.length > 0 && (
            <div className="space-y-1.5">
              {form.stops.map((stop, index) => (
                <div key={`stop-${index}-${stop.order}`} className="relative flex items-center gap-1">
                  <span className="text-[10px] text-purple-600 font-bold w-4">{index + 1}.</span>
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      placeholder={`Stop ${index + 1} address`}
                      value={stop.address}
                      onChange={(e) => handleStopSearch(e.target.value, index)}
                      onFocus={() => setActiveStopIndex(index)}
                      onBlur={() => setTimeout(() => setActiveStopIndex(null), 200)}
                      className={`w-full px-2 py-1 border rounded text-xs focus:ring-1 focus:ring-purple-500 ${isDark ? 'bg-slate-800 border-slate-600 text-slate-200 placeholder-slate-500' : 'border-purple-200'}`}
                    />
                    {/* Stop Suggestions Dropdown */}
                    {activeStopIndex === index && stopSuggestions[index]?.length > 0 && (
                      <div className={`absolute z-50 w-full mt-0.5 border rounded shadow-lg max-h-32 overflow-y-auto ${isDark ? 'bg-slate-800 border-slate-600' : 'bg-white border-purple-300'}`}>
                        {stopSuggestions[index].map((location) => (
                          <button
                            key={location.id}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              selectStopLocation(location, index);
                            }}
                            className={`w-full px-2 py-1 text-left text-xs border-b ${isDark ? 'hover:bg-slate-700 border-slate-700 text-slate-200' : 'hover:bg-purple-50 border-gray-100'}`}
                          >
                            {location.description}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const newStops = form.stops.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i + 1 }));
                      handleChange('stops', newStops);
                      // Clean up suggestions
                      setStopSuggestions(prev => {
                        const updated = { ...prev };
                        delete updated[index];
                        return updated;
                      });
                    }}
                    className="text-red-500 hover:text-red-700 text-xs px-1"
                    title="Remove stop"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          {form.stops.length === 0 && (
            <p className={`text-[9px] italic ${isDark ? 'text-purple-400' : 'text-purple-500'}`}>
              {form.dropoffAddress 
                ? "No intermediate stops. Click \"+ Add Stop\" to add waypoints between pickup and dropoff."
                : "Set a dropoff location first, then you can add intermediate stops."}
            </p>
          )}
        </div>

        {/* Row 2: Vehicle Type, Tariff, Now/Later */}
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className={`block text-[10px] font-medium mb-0.5 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>Vehicle</label>
            <select value={form.vehicleType} onChange={(e) => handleChange("vehicleType", e.target.value)}
              className={`w-full px-2 py-1.5 border rounded text-xs ${isDark ? 'bg-slate-800 border-slate-600 text-slate-200' : 'border-gray-300 bg-white'}`}>
              <option value="SEDAN">Sedan</option>
              <option value="SUV">SUV</option>
              <option value="VAN">Van</option>
              <option value="LUXURY">Luxury</option>
            </select>
          </div>
          <div>
            <label className={`block text-[10px] font-medium mb-0.5 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>Tariff</label>
            <select value={form.tariffId} onChange={(e) => handleChange("tariffId", e.target.value)}
              className={`w-full px-2 py-1.5 border rounded text-xs ${isDark ? 'bg-slate-800 border-slate-600 text-slate-200' : 'border-gray-300 bg-white'}`}>
              {(zoneTariffs.length > 0 ? zoneTariffs : tariffs).map((item: any) => {
                const tariff = item.tariff || item;
                const tariffId = item.tariffId || item.id || item.identifier;
                return <option key={tariffId} value={tariffId}>{tariff.name ?? "Tariff"}</option>;
              })}
            </select>
          </div>
          <div>
            <label className={`block text-[10px] font-medium mb-0.5 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>When</label>
            <div className="flex gap-1">
              <button type="button" onClick={() => handleChange("scheduledFor", "now")}
                className={`flex-1 py-1 rounded text-[10px] font-medium ${form.scheduledFor === "now" ? "bg-blue-600 text-white" : isDark ? "bg-slate-700 text-slate-300" : "bg-gray-100"}`}>
                Now
              </button>
              <button type="button" onClick={() => handleChange("scheduledFor", "later")}
                className={`flex-1 py-1 rounded text-[10px] font-medium ${form.scheduledFor === "later" ? "bg-blue-600 text-white" : isDark ? "bg-slate-700 text-slate-300" : "bg-gray-100"}`}>
                Later
              </button>
            </div>
          </div>
        </div>

        {/* Row 2b: Date/Time if Later */}
        {form.scheduledFor === "later" && (
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={form.scheduledDate || ""} onChange={(e) => handleChange("scheduledDate", e.target.value)}
              min={new Date().toISOString().split("T")[0]} className={`px-2 py-1 border rounded text-xs ${isDark ? 'bg-slate-800 border-slate-600 text-slate-200' : 'border-gray-300'}`} />
            <input type="time" value={form.scheduledTime || ""} onChange={(e) => handleChange("scheduledTime", e.target.value)}
              className={`px-2 py-1 border rounded text-xs ${isDark ? 'bg-slate-800 border-slate-600 text-slate-200' : 'border-gray-300'}`} />
          </div>
        )}

        {/* Row 3: Customer Name & Phone */}
        <div className="grid grid-cols-2 gap-2">
          <div className="relative">
            <User className={`absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 ${isDark ? 'text-slate-500' : 'text-gray-400'}`} />
            <input type="text" placeholder="Passenger name" value={form.passengerName}
              onChange={(e) => handleChange("passengerName", e.target.value)}
              className={`w-full pl-7 pr-2 py-1.5 border rounded text-xs ${isDark ? 'bg-slate-800 border-slate-600 text-slate-200 placeholder-slate-500' : 'border-gray-300'}`} />
          </div>
          <div className="relative">
            <Phone className={`absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 ${isDark ? 'text-slate-500' : 'text-gray-400'}`} />
            <input type="tel" placeholder="Phone" value={form.phone}
              onChange={(e) => handleChange("phone", e.target.value)}
              className={`w-full pl-7 pr-2 py-1.5 border rounded text-xs ${isDark ? 'bg-slate-800 border-slate-600 text-slate-200 placeholder-slate-500' : 'border-gray-300'}`} />
          </div>
        </div>

        {/* Row 4: Email & Notes */}
        <div className="grid grid-cols-2 gap-2">
          <div className="relative">
            <Mail className={`absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 ${isDark ? 'text-slate-500' : 'text-gray-400'}`} />
            <input type="email" placeholder="Email" value={form.email}
              onChange={(e) => handleChange("email", e.target.value)}
              className={`w-full pl-7 pr-2 py-1.5 border rounded text-xs ${isDark ? 'bg-slate-800 border-slate-600 text-slate-200 placeholder-slate-500' : 'border-gray-300'}`} />
          </div>
          <input type="text" placeholder="Notes / Instructions" value={form.notes}
            onChange={(e) => handleChange("notes", e.target.value)}
            className={`w-full px-2 py-1.5 border rounded text-xs ${isDark ? 'bg-slate-800 border-slate-600 text-slate-200 placeholder-slate-500' : 'border-gray-300'}`} />
        </div>

        {/* Row 5: Requirements (Passengers, Bags, Wheelchairs, Vehicles) */}
        <div className="grid grid-cols-4 gap-2">
          <div className="text-center">
            <label className={`block text-[10px] ${isDark ? 'text-slate-500' : 'text-gray-500'}`}><Users className="w-3 h-3 inline" /> Pass</label>
            <input type="number" min="1" value={form.passengers}
              onChange={(e) => handleChange("passengers", parseInt(e.target.value) || 1)}
              className={`w-full py-1 border rounded text-xs text-center ${isDark ? 'bg-slate-800 border-slate-600 text-slate-200' : 'border-gray-300'}`} />
          </div>
          <div className="text-center">
            <label className={`block text-[10px] ${isDark ? 'text-slate-500' : 'text-gray-500'}`}><Briefcase className="w-3 h-3 inline" /> Bags</label>
            <input type="number" min="0" value={form.bags}
              onChange={(e) => handleChange("bags", parseInt(e.target.value) || 0)}
              className={`w-full py-1 border rounded text-xs text-center ${isDark ? 'bg-slate-800 border-slate-600 text-slate-200' : 'border-gray-300'}`} />
          </div>
          <div className="text-center">
            <label className={`block text-[10px] ${isDark ? 'text-slate-500' : 'text-gray-500'}`}><Accessibility className="w-3 h-3 inline" /> WC</label>
            <input type="number" min="0" value={form.wheelchairs}
              onChange={(e) => handleChange("wheelchairs", parseInt(e.target.value) || 0)}
              className={`w-full py-1 border rounded text-xs text-center ${isDark ? 'bg-slate-800 border-slate-600 text-slate-200' : 'border-gray-300'}`} />
          </div>
          <div className="text-center">
            <label className={`block text-[10px] ${isDark ? 'text-slate-500' : 'text-gray-500'}`}><Car className="w-3 h-3 inline" /> Veh</label>
            <input type="number" min="1" value={form.vehiclesNeeded}
              onChange={(e) => handleChange("vehiclesNeeded", parseInt(e.target.value) || 1)}
              className={`w-full py-1 border rounded text-xs text-center ${isDark ? 'bg-slate-800 border-slate-600 text-slate-200' : 'border-gray-300'}`} />
          </div>
        </div>

        {/* Row 6: Payment & Driver Assignment */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={`block text-[10px] font-medium mb-0.5 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>Payment</label>
            <div className="flex gap-1">
              <button type="button" onClick={() => handleChange("paymentMethod", "cash")}
                className={`flex-1 py-1 rounded text-[10px] font-medium flex items-center justify-center gap-1 ${form.paymentMethod === "cash" ? "bg-green-600 text-white" : isDark ? "bg-slate-700 text-slate-300" : "bg-gray-100"}`}>
                <DollarSign className="w-3 h-3" /> Cash
              </button>
              <button type="button" disabled={!cardPaymentsEnabled} onClick={() => cardPaymentsEnabled && handleChange("paymentMethod", "card")}
                className={`flex-1 py-1 rounded text-[10px] font-medium flex items-center justify-center gap-1 ${form.paymentMethod === "card" ? "bg-blue-600 text-white" : isDark ? "bg-slate-700 text-slate-300" : "bg-gray-100"} ${!cardPaymentsEnabled ? "opacity-50" : ""}`}>
                <CreditCard className="w-3 h-3" /> Card
              </button>
            </div>
          </div>
          <div>
            <label className={`block text-[10px] font-medium mb-0.5 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>Driver</label>
            <div className="flex gap-1">
              <button type="button" onClick={() => { handleChange("driverAssignment", "auto"); handleChange("selectedDriverId", undefined); }}
                className={`flex-1 py-1 rounded text-[10px] font-medium ${form.driverAssignment === "auto" ? "bg-blue-600 text-white" : isDark ? "bg-slate-700 text-slate-300" : "bg-gray-100"}`}>
                Auto
              </button>
              <button type="button" onClick={() => handleChange("driverAssignment", "manual")}
                className={`flex-1 py-1 rounded text-[10px] font-medium ${form.driverAssignment === "manual" ? "bg-blue-600 text-white" : isDark ? "bg-slate-700 text-slate-300" : "bg-gray-100"}`}>
                Manual
              </button>
              <button type="button" onClick={() => { handleChange("driverAssignment", "unassigned"); handleChange("selectedDriverId", undefined); }}
                className={`flex-1 py-1 rounded text-[10px] font-medium ${form.driverAssignment === "unassigned" ? "bg-orange-600 text-white" : isDark ? "bg-slate-700 text-slate-300" : "bg-gray-100"}`}>
                None
              </button>
            </div>
          </div>
        </div>

        {/* Manual Driver Selector */}
        {form.driverAssignment === "manual" && (
          <select value={form.selectedDriverId || ""} onChange={(e) => handleChange("selectedDriverId", e.target.value)}
            className={`w-full px-2 py-1.5 border rounded text-xs ${isDark ? 'bg-slate-800 border-slate-600 text-slate-200' : 'border-gray-300 bg-white'}`}>
            <option value="">Select Driver</option>
            {activeDrivers.map((driver: any) => (
              <option key={driver.id} value={driver.id}>{driver.name} - {driver.status}</option>
            ))}
          </select>
        )}

        {/* Card Element if card payment */}
        {form.paymentMethod === "card" && cardPaymentsEnabled && (
          <div className={`p-2 rounded border ${isDark ? 'bg-slate-800 border-slate-600' : 'bg-gray-50'}`}>
            <CardElement options={{ style: { base: { fontSize: "12px", color: isDark ? '#e2e8f0' : '#1f2937' } } }} />
          </div>
        )}

        {/* Fare Display */}
        {form.estimatedFare && (
          <div className={`flex justify-between items-center px-2 py-1 rounded text-xs ${isDark ? 'bg-blue-900/30' : 'bg-blue-50'}`}>
            <span className={isDark ? 'text-slate-400' : 'text-gray-600'}>Est. Fare: <strong className="text-blue-500">${form.estimatedFare.toFixed(2)}</strong></span>
            {form.estimatedDistance && <span className={isDark ? 'text-slate-500' : 'text-gray-500'}>{form.estimatedDistance.toFixed(1)} km</span>}
          </div>
        )}

        {/* Zone Info */}
        {detectedZone && (
          <div className={`text-[10px] px-2 py-1 rounded ${isDark ? 'text-slate-500 bg-slate-800' : 'text-gray-500 bg-gray-50'}`}>
            Zone: <span className="font-medium">{detectedZone.name}</span>
          </div>
        )}
      </form>

      {/* Footer Actions - Compact */}
      <div className={`border-t px-3 py-2 flex items-center justify-between gap-2 ${isDark ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-gray-50'}`}>
        <button type="button" onClick={clearForm}
          className={`px-3 py-1.5 border rounded text-xs font-medium ${isDark ? 'border-slate-600 text-slate-400 bg-slate-700 hover:bg-slate-600' : 'border-gray-300 text-gray-600 bg-white hover:bg-gray-50'}`}>
          Clear
        </button>
        <button type="submit" onClick={handleSubmit} disabled={loading || processingPayment}
          className="px-4 py-1.5 rounded text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
          {loading || processingPayment ? "..." : isEditMode ? "Update" : "Create Job"}
        </button>
      </div>
    </div>
  );
};

const JobComposerComplete: React.FC<JobComposerCompleteProps> = (props) => {
  const [stripeConfig, setStripeConfig] =
    useState<DispatchPaymentConfig | null>(null);

  useEffect(() => {
    let mounted = true;
    getDispatchPaymentConfig()
      .then((config) => {
        if (mounted) {
          setStripeConfig(config);
        }
      })
      .catch((error) => {
        console.error("Failed to load dispatch payment config", error);
        if (mounted) {
          setStripeConfig({ enabled: false, publishableKey: null });
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const stripePromise = useMemo(() => {
    if (stripeConfig?.enabled && stripeConfig.publishableKey) {
      return loadStripe(stripeConfig.publishableKey);
    }
    return null;
  }, [stripeConfig?.enabled, stripeConfig?.publishableKey]);

  return (
    <Elements stripe={stripePromise}>
      <JobComposerInner {...props} stripeConfig={stripeConfig} />
    </Elements>
  );
};

export default JobComposerComplete;
