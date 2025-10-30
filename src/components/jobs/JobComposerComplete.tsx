import {
    CardElement,
    Elements,
    useElements,
    useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import {
    Accessibility,
    ArrowLeftRight,
    Briefcase,
    Car,
    ChevronDown,
    CreditCard,
    DollarSign,
    Mail,
    MapPin,
    Phone,
    Search,
    User,
    Users,
    X,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
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

  // Tariff & Pricing
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
      } else if (editJobData.status === "UNASSIGNED") {
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
        pickupLat: editJobData.pickupLocation?.latitude || editJobData.pickupLat || editJobData.pickupLatitude,
        pickupLng: editJobData.pickupLocation?.longitude || editJobData.pickupLng || editJobData.pickupLongitude,
        dropoffLat: editJobData.dropoffLocation?.latitude || editJobData.dropoffLat || editJobData.dropoffLatitude,
        dropoffLng: editJobData.dropoffLocation?.longitude || editJobData.dropoffLng || editJobData.dropoffLongitude,
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
      const perMinute = tariff.perMinute || 0.5;

      const distanceFare = distance * perKm;
      const waitingFare = duration * perMinute;
      const totalFare = baseFare + distanceFare + waitingFare;

      setForm((prev) => ({
        ...prev,
        estimatedDistance: distance,
        baseFare,
        distanceFare,
        waitingFare,
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

    // Validation
    if (!form.pickupAddress || !form.dropoffAddress) {
      toast.error("Pick up and drop off addresses are required.");
      return;
    }

    if (!form.passengerName || !form.phone) {
      toast.error("Passenger name and phone are required.");
      return;
    }

    if (!form.tariffId) {
      toast.error("Please select a tariff.");
      return;
    }

    if (
      !form.pickupLat ||
      !form.pickupLng ||
      !form.dropoffLat ||
      !form.dropoffLng
    ) {
      toast.error(
        "Please select valid pickup and dropoff locations from the suggestions."
      );
      return;
    }

    if (!form.estimatedDistance || !form.estimatedFare) {
      toast.error(
        "Unable to calculate fare. Please check your locations and tariff."
      );
      return;
    }

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
    <div className="flex h-full flex-col bg-white border-l border-gray-200">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-white">
        <h2 className="text-lg font-semibold text-gray-900">
          {isEditMode ? "Edit Job" : "Create New Job"}
        </h2>
        {isEditMode && editJobData && (
          <p className="text-sm text-gray-500">
            Job ID: {editJobData.reference}
          </p>
        )}
      </div>

      {/* Scrollable Form Content */}
      <div className="flex-1 overflow-y-auto">
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Customer Search */}
          <div className="relative">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Search Customer
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search by name or phone"
                value={form.customerSearch}
                onChange={(e) => handleCustomerSearch(e.target.value)}
                onFocus={() =>
                  customerResults.length > 0 && setShowCustomerDropdown(true)
                }
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Customer Dropdown */}
            {showCustomerDropdown && customerResults.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                {customerResults.map((customer) => (
                  <button
                    key={customer.id}
                    type="button"
                    onClick={() => selectCustomer(customer)}
                    className="w-full px-3 py-2 text-left hover:bg-blue-50 border-b border-gray-100 last:border-0"
                  >
                    <div className="font-medium text-sm text-gray-900">
                      {customer.name}
                    </div>
                    <div className="text-xs text-gray-600">
                      {customer.phone}
                    </div>
                    <div className="text-xs text-gray-500">
                      {customer.email}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Pick and Drop off Address */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-medium text-gray-700">
              Pick and Drop off Address
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {placeProviderLabel}
              </span>
            </label>
            <p className="text-[10px] uppercase tracking-wide text-slate-400">
              Map provider: {mapProviderLabel}
            </p>

            {/* Pickup Location */}
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-blue-500 w-4 h-4 z-10" />
              <input
                type="text"
                placeholder="Enter pickup location"
                value={form.pickupAddress}
                onChange={(e) => handlePickupSearch(e.target.value)}
                onFocus={() =>
                  pickupSuggestions.length > 0 && setShowPickupDropdown(true)
                }
                className="w-full pl-9 pr-8 py-2.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {form.pickupAddress && (
                <button
                  type="button"
                  onClick={() => {
                    handleChange("pickupAddress", "");
                    handleChange("pickupLat", undefined);
                    handleChange("pickupLng", undefined);
                  }}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}

              {/* Pickup Dropdown */}
              {showPickupDropdown && pickupSuggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
                  {pickupSuggestions.map((location) => (
                    <button
                      key={location.id}
                      type="button"
                      onClick={() => selectPickupLocation(location)}
                      className="w-full px-3 py-2 text-left hover:bg-blue-50 border-b border-gray-100 last:border-0 text-sm text-gray-900"
                    >
                      <MapPin className="inline w-3 h-3 mr-2 text-blue-500" />
                      {location.description}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Reverse Button */}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={reverseLocations}
                disabled={!form.pickupAddress || !form.dropoffAddress}
                className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowLeftRight className="w-3 h-3" />
                REVERSE LOCATIONS
              </button>
            </div>

            {/* Dropoff Location */}
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-green-500 w-4 h-4 z-10" />
              <input
                type="text"
                placeholder="Enter dropoff location"
                value={form.dropoffAddress}
                onChange={(e) => handleDropoffSearch(e.target.value)}
                onFocus={() =>
                  dropoffSuggestions.length > 0 && setShowDropoffDropdown(true)
                }
                className="w-full pl-9 pr-8 py-2.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {form.dropoffAddress && (
                <button
                  type="button"
                  onClick={() => {
                    handleChange("dropoffAddress", "");
                    handleChange("dropoffLat", undefined);
                    handleChange("dropoffLng", undefined);
                  }}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}

              {/* Dropoff Dropdown */}
              {showDropoffDropdown && dropoffSuggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
                  {dropoffSuggestions.map((location) => (
                    <button
                      key={location.id}
                      type="button"
                      onClick={() => selectDropoffLocation(location)}
                      className="w-full px-3 py-2 text-left hover:bg-blue-50 border-b border-gray-100 last:border-0 text-sm text-gray-900"
                    >
                      <MapPin className="inline w-3 h-3 mr-2 text-green-500" />
                      {location.description}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {form.pickupLat &&
            form.pickupLng &&
            form.dropoffLat &&
            form.dropoffLng && (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
                  Route Preview
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-slate-500">
                      Pickup
                    </p>
                    <p className="font-medium text-slate-800 line-clamp-2">
                      {form.pickupAddress}
                    </p>
                    <p className="text-slate-500">
                      {form.pickupLat.toFixed(5)}, {form.pickupLng.toFixed(5)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-slate-500">
                      Dropoff
                    </p>
                    <p className="font-medium text-slate-800 line-clamp-2">
                      {form.dropoffAddress}
                    </p>
                    <p className="text-slate-500">
                      {form.dropoffLat.toFixed(5)}, {form.dropoffLng.toFixed(5)}
                    </p>
                  </div>
                </div>
                {(form.estimatedDistance || form.estimatedFare) && (
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wide text-slate-500">
                      Distance &amp; Fare
                    </span>
                    <span className="font-semibold text-slate-800">
                      {form.estimatedDistance
                        ? `${Number(form.estimatedDistance).toFixed(2)} km`
                        : "—"}
                      {form.estimatedFare
                        ? ` · ${Number(form.estimatedFare).toFixed(2)}`
                        : ""}
                    </span>
                  </div>
                )}
              </div>
            )}

          {/* Detected Zone Info */}
          {detectedZone && (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-md p-3">
              <div className="flex items-start">
                <MapPin
                  className="w-5 h-5 text-blue-600 mt-0.5 mr-2 flex-shrink-0"
                  style={{ color: detectedZone.color }}
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-gray-900">
                      {detectedZone.name}
                    </h4>
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        detectedZone.isActive
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {detectedZone.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  {detectedZone.description && (
                    <p className="text-xs text-gray-600 mt-1">
                      {detectedZone.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-gray-500">
                      {zoneTariffs.length} tariff
                      {zoneTariffs.length !== 1 ? "s" : ""} available
                    </span>
                    {detectingZone && (
                      <span className="text-xs text-blue-600 animate-pulse">
                        Detecting zone...
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tariff Selector */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Select Tariff{" "}
              {detectedZone && zoneTariffs.length > 0 && "(Zone-specific)"}
            </label>
            <select
              value={form.tariffId}
              onChange={(e) => handleChange("tariffId", e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              required
            >
              <option value="">Select Tariff</option>
              {(zoneTariffs.length > 0 ? zoneTariffs : tariffs).map(
                (item: any) => {
                  // Handle both ZoneTariff and regular Tariff types
                  const tariff = item.tariff || item;
                  const tariffId = item.tariffId || item.id || item.identifier;
                  const isDefault = item.isDefault || false;

                  return (
                    <option key={tariffId} value={tariffId}>
                      {tariff.name ?? tariff.identifier ?? "Tariff"}
                      {isDefault ? " (Default)" : ""}
                    </option>
                  );
                }
              )}
            </select>
          </div>

          {/* Fare Calculation Display */}
          {form.estimatedDistance && form.estimatedFare && (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-700">Total Distance:</span>
                <span className="font-semibold text-gray-900">
                  {form.estimatedDistance.toFixed(2)} km
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-700">Base Fare:</span>
                <span className="font-semibold text-gray-900">
                  ${form.baseFare?.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-700">Distance Fare:</span>
                <span className="font-semibold text-gray-900">
                  ${form.distanceFare?.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-700">Waiting Fare:</span>
                <span className="font-semibold text-gray-900">
                  ${form.waitingFare?.toFixed(2)}
                </span>
              </div>
              <div className="pt-2 border-t border-blue-300">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-900">
                    Estimated Fare:
                  </span>
                  <span className="text-lg font-bold text-blue-600">
                    ${form.estimatedFare.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Now / Later Toggle */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                console.log("🕐 [NOW BUTTON] Clicked - setting scheduledFor to 'now'");
                handleChange("scheduledFor", "now");
              }}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition ${
                form.scheduledFor === "now"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Now {form.scheduledFor === "now" && "✓"}
            </button>
            <button
              type="button"
              onClick={() => {
                console.log("🕐 [LATER BUTTON] Clicked - setting scheduledFor to 'later'");
                handleChange("scheduledFor", "later");
              }}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition ${
                form.scheduledFor === "later"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Later {form.scheduledFor === "later" && "✓"}
            </button>
          </div>

          <div className="text-xs text-gray-500 mt-1">
            Current: {form.scheduledFor} {form.scheduledDate && `(${form.scheduledDate} ${form.scheduledTime || ''})`}
          </div>

          {/* Schedule Date/Time (if Later selected) */}
          {form.scheduledFor === "later" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={form.scheduledDate || ""}
                  onChange={(e) => {
                    console.log("📅 Date changed to:", e.target.value);
                    handleChange("scheduledDate", e.target.value);
                  }}
                  min={new Date().toISOString().split("T")[0]}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Time
                </label>
                <input
                  type="time"
                  value={form.scheduledTime || ""}
                  onChange={(e) => {
                    console.log("⏰ Time changed to:", e.target.value);
                    handleChange("scheduledTime", e.target.value);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </div>
          )}

          {/* Account/Customer Details */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <User className="w-4 h-4" />
              Account/Customer Details
            </h3>

            {/* Passenger Name */}
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Passenger Name"
                value={form.passengerName}
                onChange={(e) => handleChange("passengerName", e.target.value)}
                required
                className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Phone */}
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="tel"
                placeholder="+974 XXXX XXXX"
                value={form.phone}
                onChange={(e) => handleChange("phone", e.target.value)}
                required
                className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Email */}
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="email"
                placeholder="customer@example.com"
                value={form.email}
                onChange={(e) => handleChange("email", e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Validation Code */}
            <div>
              <input
                type="text"
                placeholder="Validation Code (for special purposes)"
                value={form.validationCode}
                onChange={(e) => handleChange("validationCode", e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Job Related Info */}
            <div>
              <textarea
                placeholder="Job Related Info (special instructions, notes, etc.)"
                value={form.notes}
                onChange={(e) => handleChange("notes", e.target.value)}
                rows={3}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>
          </div>

          {/* Job Requirements */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">
              Job Requirements
            </h3>

            <div className="grid grid-cols-4 gap-3">
              {/* Passengers */}
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  <Users className="w-3 h-3 inline mr-1" />
                  Passengers
                </label>
                <input
                  type="number"
                  min="1"
                  value={form.passengers}
                  onChange={(e) =>
                    handleChange("passengers", parseInt(e.target.value) || 1)
                  }
                  className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Bags */}
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  <Briefcase className="w-3 h-3 inline mr-1" />
                  Bags
                </label>
                <input
                  type="number"
                  min="0"
                  value={form.bags}
                  onChange={(e) =>
                    handleChange("bags", parseInt(e.target.value) || 0)
                  }
                  className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Wheelchairs */}
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  <Accessibility className="w-3 h-3 inline mr-1" />
                  Wheelchairs
                </label>
                <input
                  type="number"
                  min="0"
                  value={form.wheelchairs}
                  onChange={(e) =>
                    handleChange("wheelchairs", parseInt(e.target.value) || 0)
                  }
                  className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Vehicles Needed */}
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  <Car className="w-3 h-3 inline mr-1" />
                  Vehicles
                </label>
                <input
                  type="number"
                  min="1"
                  value={form.vehiclesNeeded}
                  onChange={(e) =>
                    handleChange(
                      "vehiclesNeeded",
                      parseInt(e.target.value) || 1
                    )
                  }
                  className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Payment Method */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">
              Payment Method
            </h3>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleChange("paymentMethod", "cash")}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition flex items-center justify-center gap-2 ${
                  form.paymentMethod === "cash"
                    ? "bg-green-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                <DollarSign className="w-4 h-4" />
                Cash
              </button>
              <button
                type="button"
                disabled={!cardPaymentsEnabled}
                onClick={() => {
                  if (!cardPaymentsEnabled) {
                    toast.error("Card payments are not enabled.");
                    return;
                  }
                  handleChange("paymentMethod", "card");
                }}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition flex items-center justify-center gap-2 ${
                  form.paymentMethod === "card"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                } ${
                  !cardPaymentsEnabled ? "opacity-50 cursor-not-allowed" : ""
                }`}
              >
                <CreditCard className="w-4 h-4" />
                Card
              </button>
            </div>

            {/* Card Details (if Card selected) */}
            {form.paymentMethod === "card" && (
              <div className="space-y-2 p-3 bg-gray-50 rounded-md border border-gray-200">
                {!cardPaymentsEnabled ? (
                  <p className="text-xs text-amber-600">
                    Card payments are currently disabled. Update Stripe settings
                    in the Owner Panel to enable card processing.
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-gray-600 mb-2">
                      Secure card entry via Stripe
                    </p>
                    <div className="rounded-md border border-gray-300 bg-white px-3 py-2">
                      <CardElement
                        options={{
                          style: {
                            base: {
                              fontSize: "14px",
                              color: "#1f2937",
                              "::placeholder": { color: "#94a3b8" },
                            },
                            invalid: { color: "#ef4444" },
                          },
                        }}
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Driver Assignment */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">
              Driver Assignment
            </h3>

            <div className="space-y-2">
              {/* Assignment Type */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    handleChange("driverAssignment", "auto");
                    handleChange("selectedDriverId", undefined);
                  }}
                  className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition ${
                    form.driverAssignment === "auto"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  Auto-Assign
                </button>
                <button
                  type="button"
                  onClick={() => handleChange("driverAssignment", "manual")}
                  className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition ${
                    form.driverAssignment === "manual"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  Manual
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleChange("driverAssignment", "unassigned");
                    handleChange("selectedDriverId", undefined);
                  }}
                  className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition ${
                    form.driverAssignment === "unassigned"
                      ? "bg-orange-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  Unassigned
                </button>
              </div>

              {/* Manual Driver Selection */}
              {form.driverAssignment === "manual" && (
                <div className="relative">
                  <select
                    value={form.selectedDriverId || ""}
                    onChange={(e) =>
                      handleChange("selectedDriverId", e.target.value)
                    }
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white appearance-none pr-8"
                    required
                  >
                    <option value="">Select Driver</option>
                    {activeDrivers.map((driver: any) => (
                      <option key={driver.id} value={driver.id}>
                        {driver.name} - {driver.vehicle || "N/A"} -{" "}
                        {driver.status}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              )}

              {/* Help Text */}
              <p className="text-xs text-gray-500">
                {form.driverAssignment === "auto" &&
                  "Job will be automatically assigned to the most suitable driver based on proximity and availability."}
                {form.driverAssignment === "manual" &&
                  "Select a driver to send the job directly to them."}
                {form.driverAssignment === "unassigned" &&
                  "Job will remain unassigned until manually assigned by dispatcher."}
              </p>
            </div>
          </div>
        </form>
      </div>

      {/* Footer Actions */}
      <div className="border-t border-gray-200 px-4 py-3 bg-white flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={clearForm}
          className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition"
        >
          CLEAR
        </button>
        <button
          type="button"
          disabled
          className="px-4 py-2 border border-blue-200 rounded-md text-sm font-medium text-blue-300 bg-white cursor-not-allowed"
        >
          UPDATE JOB
        </button>
        <button
          type="submit"
          onClick={handleSubmit}
          disabled={loading || processingPayment}
          className="px-4 py-2 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {(() => {
            if (loading || processingPayment) return "PROCESSING...";
            return isEditMode ? "UPDATE JOB" : "CREATE NEW JOB";
          })()}
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
