import {
  Accessibility,
  Briefcase,
  Car,
  CreditCard,
  MapPin,
  Phone,
  Search,
  Truck,
  User,
  Users,
} from "lucide-react";
import React, { useState } from "react";
import toast from "react-hot-toast";
import { useDispatchStore } from "../../store/useDispatchStore";

interface JobFormState {
  pickupAddress: string;
  pickupLat?: number;
  pickupLng?: number;
  dropoffAddress: string;
  dropoffLat?: number;
  dropoffLng?: number;
  passengerName: string;
  phone: string;
  tariffId: string;
  driverId: string;
  notes: string;
  paymentMethod: string;
  vehicleType: string;
  passengerCount: number;
  baggageCount: number;
  wheelchairAccessible: boolean;
  towingRequired: boolean;
  scheduledFor: "now" | "later";
  scheduledDate?: string;
  scheduledTime?: string;
  estimatedFare?: number;
  estimatedDistance?: number;
  estimatedDuration?: number;
}

const VEHICLE_TYPES = [
  { value: "SEDAN", label: "Sedan", icon: Car },
  { value: "SUV", label: "SUV", icon: Car },
  { value: "VAN", label: "Van", icon: Car },
  { value: "TRUCK", label: "Truck", icon: Truck },
];

const JobComposerEnhanced: React.FC = () => {
  const tariffs = useDispatchStore((state) => state.tariffs);
  const drivers = useDispatchStore((state) => state.drivers);
  const createJob = useDispatchStore((state) => state.createJob);
  const loading = useDispatchStore((state) => state.loading);

  const [form, setForm] = useState<JobFormState>({
    pickupAddress: "",
    dropoffAddress: "",
    passengerName: "",
    phone: "",
    tariffId: "",
    driverId: "",
    notes: "",
    paymentMethod: "cash",
    vehicleType: "SEDAN",
    passengerCount: 1,
    baggageCount: 0,
    wheelchairAccessible: false,
    towingRequired: false,
    scheduledFor: "now",
  });

  const [customerResults, setCustomerResults] = useState<any[]>([]);

  const handleChange = (field: keyof JobFormState, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const clearForm = () => {
    setForm({
      pickupAddress: "",
      dropoffAddress: "",
      passengerName: "",
      phone: "",
      tariffId: "",
      driverId: "",
      notes: "",
      paymentMethod: "cash",
      vehicleType: "SEDAN",
      passengerCount: 1,
      baggageCount: 0,
      wheelchairAccessible: false,
      towingRequired: false,
      scheduledFor: "now",
    });
    setCustomerResults([]);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!form.pickupAddress || !form.dropoffAddress) {
      toast.error("Pickup and drop-off addresses are required.");
      return;
    }

    if (!form.passengerName || !form.phone) {
      toast.error("Passenger name and phone are required.");
      return;
    }

    if (
      form.scheduledFor === "later" &&
      (!form.scheduledDate || !form.scheduledTime)
    ) {
      toast.error("Please select date and time for scheduled ride.");
      return;
    }

    const loadingToast = toast.loading("Creating job...");

    try {
      await createJob({
        pickupAddress: form.pickupAddress,
        dropoffAddress: form.dropoffAddress,
        passengerName: form.passengerName,
        phone: form.phone,
        tariffId: form.tariffId || undefined,
        driverId: form.driverId || undefined,
        notes: form.notes,
        paymentMethod: form.paymentMethod,
        vehicleType: form.vehicleType,
        passengerCount: form.passengerCount,
        baggageCount: form.baggageCount,
        wheelchairAccessible: form.wheelchairAccessible,
        towingRequired: form.towingRequired,
        scheduledFor: form.scheduledFor,
        scheduledDate: form.scheduledDate,
        scheduledTime: form.scheduledTime,
      });

      toast.success("Job created successfully!", { id: loadingToast });
      clearForm();
    } catch (error) {
      console.error("Failed to create job", error);
      toast.error("Failed to create job. Please try again.", {
        id: loadingToast,
      });
    }
  };

  return (
    <div className="flex h-full flex-col border-l border-slate-200 bg-white">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-slate-200 px-6 py-3 bg-slate-50">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Create New Job
          </h2>
          <p className="text-xs text-slate-600">
            Enter ride details and assign driver
          </p>
        </div>
        <button
          type="button"
          onClick={clearForm}
          className="rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100 transition"
        >
          Clear
        </button>
      </header>

      <form
        className="flex-1 overflow-auto px-6 py-5 space-y-6"
        onSubmit={handleSubmit}
      >
        {/* Customer Search Section */}
        <section className="space-y-3">
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-700">
            <Search className="inline w-3 h-3 mr-1" />
            Search Customer
          </label>
          <input
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            placeholder="Search by name or phone number"
            onChange={(event) => {
              // TODO: Implement customer search API call
              console.log("Searching for:", event.target.value);
            }}
          />
        </section>

        {/* Scheduling Section */}
        <section className="space-y-3">
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-700">
            <Calendar className="inline w-3 h-3 mr-1" />
            Schedule
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleChange("scheduledFor", "now")}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
                form.scheduledFor === "now"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Now
            </button>
            <button
              type="button"
              onClick={() => handleChange("scheduledFor", "later")}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
                form.scheduledFor === "later"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Schedule Later
            </button>
          </div>
          {form.scheduledFor === "later" && (
            <div className="grid grid-cols-2 gap-3 mt-3">
              <input
                type="date"
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                value={form.scheduledDate || ""}
                onChange={(event) =>
                  handleChange("scheduledDate", event.target.value)
                }
                min={new Date().toISOString().split("T")[0]}
              />
              <input
                type="time"
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                value={form.scheduledTime || ""}
                onChange={(event) =>
                  handleChange("scheduledTime", event.target.value)
                }
              />
            </div>
          )}
        </section>

        {/* Locations Section */}
        <section className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-700 mb-1">
                Pick-up Location
              </label>
              <div className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2">
                <MapPin size={14} className="text-blue-600" />
                <input
                  className="flex-1 bg-transparent text-sm outline-none"
                  placeholder="123 Main St"
                  value={form.pickupAddress}
                  onChange={(event) =>
                    handleChange("pickupAddress", event.target.value)
                  }
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-700 mb-1">
                Drop-off Location
              </label>
              <div className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2">
                <MapPin size={14} className="text-emerald-600" />
                <input
                  className="flex-1 bg-transparent text-sm outline-none"
                  placeholder="Destination"
                  value={form.dropoffAddress}
                  onChange={(event) =>
                    handleChange("dropoffAddress", event.target.value)
                  }
                />
              </div>
            </div>
          </div>
        </section>

        {/* Vehicle & Passengers Section */}
        <section className="space-y-3">
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-700">
            Vehicle Type
          </label>
          <div className="grid grid-cols-4 gap-2">
            {VEHICLE_TYPES.map((vType) => (
              <button
                key={vType.value}
                type="button"
                onClick={() => handleChange("vehicleType", vType.value)}
                className={`flex flex-col items-center gap-1 rounded-md border p-3 transition ${
                  form.vehicleType === vType.value
                    ? "border-blue-600 bg-blue-50 text-blue-600"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <vType.icon size={20} />
                <span className="text-xs font-medium">{vType.label}</span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-700 mb-1">
                <Users className="inline w-3 h-3 mr-1" />
                Passengers
              </label>
              <select
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                value={form.passengerCount}
                onChange={(event) =>
                  handleChange("passengerCount", parseInt(event.target.value))
                }
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((num) => (
                  <option key={num} value={num}>
                    {num} {num === 1 ? "Passenger" : "Passengers"}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-700 mb-1">
                <Briefcase className="inline w-3 h-3 mr-1" />
                Baggage
              </label>
              <select
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                value={form.baggageCount}
                onChange={(event) =>
                  handleChange("baggageCount", parseInt(event.target.value))
                }
              >
                {[0, 1, 2, 3, 4, 5].map((num) => (
                  <option key={num} value={num}>
                    {num} {num === 1 ? "Bag" : "Bags"}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Special Requirements */}
        <section className="space-y-3">
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-700">
            Special Requirements
          </label>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="rounded border-slate-300"
                checked={form.wheelchairAccessible}
                onChange={(event) =>
                  handleChange("wheelchairAccessible", event.target.checked)
                }
              />
              <Accessibility size={16} className="text-slate-600" />
              <span className="text-sm text-slate-700">Wheelchair</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="rounded border-slate-300"
                checked={form.towingRequired}
                onChange={(event) =>
                  handleChange("towingRequired", event.target.checked)
                }
              />
              <Truck size={16} className="text-slate-600" />
              <span className="text-sm text-slate-700">Towing</span>
            </label>
          </div>
        </section>

        {/* Estimation Section */}
        <section className="grid grid-cols-3 gap-3">
          <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <Clock4 size={14} className="text-slate-600" />
            <div>
              <p className="text-[11px] uppercase text-slate-500">Est. time</p>
              <p className="text-sm font-semibold text-slate-900">
                {form.estimatedDuration
                  ? `${form.estimatedDuration} min`
                  : "--"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <CalendarRange size={14} className="text-slate-600" />
            <div>
              <p className="text-[11px] uppercase text-slate-500">
                Est. distance
              </p>
              <p className="text-sm font-semibold text-slate-900">
                {form.estimatedDistance
                  ? `${form.estimatedDistance.toFixed(1)} km`
                  : "--"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <CreditCard size={14} className="text-slate-600" />
            <div>
              <p className="text-[11px] uppercase text-slate-500">Est. cost</p>
              <p className="text-sm font-semibold text-slate-900">
                {form.estimatedFare
                  ? `$${form.estimatedFare.toFixed(2)}`
                  : "--"}
              </p>
            </div>
          </div>
        </section>

        {/* Customer Details Section */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">
            Customer Details
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2">
              <User size={14} className="text-slate-500" />
              <input
                className="flex-1 bg-transparent text-sm outline-none"
                placeholder="Passenger name"
                value={form.passengerName}
                onChange={(event) =>
                  handleChange("passengerName", event.target.value)
                }
                required
              />
            </div>
            <div className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2">
              <Phone size={14} className="text-slate-500" />
              <input
                className="flex-1 bg-transparent text-sm outline-none"
                placeholder="Contact number"
                value={form.phone}
                onChange={(event) => handleChange("phone", event.target.value)}
                required
              />
            </div>
          </div>
          <textarea
            className="min-h-[72px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            placeholder="Special instructions or notes..."
            value={form.notes}
            onChange={(event) => handleChange("notes", event.target.value)}
          />
        </section>

        {/* Payment & Tariff Section */}
        <section className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-700 mb-1">
                Payment Method
              </label>
              <select
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                value={form.paymentMethod}
                onChange={(event) =>
                  handleChange("paymentMethod", event.target.value)
                }
              >
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="wallet">Wallet</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-700 mb-1">
                Tariff
              </label>
              <select
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                value={form.tariffId}
                onChange={(event) =>
                  handleChange("tariffId", event.target.value)
                }
              >
                <option value="">Default tariff</option>
                {tariffs.map((tariff: any) => (
                  <option
                    key={tariff.id ?? tariff.identifier}
                    value={tariff.id ?? tariff.identifier}
                  >
                    {tariff.name ?? tariff.identifier ?? "Tariff"}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Driver Assignment Section */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">
            Driver Assignment
          </h3>
          <select
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            value={form.driverId}
            onChange={(event) => handleChange("driverId", event.target.value)}
          >
            <option value="">Auto-assign (recommended)</option>
            {drivers
              .filter((d) => d.status === "AVAILABLE")
              .map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.name} - {driver.vehicle}
                </option>
              ))}
          </select>
          <p className="text-xs text-slate-500">
            {form.driverId
              ? "Job will be assigned to the selected driver"
              : "System will automatically assign the best available driver"}
          </p>
        </section>

        <div className="h-16" />
      </form>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white px-6 py-3">
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={clearForm}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={loading}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Creating..." : "Create Job"}
          </button>
        </div>
      </footer>
    </div>
  );
};

export default JobComposerEnhanced;
