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
    Search,
    User,
    Users,
    X as XIcon
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useTheme } from "../../contexts/ThemeContext";
import { useDispatchController } from "../../hooks/useDispatchController";
import {
    searchCustomers,
    saveCustomerCard,
    getCustomerPaymentMethod,
    type Customer as CustomerType,
} from "../../services/customerService";
import {
    getLocationSuggestions,
    getPlaceDetails,
    type LocationSuggestion as LocationSuggestionType,
    type PlaceProvider,
} from "../../services/geocodingService";
import { getRoute, clearRouteCache } from "../../services/routingService";
import { createJob as createJobAPI } from "../../services/jobService";
import { createJob as createJobV2 } from "../../services/v2/jobService";
import ServiceTypeSelector from "../v2/ServiceTypeSelector";
import {
    chargeSavedCard,
    confirmExtraCharge,
    createExtraCharge,
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
import { useFeatureFlags } from "../../hooks/useFeatureFlags";
import { calculateStripeFee, formatFee } from "../../utils/stripeFeeCalculator";
import StopManagementPanel from "../v2/StopManagementPanel";
import PODViewer from "../v2/PODViewer";

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
  onClone?: () => void; // Callback to switch from edit to create mode (keeps form data)
}

interface JobFormState {
  serviceType: "TAXI" | "DELIVERY" | "COURIER";
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
  stripePaymentMethodId?: string; // Saved card (pm_xxx) for reuse on extra charges
  currency?: string;
  cardChargeAmount?: number;
  // Tracks if job was already paid (for edit mode)
  isAlreadyPaid?: boolean;
  originalChargedAmount?: number;
  extraChargeAmount?: number;
  extraChargeDescription?: string;

  // Driver Assignment
  driverAssignment: "manual" | "auto" | "unassigned";
  selectedDriverId?: string;

  // Parcel metadata — only used when serviceType is DELIVERY or COURIER.
  // These map onto rides.foodDeliveryDetails / rides.courierDetails on the
  // backend so owner reports + dispatch detail views can surface what's
  // being moved without parsing the free-text notes blob.
  recipientName?: string;
  recipientPhone?: string;
  parcelDescription?: string;
  parcelWeightKg?: number;
  fragile?: boolean;
  proofOfDelivery?: boolean;
}

interface JobComposerInnerProps extends JobComposerCompleteProps {
  stripeConfig: DispatchPaymentConfig | null;
}

const JobComposerInner: React.FC<JobComposerInnerProps> = ({
  onJobCreated,
  editJobData,
  isEditMode = false,
  onJobUpdated,
  onClone,
  stripeConfig,
}) => {
  const { isDark } = useTheme();
  const stripe = useStripe();
  const elements = useElements();
  const tariffs = useDispatchStore((state) => state.tariffs);
  const vehicleTypes = useDispatchStore((state) => state.vehicleTypes);
  const drivers = useDispatchStore((state) => state.drivers);
  const updateJob = useDispatchStore((state) => state.updateJob);
  const loading = useDispatchStore((state) => state.loading);
  const jobDraft = useDispatchStore((state) => state.jobDraft);
  const updateJobDraft = useDispatchStore((state) => state.updateJobDraft);
  const clearJobDraft = useDispatchStore((state) => state.clearJobDraft);
  const selectedServiceType = useDispatchStore((state) => state.selectedServiceType);
  const setSelectedServiceType = useDispatchStore((state) => state.setSelectedServiceType);
  const mapPickMode = useDispatchStore((state) => state.mapPickMode);
  const setMapPickMode = useDispatchStore((state) => state.setMapPickMode);
  const mapPickResult = useDispatchStore((state) => state.mapPickResult);
  const setMapPickResult = useDispatchStore((state) => state.setMapPickResult);
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
    serviceType: selectedServiceType || "TAXI",
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
    cardChargeAmount: undefined,
    driverAssignment: "unassigned",
    recipientName: "",
    recipientPhone: "",
    parcelDescription: "",
    parcelWeightKg: undefined,
    fragile: false,
    proofOfDelivery: false,
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

      // Whether the existing job has a real dropoff. Used below to gate
      // re-loading saved fare/distance into the form — pickup-only jobs
      // must not display stale (and often nonsensical) saved estimates.
      const hasDropoff = !!(
        (editJobData.dropoffLocation?.latitude && editJobData.dropoffLocation?.longitude) ||
        (editJobData.dropoffLat && editJobData.dropoffLng) ||
        (editJobData.dropoffLatitude && editJobData.dropoffLongitude)
      );

      const newFormData = {
        serviceType: (editJobData.serviceType || editJobData.requirements?.serviceType || editJobData.service_type || selectedServiceType || "TAXI") as "TAXI" | "DELIVERY" | "COURIER",
        customerId: editJobData.customerId,
        customerSearch: passengerName,
        passengerName,
        phone,
        email,
        pickupAddress: editJobData.pickupAddress || "",
        dropoffAddress: (typeof editJobData.dropoffAddress === 'string' && editJobData.dropoffAddress) ? editJobData.dropoffAddress : "",
        stops: (editJobData.stops || editJobData.requirements?.stops || []).map((s: any, i: number) => ({
          address: s.address || `Stop ${i + 1}`,
          latitude: s.latitude ? Number(s.latitude) : undefined,
          longitude: s.longitude ? Number(s.longitude) : undefined,
          order: s.order ?? i + 1,
        })), // Load existing stops with guaranteed number coordinates
        pickupLat: editJobData.pickupLocation?.latitude || editJobData.pickupLat || editJobData.pickupLatitude,
        pickupLng: editJobData.pickupLocation?.longitude || editJobData.pickupLng || editJobData.pickupLongitude,
        dropoffLat: (editJobData.dropoffLocation?.latitude || editJobData.dropoffLat || editJobData.dropoffLatitude) || undefined,
        dropoffLng: (editJobData.dropoffLocation?.longitude || editJobData.dropoffLng || editJobData.dropoffLongitude) || undefined,
        vehicleType: editJobData.vehicleType || editJobData.requirements?.vehicleType || "",
        tariffId: editJobData.requirements?.tariffId || editJobData.tariffId || editJobData.tariff?.id || "",
        scheduledFor,
        scheduledDate,
        scheduledTime,
        notes: editJobData.requirements?.notes || editJobData.notes || "",
        validationCode: editJobData.validationCode || "",
        // Hydrate parcel metadata from whichever shape the backend returned —
        // courierDetails for COURIER, foodDeliveryDetails (or deliveryDetails)
        // for DELIVERY. Each path falls back to legacy free-text fields so
        // older jobs still populate something usable in the editor.
        recipientName:
          editJobData.ride?.courierDetails?.recipient?.name
          || editJobData.ride?.foodDeliveryDetails?.recipient?.name
          || editJobData.courierDetails?.recipient?.name
          || editJobData.deliveryDetails?.recipient?.name
          || editJobData.recipientName
          || "",
        recipientPhone:
          editJobData.ride?.courierDetails?.recipient?.phone
          || editJobData.ride?.foodDeliveryDetails?.recipient?.phone
          || editJobData.courierDetails?.recipient?.phone
          || editJobData.deliveryDetails?.recipient?.phone
          || editJobData.recipientPhone
          || "",
        parcelDescription:
          editJobData.ride?.foodDeliveryDetails?.notes
          || editJobData.deliveryDetails?.notes
          || editJobData.ride?.courierDetails?.parcelDescriptions?.[0]
          || editJobData.courierDetails?.parcelDescriptions?.[0]
          || "",
        parcelWeightKg:
          editJobData.ride?.courierDetails?.totalWeightKg
          ?? editJobData.ride?.foodDeliveryDetails?.weightKg
          ?? editJobData.courierDetails?.totalWeightKg
          ?? editJobData.deliveryDetails?.weightKg
          ?? undefined,
        fragile:
          !!(editJobData.ride?.courierDetails?.fragile
            || editJobData.ride?.foodDeliveryDetails?.fragile
            || editJobData.courierDetails?.fragile
            || editJobData.deliveryDetails?.fragile),
        proofOfDelivery:
          !!(editJobData.ride?.foodDeliveryDetails?.proofRequired
            || editJobData.deliveryDetails?.proofRequired
            || editJobData.proofRequired),
        passengers,
        bags,
        wheelchairs,
        vehiclesNeeded,
        paymentMethod: (editJobData.paymentStatus === 'PAID' || editJobData.paymentIntentId || editJobData.requirements?.stripePaymentIntentId) 
          ? "card" as "cash" | "card"
          : (editJobData.paymentMethod?.toLowerCase() || "cash") as "cash" | "card",
        // Detect if job was already paid
        isAlreadyPaid: editJobData.paymentStatus === 'PAID' || !!editJobData.paymentIntentId || !!editJobData.requirements?.stripePaymentIntentId,
        originalChargedAmount: editJobData.chargedAmount ?? editJobData.requirements?.chargedAmount ?? undefined,
        paymentIntentId: editJobData.paymentIntentId ?? editJobData.requirements?.stripePaymentIntentId ?? undefined,
        stripePaymentMethodId: editJobData.stripePaymentMethodId ?? editJobData.requirements?.stripePaymentMethodId ?? undefined,
        driverAssignment,
        selectedDriverId,
        // Only carry the saved fare / distance into the form if the job
        // actually has a dropoff. Pickup-only jobs sometimes have phantom
        // values from older buggy creates (e.g. 8000+ km / $35k) — keeping
        // them would re-display nonsense in the Est. Fare strip. The fare
        // recompute effect will run as soon as the dispatcher sets a
        // dropoff, populating real values.
        estimatedFare: hasDropoff
          ? (editJobData.estimatedPrice || editJobData.fareEstimate || editJobData.estimatedFare)
          : undefined,
        baseFare: hasDropoff
          ? (editJobData.requirements?.fareBreakdown?.base || editJobData.fareBreakdown?.base || editJobData.baseFare)
          : undefined,
        distanceFare: hasDropoff
          ? (editJobData.requirements?.fareBreakdown?.distance || editJobData.fareBreakdown?.distance || editJobData.distanceFare)
          : undefined,
        waitingFare: hasDropoff
          ? (editJobData.requirements?.fareBreakdown?.waiting || editJobData.fareBreakdown?.waiting || editJobData.waitingFare)
          : undefined,
        estimatedDistance: hasDropoff ? editJobData.estimatedDistance : undefined,
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
      
      // Also set the service type in the store so ServiceTypeSelector reflects it
      if (newFormData.serviceType) {
        setSelectedServiceType(newFormData.serviceType);
      }

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

      // Re-run zone detection for the loaded pickup so the "Pickup is
      // outside every service zone" warning doesn't appear on edits where
      // the pickup IS inside a zone. detectPickupZone is normally only
      // fired on fresh autocomplete / map-pick events; on edit-mode load
      // the form is populated programmatically, so without this the
      // detectedZone state stays null and the false-negative warning
      // shows. Skip when no pickup coordinates are available.
      if (newFormData.pickupLat && newFormData.pickupLng) {
        detectPickupZone(Number(newFormData.pickupLat), Number(newFormData.pickupLng));
      }

      // Also update jobDraft for map visualization (include stops)
      const editStops = editJobData.requirements?.stops || editJobData.stops || [];
      const draftStops = editStops
        .filter((s: any) => s.latitude && s.longitude)
        .map((s: any, i: number) => ({
          address: s.address || `Stop ${i + 1}`,
          latitude: Number(s.latitude),
          longitude: Number(s.longitude),
          order: s.order ?? i,
        }));

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
          },
          stops: draftStops.length > 0 ? draftStops : undefined,
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
          },
          stops: draftStops.length > 0 ? draftStops : undefined,
        });
      }

      console.log("[JobComposer] Form populated with edit data - Driver assignment:", driverAssignment, selectedDriverId);
    }
  }, [isEditMode, editJobData, updateJobDraft]);

  // Auto-load saved card from customer profile when editing a paid job without a stored PM
  useEffect(() => {
    if (isEditMode && form.isAlreadyPaid && form.customerId && !form.stripePaymentMethodId && !isInitializingEdit) {
      (async () => {
        try {
          const pm = await getCustomerPaymentMethod(form.customerId!);
          if (pm?.stripePaymentMethodId) {
            setForm((prev) => ({ ...prev, stripePaymentMethodId: pm.stripePaymentMethodId }));
            setSelectedCustomerSavedCard({
              cardLast4: pm.cardLast4 || '****',
              cardBrand: pm.cardBrand || 'card',
              cardExpMonth: pm.cardExpMonth,
              cardExpYear: pm.cardExpYear,
            });
            console.log('[JobComposer] Auto-loaded saved card for extra charges:', pm.stripePaymentMethodId);
          }
        } catch (e) {
          console.log('[JobComposer] No saved card found for customer', form.customerId);
        }
      })();
    }
  }, [isEditMode, form.isAlreadyPaid, form.customerId, form.stripePaymentMethodId, isInitializingEdit]);

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

  // Saved card popup state
  const [showSavedCardPopup, setShowSavedCardPopup] = useState(false);
  const [selectedCustomerSavedCard, setSelectedCustomerSavedCard] = useState<{
    cardLast4: string;
    cardBrand: string;
    cardExpMonth?: number | null;
    cardExpYear?: number | null;
  } | null>(null);
  
  // Stop autocomplete state
  const [stopSuggestions, setStopSuggestions] = useState<Record<number, LocationSuggestion[]>>({});
  const [activeStopIndex, setActiveStopIndex] = useState<number | null>(null);

  // Selected tariff details
  const [selectedTariff, setSelectedTariff] = useState<any>(null);

  // Zone detection
  const [detectedZone, setDetectedZone] = useState<Zone | null>(null);
  const [zoneTariffs, setZoneTariffs] = useState<ZoneTariff[]>([]);
  // True once the dispatcher has explicitly acknowledged an out-of-zone
  // pickup. Reset on every pickup change so the warning re-surfaces for
  // each new location. Without this, the submit would either silently
  // succeed (no zone pricing available) or be blocked with no escape hatch.
  const [outOfZoneAck, setOutOfZoneAck] = useState(false);
  const [detectingZone, setDetectingZone] = useState(false);

  // Consume the one-shot map-pick result whenever the dispatcher drops a pin
  // on the map while in "pick on map" mode. We update the matching form
  // field, then clear the result so the same click isn't re-applied on the
  // next render.
  useEffect(() => {
    if (!mapPickResult) return;
    const { target, stopIndex, address, latitude, longitude } = mapPickResult;
    if (target === 'pickup') {
      handleChange('pickupAddress', address);
      handleChange('pickupLat', latitude);
      handleChange('pickupLng', longitude);
      setOutOfZoneAck(false);
      // Fire zone detection for map-picked pickups too, not just autocomplete
      // selections. Without this the out-of-zone warning would never show
      // when the dispatcher drops a pin.
      detectPickupZone(latitude, longitude);
    } else if (target === 'dropoff') {
      handleChange('dropoffAddress', address);
      handleChange('dropoffLat', latitude);
      handleChange('dropoffLng', longitude);
    } else if (target === 'stop' && typeof stopIndex === 'number') {
      setForm((prev: any) => {
        const stops = Array.isArray(prev.stops) ? [...prev.stops] : [];
        stops[stopIndex] = {
          ...(stops[stopIndex] || {}),
          address,
          latitude,
          longitude,
          order: stopIndex,
        };
        return { ...prev, stops };
      });
    }
    setMapPickResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapPickResult]);

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
      // Build route path including intermediate stops
      const routePoints: Array<{ lat: number; lng: number }> = [
        { lat: form.pickupLat, lng: form.pickupLng },
      ];
      
      // Add stops with valid coordinates
      form.stops.forEach(stop => {
        if (stop.latitude && stop.longitude) {
          routePoints.push({ lat: stop.latitude, lng: stop.longitude });
        }
      });
      
      routePoints.push({ lat: form.dropoffLat, lng: form.dropoffLng });

      const existing = jobDraft?.routePath;
      const isSame = existing && 
        existing.length === routePoints.length &&
        existing.every((p, i) => p.lat === routePoints[i].lat && p.lng === routePoints[i].lng);

      if (!isSame) {
        updateJobDraft({ routePath: routePoints });
      }
    } else if (jobDraft?.routePath?.length) {
      updateJobDraft({ routePath: undefined });
    }
  }, [
    form.pickupLat,
    form.pickupLng,
    form.dropoffLat,
    form.dropoffLng,
    form.stops,
    jobDraft?.routePath,
    updateJobDraft,
  ]);

  // Sync stops to map draft for markers
  useEffect(() => {
    const stopsWithCoords = form.stops
      .filter(s => s.latitude && s.longitude)
      .map(s => ({
        address: s.address,
        latitude: Number(s.latitude),
        longitude: Number(s.longitude),
      }));
    
    const currentStops = jobDraft?.stops || [];
    const isSame = currentStops.length === stopsWithCoords.length &&
      currentStops.every((s, i) => 
        s.latitude === stopsWithCoords[i].latitude && 
        s.longitude === stopsWithCoords[i].longitude
      );
    
    if (!isSame) {
      updateJobDraft({ stops: stopsWithCoords.length > 0 ? stopsWithCoords : undefined });
    }
  }, [form.stops, jobDraft?.stops, updateJobDraft]);

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
      // Set default vehicle type to first available (index 0)
      if (!form.vehicleType && vehicleTypes.length > 0) {
        const firstVehicleType = vehicleTypes[0];
        const vehicleTypeValue = firstVehicleType.code || firstVehicleType.name || firstVehicleType.id || "SEDAN";
        setForm(prev => ({ ...prev, vehicleType: vehicleTypeValue }));
        console.log("[JobComposer] Auto-selected first vehicle type as default:", vehicleTypeValue);
      } else if (!form.vehicleType) {
        // Fallback to SEDAN if no vehicle types loaded
        setForm(prev => ({ ...prev, vehicleType: "SEDAN" }));
      }
      
      // Set default tariff to first available (index 0)
      const availableTariffs = (zoneTariffs?.length ?? 0) > 0 ? zoneTariffs : (tariffs || []);
      if (!form.tariffId && availableTariffs.length > 0) {
        const firstItem = availableTariffs[0];
        const tariff = firstItem.tariff || firstItem;
        const tariffId = firstItem.tariffId || tariff.id || tariff.identifier || "";
        if (tariffId) {
          setForm(prev => ({ ...prev, tariffId }));
          setSelectedTariff(tariff);
          console.log("[JobComposer] Auto-selected first tariff as default:", tariff);
        }
      }
    }
  }, [isEditMode, isInitializingEdit, tariffs, zoneTariffs, vehicleTypes, form.vehicleType, form.tariffId]);

  // ── Format card brand for display ──
  const formatCardBrand = (brand: string | null | undefined): string => {
    if (!brand || brand === 'unknown') return 'Card';
    const brands: Record<string, string> = {
      visa: 'Visa', mastercard: 'MC', amex: 'Amex',
      discover: 'Discover', diners: 'Diners', jcb: 'JCB', unionpay: 'UnionPay',
    };
    return brands[brand.toLowerCase()] || brand.charAt(0).toUpperCase() + brand.slice(1);
  };

  // ── Vehicle capacity config ──
  // Use DB capacity when available, with sensible bag defaults per vehicle type name
  const getVehicleCapacity = useCallback((vehicleCode: string) => {
    const code = (vehicleCode || '').toUpperCase();
    // Find the vehicle type from the store to get its DB capacity
    const vt = vehicleTypes.find((v: any) =>
      (v.code || '').toUpperCase() === code || (v.name || '').toUpperCase() === code
    );
    const dbCapacity = vt?.capacity || 4;

    // Bag defaults based on vehicle name/code (trunk size logic)
    const bagDefaults: Record<string, number> = {
      HATCHBACK: 2, SEDAN: 3, SUV: 5, VAN: 8, TRUCK: 10, LUXURY: 3,
      MOTORCYCLE: 0, BICYCLE: 0, MINIBUS: 12,
    };
    const maxBags = bagDefaults[code] ?? Math.min(dbCapacity, 4);

    return { maxPassengers: dbCapacity, maxBags, maxWheelchairs: code === 'VAN' ? 2 : (dbCapacity >= 6 ? 1 : 0) };
  }, [vehicleTypes]);

  // Show ALL vehicle types registered in the company (sorted by capacity)
  const availableVehicleTypes = useMemo(() => {
    if (vehicleTypes.length === 0) return [];
    // Show all active company vehicle types, sorted by capacity ascending
    return [...vehicleTypes]
      .filter((vt: any) => vt.isActive !== false)
      .sort((a: any, b: any) => (a.capacity || 4) - (b.capacity || 4));
  }, [vehicleTypes]);

  // Max capacity across ALL company vehicle types
  const maxAvailableCapacity = useMemo(() => {
    if (availableVehicleTypes.length === 0) return 4; // default fallback
    return Math.max(...availableVehicleTypes.map((vt: any) => {
      const cap = getVehicleCapacity(vt.code || vt.name || '');
      return cap.maxPassengers;
    }));
  }, [availableVehicleTypes, getVehicleCapacity]);

  // Max bags across all company vehicle types
  const maxAvailableBags = useMemo(() => {
    if (availableVehicleTypes.length === 0) return 4; // default fallback
    return Math.max(...availableVehicleTypes.map((vt: any) => {
      const cap = getVehicleCapacity(vt.code || vt.name || '');
      return cap.maxBags;
    }));
  }, [availableVehicleTypes, getVehicleCapacity]);

  // Max wheelchairs across all company vehicle types
  const maxAvailableWheelchairs = useMemo(() => {
    if (availableVehicleTypes.length === 0) return 0;
    return Math.max(...availableVehicleTypes.map((vt: any) => {
      const cap = getVehicleCapacity(vt.code || vt.name || '');
      return cap.maxWheelchairs;
    }));
  }, [availableVehicleTypes, getVehicleCapacity]);

  // Get current vehicle limits
  const currentVehicleLimits = useMemo(() => {
    return getVehicleCapacity(form.vehicleType);
  }, [form.vehicleType, getVehicleCapacity]);

  const handleChange = (field: keyof JobFormState, value: any) => {
    console.log(`[JobComposer] handleChange: ${field} = ${value}`);

    if (field === "vehicleType") {
      // When vehicle type changes manually, just set it — don't clamp passengers
      // Passengers are bounded by maxAvailableCapacity (across ALL online drivers), not the selected vehicle
      setForm((prev) => ({
        ...prev,
        vehicleType: value,
      }));
      return;
    }

    if (field === "passengers") {
      const requested = Math.max(1, Number(value) || 1);
      // Cap at max capacity across ALL online drivers' vehicle types
      const capped = Math.min(requested, maxAvailableCapacity || 1);

      // If passengers exceed the CURRENTLY SELECTED vehicle's capacity, auto-upgrade
      if (capped > currentVehicleLimits.maxPassengers) {
        // Find the smallest vehicle type that fits (sorted by capacity ascending)
        const biggerVehicle = availableVehicleTypes.find((vt: any) => {
          const cap = getVehicleCapacity(vt.code || vt.name || '');
          return cap.maxPassengers >= capped;
        });
        if (biggerVehicle) {
          const newCode = biggerVehicle.code || biggerVehicle.name || biggerVehicle.id;
          setForm((prev) => ({
            ...prev,
            passengers: capped,
            vehicleType: newCode,
          }));
          return;
        }
      }
      setForm((prev) => ({ ...prev, passengers: capped }));
      return;
    }

    if (field === "bags") {
      const requested = Math.max(0, Number(value) || 0);
      const capped = Math.min(requested, maxAvailableBags || 0);

      // If bags exceed the CURRENTLY SELECTED vehicle's bag capacity, auto-upgrade
      if (capped > currentVehicleLimits.maxBags) {
        const biggerVehicle = availableVehicleTypes.find((vt: any) => {
          const cap = getVehicleCapacity(vt.code || vt.name || '');
          return cap.maxBags >= capped && cap.maxPassengers >= (form.passengers || 1);
        });
        if (biggerVehicle) {
          const newCode = biggerVehicle.code || biggerVehicle.name || biggerVehicle.id;
          setForm((prev) => ({
            ...prev,
            bags: capped,
            vehicleType: newCode,
          }));
          return;
        }
      }
      setForm((prev) => ({ ...prev, bags: capped }));
      return;
    }

    if (field === "wheelchairs") {
      const requested = Math.max(0, Number(value) || 0);
      const capped = Math.min(requested, maxAvailableWheelchairs || 0);

      // If wheelchairs exceed the CURRENTLY SELECTED vehicle's wheelchair capacity, auto-upgrade
      if (capped > currentVehicleLimits.maxWheelchairs) {
        const wcVehicle = availableVehicleTypes.find((vt: any) => {
          const cap = getVehicleCapacity(vt.code || vt.name || '');
          return cap.maxWheelchairs >= capped && cap.maxPassengers >= (form.passengers || 1);
        });
        if (wcVehicle) {
          const newCode = wcVehicle.code || wcVehicle.name || wcVehicle.id;
          setForm((prev) => ({
            ...prev,
            wheelchairs: capped,
            vehicleType: newCode,
          }));
          return;
        }
      }
      setForm((prev) => ({ ...prev, wheelchairs: capped }));
      return;
    }

    setForm((prev) => ({ ...prev, [field]: value }));
    if (field === "serviceType") {
      setSelectedServiceType(value as any);
    }
  };

  // Customer Search - triggered from name or phone fields
  const customerSearchRef = React.useRef<HTMLDivElement>(null);
  const customerSearchTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  
  const handleCustomerSearch = async (query: string, field: "passengerName" | "phone" = "passengerName") => {
    handleChange(field, query);
    if (query.length < 2) {
      setCustomerResults([]);
      setShowCustomerDropdown(false);
      if (customerSearchTimerRef.current) {
        clearTimeout(customerSearchTimerRef.current);
      }
      return;
    }

    // ✅ FIX: Debounce customer search - wait 500ms after user stops typing
    if (customerSearchTimerRef.current) {
      clearTimeout(customerSearchTimerRef.current);
    }

    customerSearchTimerRef.current = setTimeout(async () => {
      try {
        console.log("[Customer Search] Executing search for:", query);
        const customers = await searchCustomers(query);
        setCustomerResults(customers);
        setShowCustomerDropdown(customers.length > 0);
      } catch (error) {
        console.error("Customer search failed:", error);
        setCustomerResults([]);
      }
    }, 500);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (customerSearchRef.current && !customerSearchRef.current.contains(e.target as Node)) {
        setShowCustomerDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      // Cleanup debounce timer on unmount
      if (customerSearchTimerRef.current) {
        clearTimeout(customerSearchTimerRef.current);
      }
    };
  }, []);

  // Select Customer
  const selectCustomer = (customer: Customer) => {
    setForm((prev) => ({
      ...prev,
      customerId: customer.id,
      customerSearch: customer.name,
      passengerName: customer.name,
      phone: customer.phone,
      email: customer.email || prev.email,
    }));
    setShowCustomerDropdown(false);
    setCustomerResults([]);
    toast.success(`Customer "${customer.name}" selected`);

    // Check if customer has a saved card — show popup to offer reuse
    if (customer.savedCard?.hasCard && customer.savedCard.cardLast4) {
      setSelectedCustomerSavedCard({
        cardLast4: customer.savedCard.cardLast4,
        cardBrand: customer.savedCard.cardBrand || 'card',
        cardExpMonth: customer.savedCard.cardExpMonth,
        cardExpYear: customer.savedCard.cardExpYear,
      });
      setShowSavedCardPopup(true);
    }
  };

  // Use saved card for this job
  const useSavedCard = async () => {
    if (!form.customerId) return;
    try {
      const pm = await getCustomerPaymentMethod(form.customerId);
      if (pm?.stripePaymentMethodId) {
        setForm((prev) => ({
          ...prev,
          paymentMethod: 'card' as const,
          stripePaymentMethodId: pm.stripePaymentMethodId,
          isAlreadyPaid: false, // Not paid yet — will use saved card for payment
        }));
        toast.success(`Saved card ending in ${pm.cardLast4 || '****'} loaded`);
      } else {
        toast.error("Could not load saved card details");
      }
    } catch (err) {
      toast.error("Failed to load saved card");
    }
    setShowSavedCardPopup(false);
    setSelectedCustomerSavedCard(null);
  };

  // Dismiss saved card popup
  const dismissSavedCardPopup = () => {
    setShowSavedCardPopup(false);
    setSelectedCustomerSavedCard(null);
  };

  // Clear selected customer
  const clearSelectedCustomer = () => {
    setForm((prev) => ({
      ...prev,
      customerId: undefined,
      customerSearch: "",
      passengerName: "",
      phone: "",
      email: "",
      stripePaymentMethodId: undefined,
    }));
    setCustomerResults([]);
    setShowCustomerDropdown(false);
    setShowSavedCardPopup(false);
    setSelectedCustomerSavedCard(null);
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
      setOutOfZoneAck(false); // new pickup → force re-confirmation
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

  // Auto-geocode stop on blur if it has address text but no coordinates
  const autoGeocodeStop = async (index: number) => {
    // Use a ref-like approach: read current form state at call time
    // Since this fires after 250ms delay, the stop might have been geocoded by selectStopLocation
    let currentStop: any = null;
    setForm((prev) => {
      currentStop = prev.stops[index];
      return prev; // No change, just reading
    });

    if (!currentStop || !currentStop.address || currentStop.address.length < 3) return;
    // Already geocoded — skip
    if (currentStop.latitude && currentStop.longitude) return;

    try {
      console.log(`[Stops] Auto-geocoding stop ${index + 1}: "${currentStop.address}"`);
      const suggestions = await getLocationSuggestions(currentStop.address, placeProvider, { language: "en" });
      if (suggestions.length > 0) {
        const details = await getPlaceDetails(suggestions[0], placeProvider);
        setForm((prev) => {
          // Re-check in case it was geocoded while we were fetching
          if (prev.stops[index]?.latitude && prev.stops[index]?.longitude) return prev;
          const newStops = [...prev.stops];
          newStops[index] = {
            ...newStops[index],
            address: details.formattedAddress ?? details.address,
            latitude: details.lat,
            longitude: details.lng,
          };
          return { ...prev, stops: newStops };
        });
        toast.success(`Stop ${index + 1} auto-located`);
        console.log(`[Stops] Auto-geocoded stop ${index + 1}: ${details.lat}, ${details.lng}`);
      } else {
        toast.error(`Could not locate stop ${index + 1}. Please select from suggestions.`);
      }
    } catch (error) {
      console.error(`Auto-geocode failed for stop ${index + 1}:`, error);
    }
  };

  // Detect Zone for Pickup Location
  const detectPickupZone = async (lat: number, lng: number) => {
    try {
      setDetectingZone(true);
      const result: ZoneDetectionResult = await detectZone(lat, lng);

      // detectZone returns null when the backend reports no matching zone
      // (`{ success: true, data: null }`) — e.g. pickup outside every zone or
      // no zones defined. Guard so we take the clean "no zone" path below
      // instead of throwing on `null.zone`.
      if (result?.zone) {
        setDetectedZone(result.zone);
        // Coerce to a real array — if the zone has no linked tariffs,
        // detectZone may return `result.tariffs` as undefined, and a
        // later render reads `zoneTariffs.length` which crashes the
        // whole composer (and dispatch with it).
        const zoneTariffsArr = Array.isArray(result.tariffs) ? result.tariffs : [];
        setZoneTariffs(zoneTariffsArr);

        // Auto-select default tariff if available
        if (result.defaultTariff) {
          setForm((prev) => ({
            ...prev,
            tariffId: result.defaultTariff!.tariffId,
          }));
          setSelectedTariff(result.defaultTariff.tariff);
          toast.success(`Zone detected: ${result.zone.name}`);
        } else if (zoneTariffsArr.length > 0) {
          // Use first tariff if no default
          setForm((prev) => ({
            ...prev,
            tariffId: zoneTariffsArr[0].tariffId,
          }));
          setSelectedTariff(zoneTariffsArr[0].tariff);
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

  // Stable key for stops coordinates — ensures fare recalculates when any stop is geocoded
  const stopsCoordKey = useMemo(() => {
    return form.stops
      .filter(s => s.latitude && s.longitude)
      .map(s => `${s.latitude},${s.longitude}`)
      .join('|');
  }, [form.stops]);

  // Track stops length separately so fare recalculates when stops are added/removed
  const stopsCount = form.stops.length;

  // Clear any stale fare/distance the moment a dropoff is removed (or never
  // entered). Without this, a dispatcher who fills both ends, lets the fare
  // calc run, then deletes the dropoff would still submit the cached values
  // — and the backend would happily save them on the pickup-only job. The
  // backend has its own no-dropoff guard but defending in two places keeps
  // even ad-hoc / legacy update paths honest.
  useEffect(() => {
    if (isInitializingEdit) return;
    const hasDropoff = !!(form.dropoffLat && form.dropoffLng);
    if (!hasDropoff && (form.estimatedFare || form.estimatedDistance)) {
      setForm((prev) => ({
        ...prev,
        estimatedFare: undefined,
        estimatedDistance: undefined,
        baseFare: undefined,
        distanceFare: undefined,
        waitingFare: undefined,
      }));
    }
  }, [form.dropoffLat, form.dropoffLng, form.estimatedFare, form.estimatedDistance, isInitializingEdit]);

  // Calculate Fare when locations, tariff, or stops change
  useEffect(() => {
    if (
      !isInitializingEdit &&
      form.pickupLat &&
      form.pickupLng &&
      form.dropoffLat &&
      form.dropoffLng &&
      form.tariffId
    ) {
      // Build waypoints from intermediate stops — ensure coords are numbers
      const waypoints = form.stops
        .filter(s => s.latitude && s.longitude)
        .map(s => ({ lat: Number(s.latitude), lng: Number(s.longitude) }));

      console.log(`[Fare] Calculating with ${waypoints.length} waypoint(s), stopsCoordKey="${stopsCoordKey}", stopsCount=${stopsCount}`);

      const calculateFare = async () => {
        try {
          // Clear route cache to get fresh OSRM distance
          // (ensures stops changes aren't masked by stale cached routes)
          clearRouteCache();
          const routeResult = await getRoute(
            { lat: form.pickupLat!, lng: form.pickupLng! },
            { lat: form.dropoffLat!, lng: form.dropoffLng! },
            waypoints
          );

          // OSRM returns distance in meters, convert to km
          const distance = routeResult.distance / 1000;
          const duration = routeResult.duration / 60; // seconds to minutes

          console.log(`[Fare] OSRM distance: ${distance.toFixed(2)} km (${routeResult.distance}m), source: ${routeResult.source}, waypoints: ${waypoints.length}`);

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

      calculateFare();
    }
  }, [form.pickupLat, form.pickupLng, form.dropoffLat, form.dropoffLng, form.tariffId, stopsCoordKey, stopsCount, isInitializingEdit]);

  // Recalculate fare when user selects a different route on the map
  useEffect(() => {
    if (
      !isInitializingEdit &&
      jobDraft?.selectedRouteDistance &&
      jobDraft.selectedRouteDistance > 0 &&
      form.tariffId
    ) {
      const distance = jobDraft.selectedRouteDistance / 1000; // meters → km
      const tariff = tariffs.find(
        (t) => (t.id || t.identifier) === form.tariffId
      );
      if (!tariff) return;

      const baseFare = tariff.baseFare || 5.0;
      const perKm = tariff.perKm || 2.5;
      const distanceFare = distance * perKm;
      const totalFare = baseFare + distanceFare;

      console.log(`[Fare] Route changed on map: ${distance.toFixed(2)} km`);

      setForm((prev) => ({
        ...prev,
        estimatedDistance: distance,
        baseFare,
        distanceFare,
        waitingFare: 0,
        estimatedFare: totalFare,
        currency: tariff.currency || prev.currency || "USD",
      }));
    }
  }, [jobDraft?.selectedRouteDistance, jobDraft?.selectedRouteIndex]);

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
  // Local double-submit guard — distinct from the store-level `loading` flag
  // so a second click during the in-flight promise is a true no-op even if
  // the store hasn't flipped yet.
  const [submitting, setSubmitting] = useState(false);

  const processCardPayment = useCallback(async (): Promise<{ paymentIntentId: string; paymentMethodId: string | null; cardLast4?: string; cardBrand?: string; cardExpMonth?: number; cardExpYear?: number } | null> => {
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

    const chargeAmount = form.cardChargeAmount && form.cardChargeAmount > 0
      ? form.cardChargeAmount
      : form.estimatedFare;

    if (!chargeAmount || chargeAmount <= 0) {
      toast.error("Please enter a charge amount or ensure a valid fare estimate.");
      return null;
    }

    const amount = Number(chargeAmount);
    const currency = (form.currency || "USD").toLowerCase();

    setProcessingPayment(true);
    try {
      const intent = await createPaymentIntent({
        amount,
        currency,
        description: `Dispatch job for ${form.passengerName || "customer"}`,
        customerId: form.customerId || undefined,
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
      // Capture both the PaymentIntent ID and the PaymentMethod ID (pm_xxx) for reuse
      const pmObj = confirmation.paymentIntent?.payment_method;
      const confirmedPmId = typeof pmObj === 'string'
        ? pmObj
        : (pmObj as any)?.id ?? null;
      // Extract card details from the payment method object when available
      const cardDetails = typeof pmObj === 'object' && pmObj ? (pmObj as any)?.card : null;
      return {
        paymentIntentId: confirmation.paymentIntent?.id ?? intent.paymentIntentId,
        paymentMethodId: confirmedPmId,
        cardLast4: cardDetails?.last4 || undefined,
        cardBrand: cardDetails?.brand || undefined,
        cardExpMonth: cardDetails?.exp_month || undefined,
        cardExpYear: cardDetails?.exp_year || undefined,
      };
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
      driverAssignment: "unassigned",
    });
    setCustomerResults([]);
    setPickupSuggestions([]);
    setDropoffSuggestions([]);
    setDetectedZone(null);
    setZoneTariffs([]);
    setOutOfZoneAck(false);
    clearJobDraft();
    // Clear hovered/selected job so map route clears immediately
    const store = useDispatchStore.getState() as any;
    if (store.setHoveredJobId) store.setHoveredJobId(null);
    if (store.selectJob) store.selectJob(null);
    const cardElement = elements?.getElement(CardElement);
    cardElement?.clear();
  };

  // Submit Job
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    // Double-submit guard: early-return if a previous submit is still in
    // flight. `submitting` is flipped below in a try/finally so we're safe
    // against thrown errors.
    if (submitting) {
      console.log("[JobComposer] handleSubmit ignored — already submitting");
      return;
    }

    // Validation - Only pickup location is required
    // Dropoff, customer name, phone, tariff are all optional
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

    // Block submit when pickup is outside every zone until the dispatcher
    // acknowledges — prevents accidentally creating jobs with no zone
    // pricing or queue assignment. The warning card below the pickup input
    // exposes "Proceed anyway" to set `outOfZoneAck`.
    if (!detectingZone && !detectedZone && !outOfZoneAck) {
      toast.error(
        'Pickup is outside every service zone. Change the pickup location or tap "Proceed anyway".',
        { duration: 5000, icon: '⚠️' },
      );
      return;
    }

    setSubmitting(true);
    try {

    let paymentIntentId: string | null = null;
    let stripePaymentMethodId: string | null = form.stripePaymentMethodId || null;
    let cardDetailsForSave: { cardLast4?: string; cardBrand?: string; cardExpMonth?: number; cardExpYear?: number } | null = null;
    if (form.paymentMethod === "card") {
      // Require customer name for card payments
      if (!form.passengerName?.trim()) {
        toast.error("Customer name is required for card payments.");
        return;
      }

      // Skip card processing for already-paid jobs (unless it's a new job)
      if (form.isAlreadyPaid && isEditMode) {
        // Process extra charge ONLY if user explicitly entered one
        if (form.extraChargeAmount && form.extraChargeAmount > 0) {
          try {
            // If we have a saved payment method, charge server-side — no card input needed
            if (form.stripePaymentMethodId) {
              const extraChargeIntent = await createExtraCharge({
                jobId: editJobData?.id,
                amount: form.extraChargeAmount,
                currency: (form.currency || 'USD').toLowerCase(),
                description: form.extraChargeDescription || 'Extra charge',
                paymentMethodId: form.stripePaymentMethodId,
              });
              
              // Server-side confirmation — check if already confirmed
              if (extraChargeIntent.status === 'succeeded' || extraChargeIntent.alreadyConfirmed) {
                await confirmExtraCharge(editJobData?.id, extraChargeIntent.paymentIntentId);
                toast.success(`Extra charge of $${form.extraChargeAmount.toFixed(2)} processed using saved card!`);
              } else {
                // Fallback: needs client-side confirmation (e.g. 3DS)
                if (!stripe) {
                  toast.error("Stripe is not ready yet.");
                  return;
                }
                const confirmation = await stripe.confirmCardPayment(extraChargeIntent.clientSecret, {
                  payment_method: form.stripePaymentMethodId,
                });
                if (confirmation.error) {
                  toast.error(`Extra charge failed: ${confirmation.error.message}`);
                  return;
                }
                await confirmExtraCharge(editJobData?.id, extraChargeIntent.paymentIntentId);
                toast.success(`Extra charge of $${form.extraChargeAmount.toFixed(2)} processed!`);
              }
            } else {
              // No saved card — fallback to manual card entry
              if (!stripe || !elements) {
                toast.error("Stripe is not ready yet for extra charge.");
                return;
              }
              const card = elements.getElement(CardElement);
              if (!card) {
                toast.error("Please enter card details for the extra charge.");
                return;
              }

              const extraChargeIntent = await createExtraCharge({
                jobId: editJobData?.id,
                amount: form.extraChargeAmount,
                currency: (form.currency || 'USD').toLowerCase(),
                description: form.extraChargeDescription || 'Extra charge',
              });
              
              const confirmation = await stripe.confirmCardPayment(
                extraChargeIntent.clientSecret,
                {
                  payment_method: {
                    card,
                    billing_details: {
                      name: form.passengerName || undefined,
                      phone: form.phone || undefined,
                    },
                  },
                }
              );
              
              if (confirmation.error) {
                toast.error(`Extra charge failed: ${confirmation.error.message}`);
                return;
              }
              
              // Capture the new payment method for future reuse
              const newPmId = typeof confirmation.paymentIntent?.payment_method === 'string'
                ? confirmation.paymentIntent.payment_method
                : (confirmation.paymentIntent?.payment_method as any)?.id ?? null;
              if (newPmId) stripePaymentMethodId = newPmId;
              
              await confirmExtraCharge(editJobData?.id, extraChargeIntent.paymentIntentId);
              toast.success(`Extra charge of $${form.extraChargeAmount.toFixed(2)} processed!`);
              card.clear();
            }
          } catch (err: any) {
            const errCode = err.response?.data?.code;
            if (errCode === 'CARD_EXPIRED_OR_TAINTED') {
              toast.error('Saved card is no longer valid. Please enter a new card.');
              setForm(prev => ({ ...prev, stripePaymentMethodId: undefined }));
              setSelectedCustomerSavedCard(null);
              return;
            }
            toast.error(`Extra charge error: ${err.message}`);
            return;
          }
        }
        // Always preserve existing payment intent — no new card required for simple updates
        paymentIntentId = form.paymentIntentId || null;
      } else {
        // Check if using a saved card (from customer profile)
        if (form.stripePaymentMethodId && !isEditMode) {
          // Charge off-session using saved card
          try {
            const chargeAmount = form.cardChargeAmount && form.cardChargeAmount > 0
              ? form.cardChargeAmount
              : form.estimatedFare;

            if (!chargeAmount || chargeAmount <= 0) {
              toast.error("Please enter a charge amount or ensure a valid fare estimate.");
              return;
            }

            const result = await chargeSavedCard({
              amount: chargeAmount,
              currency: (form.currency || 'USD').toLowerCase(),
              description: `Dispatch job for ${form.passengerName || 'customer'}`,
              paymentMethodId: form.stripePaymentMethodId,
              customerId: form.customerId!,
            });

            if (result.alreadyConfirmed || result.status === 'succeeded') {
              paymentIntentId = result.paymentIntentId;
              stripePaymentMethodId = form.stripePaymentMethodId;
              toast.success("Payment processed using saved card!");
            } else {
              // Needs client-side confirmation (3DS)
              if (!stripe) {
                toast.error("Stripe is not ready for authentication.");
                return;
              }
              const confirmation = await stripe.confirmCardPayment(result.clientSecret, {
                payment_method: form.stripePaymentMethodId,
              });
              if (confirmation.error) {
                toast.error(`Payment failed: ${confirmation.error.message}`);
                return;
              }
              paymentIntentId = result.paymentIntentId;
              stripePaymentMethodId = form.stripePaymentMethodId;
              toast.success("Payment processed using saved card!");
            }
          } catch (err: any) {
            const errCode = err.response?.data?.code;
            if (errCode === 'CARD_EXPIRED_OR_TAINTED') {
              toast.error('Saved card is no longer valid. Please enter a new card — it will be saved automatically.');
              setForm(prev => ({ ...prev, stripePaymentMethodId: undefined }));
              setSelectedCustomerSavedCard(null);
              return;
            }
            if (err.response?.data?.requiresAuth) {
              toast.error("Card requires authentication — please enter card details manually.");
              setForm(prev => ({ ...prev, stripePaymentMethodId: undefined }));
              return;
            }
            toast.error(`Saved card payment failed: ${err.message}`);
            return;
          }
        } else {
          const paymentResult = await processCardPayment();
          if (!paymentResult) {
            return;
          }
          paymentIntentId = paymentResult.paymentIntentId;
          stripePaymentMethodId = paymentResult.paymentMethodId;
          // Capture card details for saving to customer profile
          if (paymentResult.cardLast4) {
            cardDetailsForSave = {
              cardLast4: paymentResult.cardLast4,
              cardBrand: paymentResult.cardBrand,
              cardExpMonth: paymentResult.cardExpMonth,
              cardExpYear: paymentResult.cardExpYear,
            };
          }
        }
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
        serviceType: form.serviceType || "TAXI",
        customerId: form.customerId || undefined,
        pickupAddress: form.pickupAddress,
        pickupLat: form.pickupLat,
        pickupLng: form.pickupLng,
        dropoffAddress: form.dropoffAddress || undefined,
        dropoffLat: form.dropoffLat || undefined,
        dropoffLng: form.dropoffLng || undefined,
        // Intermediate stops/waypoints
        stops: form.stops.length > 0 ? form.stops.map((s, i) => ({ ...s, order: i + 1 })) : undefined,
        // Job source - DISPATCH for jobs created from dispatch panel
        source: 'DISPATCH',
        passengerName: form.passengerName?.trim() || undefined,
        phone: form.phone?.trim() || undefined,
        email: form.email || undefined,
        vehicleType: form.vehicleType || 'SEDAN',
        tariffId: form.tariffId || undefined,
        notes: form.notes || undefined,
        // ✅ FIX: Backend expects 'scheduledTime' for CREATE and 'scheduledFor' for UPDATE
        // Send null (not undefined) to clear scheduled time when changing to "now"
        scheduledTime: scheduledDateTime, // For create endpoint
        scheduledFor: scheduledDateTime, // For update endpoint
        passengers: form.passengers,
        bags: form.bags,
        wheelchairs: form.wheelchairs,
        vehiclesNeeded: form.vehiclesNeeded,
        paymentMethod: form.isAlreadyPaid ? 'card' : form.paymentMethod,
        paymentIntentId: paymentIntentId || (form.isAlreadyPaid ? form.paymentIntentId : undefined),
        stripePaymentMethodId: stripePaymentMethodId || (form.isAlreadyPaid ? form.stripePaymentMethodId : undefined),
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
        // Parcel metadata — same shape as the v2 payload below. Mirrored
        // here so legacy /api/dispatch/jobs and v2 /api/v2/jobs both
        // persist parcel info on the ride record.
        ...(form.serviceType === "COURIER"
          ? {
              courierDetails: {
                fragile: !!form.fragile,
                totalWeightKg: form.parcelWeightKg ?? null,
                stopCount: 1 + (form.stops?.length || 0),
                parcelDescriptions: form.parcelDescription ? [form.parcelDescription] : [],
                recipient: { name: form.recipientName || "", phone: form.recipientPhone || "" },
              },
            }
          : {}),
        ...(form.serviceType === "DELIVERY"
          ? {
              deliveryDetails: {
                deliveryType: "PACKAGE",
                packageSize: null,
                weightKg: form.parcelWeightKg ?? null,
                fragile: !!form.fragile,
                proofRequired: !!form.proofOfDelivery,
                sender: { name: form.passengerName || "", phone: form.phone || "" },
                recipient: { name: form.recipientName || "", phone: form.recipientPhone || "" },
                notes: form.parcelDescription || null,
              },
            }
          : {}),
      };

      const v2Payload = {
        serviceType: form.serviceType || "TAXI",
        customerId: form.customerId || undefined,
        channel: "DISPATCH",
        pickupLocation: {
          address: form.pickupAddress,
          latitude: form.pickupLat,
          longitude: form.pickupLng,
          contactName: form.passengerName?.trim() || undefined,
          contactPhone: form.phone?.trim() || undefined,
        },
        dropoffLocation: form.dropoffAddress
          ? {
              address: form.dropoffAddress,
              latitude: form.dropoffLat,
              longitude: form.dropoffLng,
            }
          : undefined,
        stops:
          form.stops.length > 0
            ? form.stops.map((s, idx) => ({
                address: s.address,
                latitude: s.latitude,
                longitude: s.longitude,
                sequence: idx + 1,
                type: idx === 0 ? "PICKUP" : "DROPOFF",
              }))
            : undefined,
        vehicleType: form.vehicleType || 'SEDAN',
        tariffId: form.tariffId || undefined,
        deliveryType: undefined,
        tipAmount: 0,
        // Honour the explicit photo-proof toggle the dispatcher set on the
        // parcel-fields panel. Default to true for non-TAXI when unset so
        // existing behaviour is preserved.
        proofRequired: form.serviceType === "TAXI"
          ? false
          : (form.proofOfDelivery ?? true),
        notes: form.notes || undefined,
        // Parcel metadata — packaged into a single object the backend can
        // tuck into rides.courierDetails / rides.foodDeliveryDetails. Only
        // sent for non-TAXI service types; TAXI ignores it.
        ...(form.serviceType === "COURIER"
          ? {
              courierDetails: {
                fragile: !!form.fragile,
                totalWeightKg: form.parcelWeightKg ?? null,
                stopCount: 1 + (form.stops?.length || 0),
                parcelDescriptions: form.parcelDescription ? [form.parcelDescription] : [],
                recipient: { name: form.recipientName || "", phone: form.recipientPhone || "" },
              },
            }
          : {}),
        ...(form.serviceType === "DELIVERY"
          ? {
              deliveryDetails: {
                deliveryType: "PACKAGE",
                packageSize: null,
                weightKg: form.parcelWeightKg ?? null,
                fragile: !!form.fragile,
                proofRequired: !!form.proofOfDelivery,
                sender: { name: form.passengerName || "", phone: form.phone || "" },
                recipient: { name: form.recipientName || "", phone: form.recipientPhone || "" },
                notes: form.parcelDescription || null,
              },
            }
          : {}),
        scheduledAt: scheduledDateTime?.toISOString() ?? undefined,
        tags: [],
        // Payment fields — preserve card for already-paid jobs
        paymentMethod: form.isAlreadyPaid ? 'card' : form.paymentMethod,
        paymentIntentId: paymentIntentId || (form.isAlreadyPaid ? form.paymentIntentId : undefined),
        stripePaymentMethodId: stripePaymentMethodId || (form.isAlreadyPaid ? form.stripePaymentMethodId : undefined),
        currency: form.currency,
        estimatedFare: form.estimatedFare,
        estimatedDistance: form.estimatedDistance,
        passengers: form.passengers,
        bags: form.bags,
        wheelchairs: form.wheelchairs,
        vehiclesNeeded: form.vehiclesNeeded,
        // Rider details
        passengerName: form.passengerName?.trim() || undefined,
        phone: form.phone?.trim() || undefined,
        email: form.email || undefined,
        // Driver assignment fields - CRITICAL for manual assignment
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
        // Use V1 API for manual driver assignment to ensure proper socket notifications
        const useV1ForManualAssignment = form.driverAssignment === "manual" && form.selectedDriverId;
        
        const createOne = async (payload: any) => {
          if (useV1ForManualAssignment) {
            // Use V1 API which has full driver assignment support
            return await createJobAPI(payload);
          } else {
            // Use V2 API for other cases
            const result = await createJobV2(payload);
            return (result as any)?.data ?? result;
          }
        };
        
        if (vehicleCount > 1) {
          // Create multiple jobs for multiple vehicles
          const jobPromises = [];
          for (let i = 0; i < vehicleCount; i++) {
            const vehicleJobPayload = useV1ForManualAssignment ? {
              ...jobPayload,
              vehiclesNeeded: 1,
              notes: `${jobPayload.notes || ""} (Vehicle ${i + 1} of ${vehicleCount})`.trim(),
            } : {
              ...v2Payload,
              vehiclesNeeded: 1, // Each job is for one vehicle
              notes: `${jobPayload.notes || ""} (Vehicle ${i + 1} of ${vehicleCount})`.trim(),
            };
            jobPromises.push(createOne(vehicleJobPayload));
          }
          
          const responses = await Promise.all(jobPromises);
          
          // Update store with all new jobs
          responses.forEach((response, index) => {
            const resData = (response as any)?.data ?? response;
            if (resData) {
              const newJob = {
                id: resData.id || resData.rideId,
                reference: resData.rideId || resData.id,
                pickupAddress: form.pickupAddress,
                dropoffAddress: form.dropoffAddress,
                serviceType: form.serviceType,
                status: (resData.status || "UNASSIGNED") as any,
                requestedAt: new Date().toISOString(),
                riderName: form.passengerName,
                paymentMethod: form.isAlreadyPaid ? 'card' : form.paymentMethod,
                paymentStatus: (form.paymentMethod === 'card' && paymentIntentId) ? 'PAID' : undefined,
                chargedAmount: (form.paymentMethod === 'card' && paymentIntentId) ? (form.cardChargeAmount || form.estimatedFare) : undefined,
                paymentIntentId: paymentIntentId || undefined,
                stripePaymentMethodId: stripePaymentMethodId || undefined,
                driverId: resData.driverId,
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
        // Use V1 API for manual driver assignment to ensure proper socket notifications
        const useV1ForManualAssignment = form.driverAssignment === "manual" && form.selectedDriverId;
        
        let created;
        if (useV1ForManualAssignment) {
          // Use V1 API which has full driver assignment support
          console.log("[JobComposer] Using V1 API for manual driver assignment");
          created = await createJobAPI(jobPayload);
        } else {
          // Use V2 API for other cases
          created = await createOne(v2Payload);
        }
        
          response = created;

          // Update the store with the new job
          if (response?.data || response?.id) {
            const jobData = response.data || response;
            const newJob = {
              id: jobData.id || jobData.rideId,
              reference: jobData.rideId || jobData.id,
              serviceType: form.serviceType,
              pickupAddress: form.pickupAddress,
              dropoffAddress: form.dropoffAddress,
              status: (jobData.status || "UNASSIGNED") as any,
              requestedAt: new Date().toISOString(),
              riderName: form.passengerName,
              paymentMethod: form.isAlreadyPaid ? 'card' : form.paymentMethod,
              paymentStatus: (form.paymentMethod === 'card' && paymentIntentId) ? 'PAID' : undefined,
              chargedAmount: (form.paymentMethod === 'card' && paymentIntentId) ? (form.cardChargeAmount || form.estimatedFare) : undefined,
              paymentIntentId: paymentIntentId || undefined,
              stripePaymentMethodId: stripePaymentMethodId || undefined,
              driverId: jobData.driverId,
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

      // Auto-save card to customer profile after successful card payment
      if (form.customerId && stripePaymentMethodId && form.paymentMethod === 'card' && !isEditMode) {
        try {
          await saveCustomerCard(form.customerId, {
            stripePaymentMethodId,
            cardLast4: cardDetailsForSave?.cardLast4 || '****',
            cardBrand: cardDetailsForSave?.cardBrand,
            cardExpMonth: cardDetailsForSave?.cardExpMonth,
            cardExpYear: cardDetailsForSave?.cardExpYear,
          });
          console.log("[JobComposer] Saved card to customer profile");
        } catch (err) {
          // Best-effort — don't block job creation flow
          console.warn("[JobComposer] Failed to save card to customer profile:", err);
        }
      }

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
      
      // Build user-friendly error message from validation errors
      const respData = error.response?.data;
      let errorMessage: string;

      if (respData?.code === "VALIDATION_ERROR" && Array.isArray(respData.errors) && respData.errors.length > 0) {
        // Map field paths to friendly labels
        const fieldLabels: Record<string, string> = {
          "pickupLocation.contactName": "Pickup Contact Name",
          "pickupLocation.contactPhone": "Pickup Contact Phone",
          "pickupLocation.address": "Pickup Address",
          "pickupLocation.latitude": "Pickup Location",
          "pickupLocation.longitude": "Pickup Location",
          "dropoffLocation.contactName": "Dropoff Contact Name",
          "dropoffLocation.contactPhone": "Dropoff Contact Phone",
          "dropoffLocation.address": "Dropoff Address",
          "dropoffLocation.latitude": "Dropoff Location",
          "dropoffLocation.longitude": "Dropoff Location",
          "serviceType": "Service Type",
          "companyId": "Company",
          "channel": "Channel",
          "customerId": "Customer",
          "scheduledAt": "Schedule Date/Time",
          "tipAmount": "Tip Amount",
        };

        const friendlyErrors = respData.errors.map((err: { field?: string; message?: string }) => {
          const label = fieldLabels[err.field || ""] || err.field?.split(".").pop() || "Field";
          // Clean up Joi-style messages
          const cleanMsg = (err.message || "is invalid")
            .replace(/^"[^"]+" /, "") // remove Joi field prefix like "pickupLocation.contactPhone"
            .replace("is not allowed to be empty", "is required")
            .replace("is required", "is required");
          return `${label} ${cleanMsg}`;
        });

        errorMessage = friendlyErrors.join("\n");
      } else {
        errorMessage =
          respData?.message ||
          respData?.error ||
          error.message ||
          (isEditMode ? "Failed to update job. Please try again." : "Failed to create job. Please try again.");
      }

      toast.error(errorMessage, { id: loadingToast, duration: 5000 });
    }
    } finally {
      setSubmitting(false);
    }
  };

  // Get active drivers
  const activeDrivers = drivers.filter(
    (d) => d.status === "AVAILABLE" || d.status === "BUSY"
  );

  return (
    <div className={`flex flex-col h-full ${isDark ? 'bg-slate-900' : 'bg-white'}`}>
      <form onSubmit={handleSubmit} className="flex-1 p-3 space-y-2 text-xs">
        {/* Service type selector */}
        <div className="flex items-center justify-between gap-2 rounded-lg border px-2 py-2">
          <div className="flex flex-col">
            <span className="text-[10px] font-semibold text-slate-500">Service Type</span>
            <span className="text-[11px] text-slate-400">Choose Taxi, Delivery or Courier</span>
          </div>
          <ServiceTypeSelector
            value={form.serviceType}
            onChange={(val) => handleChange("serviceType", (val as any) || "TAXI")}
            allowedTypes={["TAXI", "DELIVERY", "COURIER"]}
            showAll={false}
            variant="tabs"
          />
        </div>
        {/* Row 1: Pickup & Dropoff side by side */}
        <div className="flex items-start gap-2">
          <div className="flex-1 relative">
            <div className="flex items-center justify-between mb-0.5">
              <label className={`block text-[10px] font-medium ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>Pickup *</label>
              <button
                type="button"
                onClick={() => setMapPickMode({ target: 'pickup' })}
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                  mapPickMode?.target === 'pickup'
                    ? 'bg-blue-500 text-white'
                    : isDark
                      ? 'bg-slate-700 text-blue-300 hover:bg-slate-600'
                      : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                }`}
                title="Click a spot on the map to set pickup"
              >
                {mapPickMode?.target === 'pickup' ? '📍 Click map…' : '📍 Pick on map'}
              </button>
            </div>
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
              <div className={`absolute z-50 w-full mt-0.5 border rounded shadow-lg max-h-32 overflow-y-auto ${isDark ? 'bg-slate-900/95 border-slate-600 text-slate-100 shadow-2xl backdrop-blur-sm' : 'bg-white border-gray-300'}`}>
                {pickupSuggestions.map((location) => (
                  <button key={location.id} type="button" onClick={() => selectPickupLocation(location)}
                    className={`w-full px-2 py-1 text-left text-xs border-b ${isDark ? 'hover:bg-slate-800/80 border-slate-700 text-slate-50' : 'hover:bg-blue-50 border-gray-100'}`}>
                    {location.description}
                  </button>
                ))}
              </div>
            )}
          </div>
          
          {/* Swap Button - Centered between fields */}
          <button
            type="button"
            onClick={() => {
              if (form.pickupAddress && form.dropoffAddress) {
                const temp = form.pickupAddress;
                handleChange('pickupAddress', form.dropoffAddress);
                handleChange('dropoffAddress', temp);
                
                const tempLat = form.pickupLat;
                const tempLng = form.pickupLng;
                handleChange('pickupLat', form.dropoffLat);
                handleChange('pickupLng', form.dropoffLng);
                handleChange('dropoffLat', tempLat);
                handleChange('dropoffLng', tempLng);
                
                toast.success('Pickup and dropoff swapped');
              }
            }}
            disabled={!form.pickupAddress || !form.dropoffAddress}
            className={`flex-shrink-0 mt-[18px] w-7 h-7 rounded-lg flex items-center justify-center transition-all shadow-md ${
              form.pickupAddress && form.dropoffAddress
                ? (isDark ? 'bg-blue-600 hover:bg-blue-700 border border-blue-500 text-white' : 'bg-blue-500 hover:bg-blue-600 border border-blue-400 text-white')
                : (isDark ? 'bg-slate-700 border border-slate-600 text-slate-500 cursor-not-allowed' : 'bg-gray-200 border border-gray-300 text-gray-400 cursor-not-allowed')
            }`}
            title="Swap pickup and dropoff"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7h12M8 7l4-4M8 7l4 4m4 10H4m12 0l-4 4m4-4l-4-4" />
            </svg>
          </button>
          
          <div className="flex-1 relative">
            <div className="flex items-center justify-between mb-0.5">
              <label className={`block text-[10px] font-medium ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>Dropoff</label>
              <button
                type="button"
                onClick={() => setMapPickMode({ target: 'dropoff' })}
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                  mapPickMode?.target === 'dropoff'
                    ? 'bg-green-500 text-white'
                    : isDark
                      ? 'bg-slate-700 text-green-300 hover:bg-slate-600'
                      : 'bg-green-50 text-green-600 hover:bg-green-100'
                }`}
                title="Click a spot on the map to set dropoff"
              >
                {mapPickMode?.target === 'dropoff' ? '📍 Click map…' : '📍 Pick on map'}
              </button>
            </div>
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
              <div className={`absolute z-50 w-full mt-0.5 border rounded shadow-lg max-h-32 overflow-y-auto ${isDark ? 'bg-slate-900/95 border-slate-600 text-slate-100 shadow-2xl backdrop-blur-sm' : 'bg-white border-gray-300'}`}>
                {dropoffSuggestions.map((location) => (
                  <button key={location.id} type="button" onClick={() => selectDropoffLocation(location)}
                    className={`w-full px-2 py-1 text-left text-xs border-b ${isDark ? 'hover:bg-slate-800/80 border-slate-700 text-slate-50' : 'hover:bg-blue-50 border-gray-100'}`}>
                    {location.description}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Intermediate Stops Section */}
        <div className={`rounded-lg p-3 ${isDark ? 'bg-slate-800 border border-slate-600' : 'bg-blue-50 border border-blue-200'}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className={`w-1 h-4 rounded ${isDark ? 'bg-blue-500' : 'bg-blue-600'}`}></div>
              <span className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-gray-800'}`}>Intermediate Stops</span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${isDark ? 'bg-slate-700 text-slate-300' : 'bg-blue-100 text-blue-700'}`}>
                {form.stops.length}
              </span>
            </div>
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
              className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${form.dropoffAddress ? (isDark ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-blue-600 text-white hover:bg-blue-700') : 'bg-gray-400 text-gray-200 cursor-not-allowed'}`}
            >
              + Add Stop
            </button>
          </div>
          {form.stops.length > 0 && (
            <div className="space-y-1">
              {form.stops.map((stop, index) => (
                <div
                  key={`stop-${index}-${stop.order}`}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', String(index));
                    (e.currentTarget as HTMLElement).style.opacity = '0.5';
                  }}
                  onDragEnd={(e) => {
                    (e.currentTarget as HTMLElement).style.opacity = '1';
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
                    if (fromIndex === index) return;
                    const newStops = [...form.stops];
                    const [moved] = newStops.splice(fromIndex, 1);
                    newStops.splice(index, 0, moved);
                    handleChange('stops', newStops.map((s, i) => ({ ...s, order: i + 1 })));
                    toast.success('Stop reordered');
                  }}
                  className={`relative flex items-center gap-2 p-2 rounded cursor-grab active:cursor-grabbing ${isDark ? 'bg-slate-700/50' : 'bg-white'}`}
                >
                  {/* Drag Handle */}
                  <div className={`flex-shrink-0 flex items-center justify-center w-5 ${isDark ? 'text-slate-400' : 'text-gray-400'}`} title="Drag to reorder">
                    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                      <circle cx="5" cy="3" r="1.5" />
                      <circle cx="11" cy="3" r="1.5" />
                      <circle cx="5" cy="8" r="1.5" />
                      <circle cx="11" cy="8" r="1.5" />
                      <circle cx="5" cy="13" r="1.5" />
                      <circle cx="11" cy="13" r="1.5" />
                    </svg>
                  </div>
                  <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${isDark ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700'}`}>
                    {index + 1}
                  </div>
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      placeholder={`Stop ${index + 1} address`}
                      value={stop.address}
                      onChange={(e) => handleStopSearch(e.target.value, index)}
                      onFocus={() => setActiveStopIndex(index)}
                      onBlur={() => setTimeout(() => {
                        setActiveStopIndex(null);
                        // Auto-geocode if stop has text but no coordinates
                        autoGeocodeStop(index);
                      }, 250)}
                      className={`w-full pl-3 pr-7 py-1.5 border rounded text-sm focus:ring-2 focus:ring-blue-500 ${isDark ? 'bg-slate-800 border-slate-600 text-slate-100 placeholder-slate-400' : 'bg-white border-gray-300 placeholder-gray-400'}`}
                    />
                    {/* Geocoded indicator */}
                    <div className="absolute right-2 top-1/2 -translate-y-1/2" title={stop.latitude && stop.longitude ? `Located: ${stop.latitude?.toFixed(4)}, ${stop.longitude?.toFixed(4)}` : 'Not yet located'}>
                      <div className={`w-2 h-2 rounded-full ${stop.latitude && stop.longitude ? 'bg-green-500' : 'bg-orange-400 animate-pulse'}`}></div>
                    </div>
                    {/* Stop Suggestions Dropdown */}
                    {activeStopIndex === index && stopSuggestions[index]?.length > 0 && (
                      <div className={`absolute z-[60] w-full mt-1 border-2 rounded-lg shadow-2xl max-h-40 overflow-y-auto ${isDark ? 'bg-slate-700 border-slate-500' : 'bg-white border-gray-300'}`}>
                        {stopSuggestions[index].map((location) => (
                          <button
                            key={location.id}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              selectStopLocation(location, index);
                            }}
                            className={`w-full px-3 py-2.5 text-left text-sm border-b transition-colors ${isDark ? 'hover:bg-blue-600/40 border-slate-600 text-white font-medium' : 'hover:bg-blue-50 border-gray-100 text-gray-800'}`}
                          >
                            {location.description}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setMapPickMode({ target: 'stop', index })}
                    className={`flex-shrink-0 px-2 h-8 rounded-full text-[10px] font-semibold transition-colors ${
                      mapPickMode?.target === 'stop' && (mapPickMode as any).index === index
                        ? 'bg-amber-500 text-white'
                        : isDark
                          ? 'bg-slate-700 text-amber-300 hover:bg-slate-600'
                          : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                    }`}
                    title="Click a spot on the map to set this stop"
                  >
                    {mapPickMode?.target === 'stop' && (mapPickMode as any).index === index ? '📍…' : '📍 Map'}
                  </button>

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
                      toast.success(`Stop removed`);
                    }}
                    className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isDark ? 'hover:bg-red-900/50 text-red-400 hover:text-red-300' : 'hover:bg-red-50 text-red-500 hover:text-red-600'}`}
                    title="Remove stop"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          {form.stops.length === 0 && (
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
              {form.dropoffAddress 
                ? "No intermediate stops added. Click \"+ Add Stop\" to add waypoints."
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
              {availableVehicleTypes.map((vt: any, index: number) => (
                <option key={vt.id || vt.code || index} value={vt.code || vt.name || vt.id}>
                  {vt.name || vt.code || vt.id}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={`block text-[10px] font-medium mb-0.5 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>Tariff</label>
            <select value={form.tariffId} onChange={(e) => handleChange("tariffId", e.target.value)}
              className={`w-full px-2 py-1.5 border rounded text-xs ${isDark ? 'bg-slate-800 border-slate-600 text-slate-200' : 'border-gray-300 bg-white'}`}>
              {((zoneTariffs?.length ?? 0) > 0 ? zoneTariffs : (tariffs || [])).map((item: any) => {
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
              min={new Date().toISOString().split("T")[0]}
              className={`px-2 py-1.5 border rounded text-xs ${isDark ? 'bg-slate-800 border-slate-600 text-slate-200 [color-scheme:dark]' : 'border-gray-300'}`} />
            <input type="time" value={form.scheduledTime || ""} onChange={(e) => handleChange("scheduledTime", e.target.value)}
              className={`px-2 py-1.5 border rounded text-xs ${isDark ? 'bg-slate-800 border-slate-600 text-slate-200 [color-scheme:dark]' : 'border-gray-300'}`} />
          </div>
        )}

        {/* Row 3: Customer Search (Name / Phone) with Dropdown */}
        <div ref={customerSearchRef} className="relative">
          <div className="grid grid-cols-2 gap-2">
            <div className="relative">
              <Search className={`absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 ${isDark ? 'text-slate-500' : 'text-gray-400'}`} />
              <input type="text" placeholder="Search name or type new..."
                value={form.passengerName}
                onChange={(e) => handleCustomerSearch(e.target.value, "passengerName")}
                onFocus={() => { if (customerResults.length > 0) setShowCustomerDropdown(true); }}
                className={`w-full pl-7 pr-7 py-1.5 border rounded text-xs ${isDark ? 'bg-slate-800 border-slate-600 text-slate-200 placeholder-slate-500' : 'border-gray-300'} ${form.customerId ? (isDark ? 'border-emerald-600 bg-emerald-900/20' : 'border-emerald-400 bg-emerald-50') : ''}`} />
              {form.customerId && (
                <button type="button" onClick={clearSelectedCustomer}
                  className={`absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-red-100 ${isDark ? 'text-slate-400 hover:text-red-400 hover:bg-red-900/30' : 'text-gray-400 hover:text-red-500'}`}>
                  <XIcon className="w-3 h-3" />
                </button>
              )}
            </div>
            <div className="relative">
              <Phone className={`absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 ${isDark ? 'text-slate-500' : 'text-gray-400'}`} />
              <input type="tel" placeholder="Search phone or type new..."
                value={form.phone}
                onChange={(e) => handleCustomerSearch(e.target.value, "phone")}
                onFocus={() => { if (customerResults.length > 0) setShowCustomerDropdown(true); }}
                className={`w-full pl-7 pr-2 py-1.5 border rounded text-xs ${isDark ? 'bg-slate-800 border-slate-600 text-slate-200 placeholder-slate-500' : 'border-gray-300'} ${form.customerId ? (isDark ? 'border-emerald-600 bg-emerald-900/20' : 'border-emerald-400 bg-emerald-50') : ''}`} />
            </div>
          </div>

          {/* Customer Search Dropdown */}
          {showCustomerDropdown && customerResults.length > 0 && (
            <div className={`absolute z-50 w-full mt-1 rounded-lg shadow-2xl border-2 max-h-48 overflow-y-auto ${isDark ? 'bg-slate-800 border-slate-500 backdrop-blur-sm' : 'bg-white border-gray-300'}`}>
              <div className={`px-3 py-2 text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-200 border-b-2 border-slate-600 bg-slate-700' : 'text-gray-600 border-b border-gray-200 bg-gray-50'}`}>
                Existing Customers ({customerResults.length})
              </div>
              {customerResults.map((customer) => (
                <button key={customer.id} type="button"
                  onClick={() => selectCustomer(customer)}
                  className={`w-full px-3 py-2.5 text-left flex items-center gap-3 transition-all border-b ${isDark ? 'hover:bg-slate-700 text-white border-slate-700 hover:border-slate-600' : 'hover:bg-blue-50 text-gray-800 border-gray-100'}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${isDark ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-600'}`}>
                    {(customer.name || "?")[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-semibold truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      {customer.name}
                    </div>
                    <div className={`text-xs truncate ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>
                      {customer.phone}{customer.email ? ` · ${customer.email}` : ''}
                    </div>
                  </div>
                  {customer.rideHistory ? (
                    <span className={`text-[10px] px-2 py-1 rounded-full font-medium ${isDark ? 'bg-slate-600 text-slate-200' : 'bg-gray-200 text-gray-700'}`}>
                      {customer.rideHistory} rides
                    </span>
                  ) : null}
                  {customer.savedCard?.hasCard && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5 ${isDark ? 'bg-blue-900/50 text-blue-300 border border-blue-700' : 'bg-blue-50 text-blue-600 border border-blue-200'}`}>
                      <CreditCard className="w-3 h-3" />
                      {customer.savedCard.cardLast4}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Saved Card Popup — compact inline banner */}
          {showSavedCardPopup && selectedCustomerSavedCard && (
            <div className={`mt-1 flex items-center gap-2 px-2.5 py-1.5 rounded-md border ${isDark ? 'bg-blue-900/30 border-blue-700/60' : 'bg-blue-50 border-blue-200'}`}>
              <CreditCard className={`w-3.5 h-3.5 flex-shrink-0 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
              <span className={`text-[11px] font-medium truncate ${isDark ? 'text-blue-200' : 'text-blue-700'}`}>
                {formatCardBrand(selectedCustomerSavedCard.cardBrand)} •••• {selectedCustomerSavedCard.cardLast4 || '****'}
                {selectedCustomerSavedCard.cardExpMonth && selectedCustomerSavedCard.cardExpYear
                  ? ` (${String(selectedCustomerSavedCard.cardExpMonth).padStart(2, '0')}/${String(selectedCustomerSavedCard.cardExpYear).slice(-2)})`
                  : ''}
              </span>
              <div className="flex gap-1 ml-auto flex-shrink-0">
                <button type="button" onClick={useSavedCard}
                  className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors whitespace-nowrap">
                  Use Card
                </button>
                <button type="button" onClick={dismissSavedCardPopup}
                  className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${isDark ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}>
                  ✕
                </button>
              </div>
            </div>
          )}
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

        {/* Parcel fields — DELIVERY / COURIER only. These drive
            rides.courierDetails / rides.foodDeliveryDetails on the backend
            so the owner-panel + dispatch detail views can show what's being
            moved without parsing the free-text instructions. Hidden when
            the job is a regular taxi to keep the form tight. */}
        {(form.serviceType === "DELIVERY" || form.serviceType === "COURIER") && (
          <div className={`rounded-lg border p-2 space-y-2 ${isDark ? 'border-slate-700 bg-slate-800/40' : 'border-gray-200 bg-gray-50'}`}>
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-semibold uppercase tracking-wide ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>
                {form.serviceType === "COURIER" ? "Courier Parcel" : "Delivery Parcel"}
              </span>
              <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Recipient + parcel metadata</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="text" placeholder="Recipient name" value={form.recipientName || ""}
                onChange={(e) => handleChange("recipientName", e.target.value)}
                className={`w-full px-2 py-1.5 border rounded text-xs ${isDark ? 'bg-slate-800 border-slate-600 text-slate-200 placeholder-slate-500' : 'border-gray-300'}`} />
              <input type="tel" placeholder="Recipient phone" value={form.recipientPhone || ""}
                onChange={(e) => handleChange("recipientPhone", e.target.value)}
                className={`w-full px-2 py-1.5 border rounded text-xs ${isDark ? 'bg-slate-800 border-slate-600 text-slate-200 placeholder-slate-500' : 'border-gray-300'}`} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input type="text" placeholder="What's inside?" value={form.parcelDescription || ""}
                onChange={(e) => handleChange("parcelDescription", e.target.value)}
                className={`col-span-2 w-full px-2 py-1.5 border rounded text-xs ${isDark ? 'bg-slate-800 border-slate-600 text-slate-200 placeholder-slate-500' : 'border-gray-300'}`} />
              <input type="number" min="0" step="0.1" placeholder="Weight kg" value={form.parcelWeightKg ?? ""}
                onChange={(e) => handleChange("parcelWeightKg", e.target.value === "" ? undefined : Number(e.target.value))}
                className={`w-full px-2 py-1.5 border rounded text-xs ${isDark ? 'bg-slate-800 border-slate-600 text-slate-200 placeholder-slate-500' : 'border-gray-300'}`} />
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <label className={`flex items-center gap-1 cursor-pointer ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                <input type="checkbox" checked={!!form.fragile}
                  onChange={(e) => handleChange("fragile", e.target.checked as any)} />
                Fragile
              </label>
              <label className={`flex items-center gap-1 cursor-pointer ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                <input type="checkbox" checked={!!form.proofOfDelivery}
                  onChange={(e) => handleChange("proofOfDelivery", e.target.checked as any)} />
                Photo proof of delivery
              </label>
            </div>
          </div>
        )}

        {/* Row 5: Requirements (Passengers, Bags, Wheelchairs, Vehicles) */}
        <div className="grid grid-cols-4 gap-2">
          <div className="text-center">
            <label className={`block text-[10px] ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>
              <Users className="w-3 h-3 inline" /> Pass
              <span className={`ml-0.5 ${isDark ? 'text-slate-600' : 'text-gray-400'}`}>/{maxAvailableCapacity}</span>
            </label>
            <input type="number" min="1" max={maxAvailableCapacity || 1} value={form.passengers}
              onChange={(e) => handleChange("passengers", parseInt(e.target.value) || 1)}
              className={`w-full py-1 border rounded text-xs text-center ${isDark ? 'bg-slate-800 border-slate-600 text-slate-200' : 'border-gray-300'}`} />
          </div>
          <div className="text-center">
            <label className={`block text-[10px] ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>
              <Briefcase className="w-3 h-3 inline" /> Bags
              <span className={`ml-0.5 ${isDark ? 'text-slate-600' : 'text-gray-400'}`}>/{maxAvailableBags}</span>
            </label>
            <input type="number" min="0" max={maxAvailableBags || 0} value={form.bags}
              onChange={(e) => handleChange("bags", parseInt(e.target.value) || 0)}
              className={`w-full py-1 border rounded text-xs text-center ${isDark ? 'bg-slate-800 border-slate-600 text-slate-200' : 'border-gray-300'}`} />
          </div>
          <div className="text-center">
            <label className={`block text-[10px] ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>
              <Accessibility className="w-3 h-3 inline" /> WC
              <span className={`ml-0.5 ${isDark ? 'text-slate-600' : 'text-gray-400'}`}>/{maxAvailableWheelchairs}</span>
            </label>
            <input type="number" min="0" max={maxAvailableWheelchairs} value={form.wheelchairs}
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
              <button type="button"
                disabled={form.isAlreadyPaid}
                onClick={() => !form.isAlreadyPaid && handleChange("paymentMethod", "cash")}
                className={`flex-1 py-1 rounded text-[10px] font-medium flex items-center justify-center gap-1 ${form.paymentMethod === "cash" ? "bg-green-600 text-white" : isDark ? "bg-slate-700 text-slate-300" : "bg-gray-100"} ${form.isAlreadyPaid ? "opacity-40 cursor-not-allowed" : ""}`}>
                <DollarSign className="w-3 h-3" /> Cash
              </button>
              <button type="button" disabled={!cardPaymentsEnabled} onClick={() => {
                if (!cardPaymentsEnabled) return;
                if (!form.passengerName?.trim()) {
                  toast.error("Please enter customer name before selecting card payment.");
                  return;
                }
                handleChange("paymentMethod", "card");
              }}
                className={`flex-1 py-1 rounded text-[10px] font-medium flex items-center justify-center gap-1 ${form.paymentMethod === "card" ? "bg-blue-600 text-white" : isDark ? "bg-slate-700 text-slate-300" : "bg-gray-100"} ${!cardPaymentsEnabled ? "opacity-50" : ""}`}>
                <CreditCard className="w-3 h-3" /> Card
                {form.isAlreadyPaid && <span className="ml-0.5 text-[8px] font-bold bg-red-500 text-white rounded px-1">PAID</span>}
              </button>
            </div>
            {form.isAlreadyPaid && (
              <p className={`text-[9px] mt-0.5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                ✓ Payment already processed — cannot switch to cash
              </p>
            )}
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
              <option key={driver.id} value={driver.id}>{driver.name}{driver.vehicle && driver.vehicle !== 'N/A' ? ` - ${driver.vehicle}` : ''} - {driver.status}</option>
            ))}
          </select>
        )}

        {/* Card Element if card payment */}
        {form.paymentMethod === "card" && cardPaymentsEnabled && (
          <div className={`p-2.5 rounded-lg border-2 space-y-2 ${
            form.isAlreadyPaid 
              ? isDark ? 'bg-emerald-900/20 border-emerald-500/50' : 'bg-emerald-50/50 border-emerald-300'
              : isDark ? 'bg-slate-800 border-blue-500/50' : 'bg-blue-50/50 border-blue-300'
          }`}>
            
            {/* Already Paid State */}
            {form.isAlreadyPaid && isEditMode ? (
              <>
                <div className="flex items-center justify-between">
                  <label className={`block text-[10px] font-semibold uppercase tracking-wide ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                    ✓ Card Payment Completed
                  </label>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    isDark ? 'bg-emerald-600 text-white' : 'bg-emerald-500 text-white'
                  }`}>
                    💳 PAID
                  </span>
                </div>
                
                {form.originalChargedAmount != null && (
                  <div className={`flex items-center gap-2 text-xs ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                    <span>Amount charged:</span>
                    <span className="font-bold text-emerald-500">
                      {(form.currency || 'USD').toUpperCase()} ${Number(form.originalChargedAmount).toFixed(2)}
                    </span>
                  </div>
                )}

                {form.paymentIntentId && (
                  <div className={`text-[9px] font-mono ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                    Txn: {form.paymentIntentId.slice(0, 28)}...
                  </div>
                )}

                {/* Extra Charge Section */}
                <div className={`mt-1 pt-2 border-t ${isDark ? 'border-emerald-700/50' : 'border-emerald-200'}`}>
                  <label className={`block text-[10px] font-semibold uppercase tracking-wide mb-1 ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
                    💰 Extra Charge (Optional)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={form.extraChargeAmount ?? ''}
                      onChange={(e) => handleChange('extraChargeAmount', e.target.value ? parseFloat(e.target.value) : undefined)}
                      className={`flex-1 px-2 py-1.5 rounded border text-xs font-medium ${
                        isDark
                          ? 'bg-slate-700 border-slate-500 text-white placeholder-slate-500'
                          : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                      }`}
                    />
                    <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                      {(form.currency || 'USD').toUpperCase()}
                    </span>
                  </div>
                  {form.extraChargeAmount && form.extraChargeAmount > 0 && (
                    <input
                      type="text"
                      placeholder="Reason for extra charge..."
                      value={form.extraChargeDescription ?? ''}
                      onChange={(e) => handleChange('extraChargeDescription', e.target.value)}
                      className={`w-full mt-1 px-2 py-1 rounded border text-xs ${
                        isDark
                          ? 'bg-slate-700 border-slate-500 text-white placeholder-slate-500'
                          : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                      }`}
                    />
                  )}
                  <p className={`text-[9px] mt-1 ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                    {form.stripePaymentMethodId
                      ? 'Will charge using saved card on file — no re-entry needed.'
                      : 'Enter an amount to charge extra. Requires new card entry below.'}
                  </p>
                  {/* Stripe Fee Breakdown for Extra Charge */}
                  {form.extraChargeAmount && form.extraChargeAmount > 0 && (() => {
                    const fee = calculateStripeFee(form.extraChargeAmount);
                    return (
                      <div className={`mt-1.5 p-2 rounded border text-[10px] ${isDark ? 'bg-amber-900/20 border-amber-700/40 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                        <div className="flex items-center gap-1 mb-1">
                          <span className="font-semibold">💡 Stripe Fee on Extra Charge</span>
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          <div>
                            <span className={`block text-[8px] uppercase ${isDark ? 'text-amber-500' : 'text-amber-400'}`}>Stripe Fee</span>
                            <span className="font-bold text-red-400">-${formatFee(fee.totalFee)}</span>
                          </div>
                          <div>
                            <span className={`block text-[8px] uppercase ${isDark ? 'text-amber-500' : 'text-amber-400'}`}>You Receive</span>
                            <span className={`font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>${formatFee(fee.netReceived)}</span>
                          </div>
                          <div>
                            <span className={`block text-[8px] uppercase ${isDark ? 'text-amber-500' : 'text-amber-400'}`}>Break-even</span>
                            <span className={`font-bold ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>${formatFee(fee.chargeToBreakEven)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
                
                {/* Show saved card info OR card input for extra charge */}
                {form.extraChargeAmount && form.extraChargeAmount > 0 && (
                  form.stripePaymentMethodId ? (
                    <div className={`mt-1 p-2 rounded border flex items-center gap-2 ${isDark ? 'bg-emerald-900/30 border-emerald-600/40' : 'bg-emerald-50 border-emerald-200'}`}>
                      <CreditCard className={`w-4 h-4 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                      <div>
                        <span className={`text-[10px] font-semibold ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>
                          ✓ Using saved card on file
                        </span>
                        <p className={`text-[8px] font-mono ${isDark ? 'text-emerald-500' : 'text-emerald-500'}`}>
                          {form.stripePaymentMethodId.slice(0, 20)}...
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className={`mt-1 p-2 rounded border ${isDark ? 'bg-slate-900 border-amber-600/30' : 'bg-white border-amber-200'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <label className={`text-[9px] font-semibold ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
                          Card for extra charge
                        </label>
                        {form.customerId && (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const pm = await getCustomerPaymentMethod(form.customerId!);
                                if (pm?.stripePaymentMethodId) {
                                  setForm((prev) => ({ ...prev, stripePaymentMethodId: pm.stripePaymentMethodId }));
                                  setSelectedCustomerSavedCard({
                                    cardLast4: pm.cardLast4 || '****',
                                    cardBrand: pm.cardBrand || 'card',
                                    cardExpMonth: pm.cardExpMonth,
                                    cardExpYear: pm.cardExpYear,
                                  });
                                  toast.success(`Saved card ending in ${pm.cardLast4 || '****'} loaded`);
                                } else {
                                  toast.error('No saved card found for this customer');
                                }
                              } catch { toast.error('No saved card found'); }
                            }}
                            className={`text-[9px] font-medium underline ${isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-500'}`}
                          >
                            Use saved card
                          </button>
                        )}
                      </div>
                      <CardElement options={{ hidePostalCode: true, style: { base: { fontSize: "14px", color: isDark ? '#e2e8f0' : '#1f2937', '::placeholder': { color: isDark ? '#64748b' : '#9ca3af' } } } }} />
                    </div>
                  )
                )}
              </>
            ) : (
              <>
                {/* New Card Payment (Create mode or unpaid card job) */}
                {form.stripePaymentMethodId && !isEditMode ? (
                  <>
                    {/* Saved card loaded from customer profile */}
                    <div className={`flex items-center justify-between mb-1`}>
                      <label className={`text-[10px] font-semibold uppercase tracking-wide ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                        💳 Using Saved Card
                      </label>
                      <button type="button" onClick={() => {
                        setForm(prev => ({ ...prev, stripePaymentMethodId: undefined }));
                      }}
                        className={`text-[9px] underline ${isDark ? 'text-slate-400 hover:text-slate-300' : 'text-gray-500 hover:text-gray-700'}`}>
                        Enter new card
                      </button>
                    </div>
                    <div className={`p-2 rounded border flex items-center gap-2 ${isDark ? 'bg-blue-900/30 border-blue-600/40' : 'bg-blue-50 border-blue-200'}`}>
                      <CreditCard className={`w-4 h-4 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
                      <span className={`text-xs font-medium ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>
                        {selectedCustomerSavedCard
                          ? `${formatCardBrand(selectedCustomerSavedCard.cardBrand)} •••• ${selectedCustomerSavedCard.cardLast4 || '****'}`
                          : 'Saved card on file'}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <label className={`block text-[10px] font-semibold uppercase tracking-wide mb-1 ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                      💳 Card Details
                    </label>
                    <div className={`p-2.5 rounded border ${isDark ? 'bg-slate-900 border-slate-600' : 'bg-white border-gray-300'}`}>
                      <CardElement options={{ hidePostalCode: true, style: { base: { fontSize: "14px", color: isDark ? '#e2e8f0' : '#1f2937', '::placeholder': { color: isDark ? '#64748b' : '#9ca3af' } } } }} />
                    </div>
                  </>
                )}
                <div className="flex items-center gap-2">
                  <label className={`text-[10px] font-medium whitespace-nowrap ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                    Charge Amount ({(form.currency || 'USD').toUpperCase()})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={form.estimatedFare ? form.estimatedFare.toFixed(2) : '0.00'}
                    value={form.cardChargeAmount ?? ''}
                    onChange={(e) => handleChange('cardChargeAmount', e.target.value ? parseFloat(e.target.value) : undefined)}
                    className={`flex-1 px-2 py-1 rounded border text-xs font-medium ${
                      isDark
                        ? 'bg-slate-700 border-slate-500 text-white placeholder-slate-500'
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                    }`}
                  />
                </div>
                {!form.cardChargeAmount && form.estimatedFare && (
                  <p className={`text-[9px] ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                    Will charge estimated fare: ${form.estimatedFare.toFixed(2)} if left empty
                  </p>
                )}
                {/* Stripe Fee Breakdown */}
                {(() => {
                  const chargeAmt = form.cardChargeAmount || form.estimatedFare;
                  if (!chargeAmt || chargeAmt <= 0 || form.paymentMethod !== 'CARD') return null;
                  const fee = calculateStripeFee(chargeAmt);
                  return (
                    <div className={`mt-1.5 p-2 rounded border text-[10px] ${isDark ? 'bg-indigo-900/20 border-indigo-700/40 text-indigo-300' : 'bg-indigo-50 border-indigo-200 text-indigo-700'}`}>
                      <div className="flex items-center gap-1 mb-1">
                        <span className="font-semibold">💡 Stripe Fee Breakdown</span>
                        <span className={`text-[8px] ${isDark ? 'text-indigo-500' : 'text-indigo-400'}`}>(2.65% + $0.30)</span>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        <div>
                          <span className={`block text-[8px] uppercase ${isDark ? 'text-indigo-500' : 'text-indigo-400'}`}>Stripe Fee</span>
                          <span className="font-bold text-red-400">-${formatFee(fee.totalFee)}</span>
                        </div>
                        <div>
                          <span className={`block text-[8px] uppercase ${isDark ? 'text-indigo-500' : 'text-indigo-400'}`}>You Receive</span>
                          <span className={`font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>${formatFee(fee.netReceived)}</span>
                        </div>
                        <div>
                          <span className={`block text-[8px] uppercase ${isDark ? 'text-indigo-500' : 'text-indigo-400'}`}>Break-even</span>
                          <span className={`font-bold ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>${formatFee(fee.chargeToBreakEven)}</span>
                        </div>
                      </div>
                      <p className={`text-[8px] mt-1 ${isDark ? 'text-indigo-600' : 'text-indigo-300'}`}>
                        To receive exactly ${formatFee(chargeAmt)}, charge ${formatFee(fee.chargeToBreakEven)}
                      </p>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}

        {/* Fare Display */}
        {form.estimatedFare && (
          <div className={`flex justify-between items-center px-2 py-1 rounded text-xs ${isDark ? 'bg-blue-900/30' : 'bg-blue-50'}`}>
            <span className={isDark ? 'text-slate-400' : 'text-gray-600'}>Est. Fare: <strong className="text-blue-500">${form.estimatedFare.toFixed(2)}</strong></span>
            <span className={isDark ? 'text-slate-500' : 'text-gray-500'}>
              {form.estimatedDistance ? `${form.estimatedDistance.toFixed(1)} km` : ''}
              {form.stops.length > 0 && (
                <span className="ml-1">
                  ({form.stops.filter(s => s.latitude && s.longitude).length}/{form.stops.length} stops)
                </span>
              )}
            </span>
          </div>
        )}
        {/* Warning for ungeocoded stops */}
        {form.stops.length > 0 && form.stops.some(s => s.address && (!s.latitude || !s.longitude)) && (
          <div className={`text-[10px] px-2 py-1 rounded flex items-center gap-1 ${isDark ? 'bg-orange-900/30 text-orange-400' : 'bg-orange-50 text-orange-600'}`}>
            <span>⚠</span> {form.stops.filter(s => s.address && (!s.latitude || !s.longitude)).length} stop(s) not located — select from dropdown or click away to auto-locate
          </div>
        )}

        {/* Zone Info */}
        {detectedZone && (
          <div className={`text-[10px] px-2 py-1 rounded ${isDark ? 'text-slate-500 bg-slate-800' : 'text-gray-500 bg-gray-50'}`}>
            Zone: <span className="font-medium">{detectedZone.name}</span>
          </div>
        )}

        {/* Out-of-zone warning — shown when pickup has coords but no service
            zone contains them. The dispatcher can either pick a new pickup,
            jump to the owner's Zones page to create one, or explicitly
            acknowledge and continue (blocks submit otherwise). */}
        {form.pickupLat != null &&
         form.pickupLng != null &&
         !detectingZone &&
         !detectedZone &&
         !outOfZoneAck && (
          <div
            className={`rounded-md border px-3 py-2 text-[11px] ${
              isDark
                ? 'border-amber-500/40 bg-amber-900/20 text-amber-200'
                : 'border-amber-300 bg-amber-50 text-amber-900'
            }`}
          >
            <div className="flex items-start gap-2">
              <span className="text-sm leading-none mt-0.5">⚠️</span>
              <div className="flex-1">
                <div className="font-semibold mb-0.5">
                  Pickup is outside every service zone
                </div>
                <div className={`leading-snug ${isDark ? 'text-amber-200/80' : 'text-amber-800'}`}>
                  No zone covers {form.pickupAddress || 'this location'}, so the
                  job will have no zone-based pricing or queue assignment.
                  Change the pickup, create a new zone that covers it, or
                  proceed anyway.
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setForm((prev: any) => ({
                        ...prev,
                        pickupAddress: '',
                        pickupLat: undefined,
                        pickupLng: undefined,
                      }));
                      setDetectedZone(null);
                      setZoneTariffs([]);
                      setOutOfZoneAck(false);
                    }}
                    className={`px-2 py-1 rounded text-[10px] font-medium ${
                      isDark
                        ? 'bg-amber-700/40 hover:bg-amber-700/60 text-amber-100'
                        : 'bg-white hover:bg-amber-100 text-amber-900 border border-amber-300'
                    }`}
                  >
                    Change pickup
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      // The dispatch console doesn't own zone creation — the
                      // owner panel does. Open it in a new tab at the Zones
                      // page so the owner (or a dispatcher with access) can
                      // draw a zone around this pickup, then come back here
                      // and hit refresh on the address to re-run detection.
                      try {
                        const base = (window as any).__OWNER_PANEL_URL__;
                        const url = typeof base === 'string' && base.length > 0
                          ? `${base.replace(/\/$/, '')}/zones`
                          : '/zones';
                        window.open(url, '_blank', 'noopener');
                        toast('Zones page opened in a new tab', { icon: '🗺️' });
                      } catch {
                        toast('Open the Owner panel → Zones to create a zone here');
                      }
                    }}
                    className={`px-2 py-1 rounded text-[10px] font-medium ${
                      isDark
                        ? 'bg-blue-600 hover:bg-blue-500 text-white'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    Create zone
                  </button>
                  <button
                    type="button"
                    onClick={() => setOutOfZoneAck(true)}
                    className={`px-2 py-1 rounded text-[10px] font-medium ${
                      isDark
                        ? 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                        : 'bg-gray-200 hover:bg-gray-300 text-gray-800'
                    }`}
                  >
                    Proceed anyway
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Acknowledged chip — kept visible so the dispatcher remembers they
            opted to submit without a zone (and can take it back). */}
        {form.pickupLat != null &&
         form.pickupLng != null &&
         !detectedZone &&
         outOfZoneAck && (
          <div
            className={`flex items-center justify-between rounded border px-2 py-1 text-[10px] ${
              isDark
                ? 'border-amber-500/30 bg-amber-900/10 text-amber-300'
                : 'border-amber-200 bg-amber-50 text-amber-700'
            }`}
          >
            <span>⚠ No zone — proceeding anyway</span>
            <button
              type="button"
              onClick={() => setOutOfZoneAck(false)}
              className="underline font-medium"
            >
              Undo
            </button>
          </div>
        )}

        {/* V2 stop/POD extras when editing */}
        {isEditMode && editJobData?.id && (
          <div className="mt-3">
            <JobComposerV2Extras
              jobId={editJobData.id}
              stopId={editJobData?.stops?.[0]?.id}
            />
          </div>
        )}
      </form>

      {/* Footer Actions - Compact */}
      <div className={`border-t px-3 py-2 flex items-center justify-between gap-2 ${isDark ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-gray-50'}`}>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => {
            clearForm();
          }}
            className={`px-3 py-1.5 border rounded text-xs font-medium ${isDark ? 'border-slate-600 text-slate-400 bg-slate-700 hover:bg-slate-600' : 'border-gray-300 text-gray-600 bg-white hover:bg-gray-50'}`}>
            Clear
          </button>
          {isEditMode && (
            <button type="button" onClick={() => {
              // Clone: switch to create mode but keep form data
              if (onClone) onClone();
            }}
              className={`px-3 py-1.5 border rounded text-xs font-medium ${isDark ? 'border-amber-600 text-amber-400 bg-slate-700 hover:bg-slate-600' : 'border-amber-300 text-amber-600 bg-white hover:bg-amber-50'}`}>
              Clone
            </button>
          )}
        </div>
        <button type="submit" onClick={handleSubmit} disabled={loading || processingPayment || submitting}
          className="px-4 py-1.5 rounded text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
          {loading || processingPayment || submitting ? (isEditMode ? "Updating…" : "Creating…") : isEditMode ? "Update" : "Create Job"}
        </button>
      </div>
    </div>
  );
};

export const JobComposerV2Extras: React.FC<{
  jobId?: string;
  stopId?: string;
}> = ({ jobId, stopId }) => {
  const { flags } = useFeatureFlags();
  if (!jobId) {
    return (
      <div className="text-[11px] text-slate-500">
        Job ID required to view stop management.
      </div>
    );
  }

  const showStops = flags.v2Stops;
  const showPod = flags.v2POD && Boolean(stopId);

  return (
    <div className="rounded-md border border-slate-200 p-2">
      <div className="text-xs font-semibold mb-1">V2 Delivery/Courier</div>
      {!flags.v2Stops && (
        <div className="text-[11px] text-amber-600">
          V2 stop management is disabled by feature flag.
        </div>
      )}
      {showStops && <StopManagementPanel jobId={jobId} />}
      {flags.v2POD && !stopId && (
        <div className="text-[11px] text-slate-500 mt-2">
          POD viewer requires a stop selection.
        </div>
      )}
      {showPod && stopId && <PODViewer jobId={jobId} stopId={stopId} onClose={() => {}} />}
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
