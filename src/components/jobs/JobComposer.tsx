import React, { useState, useEffect } from "react";
import {
  CalendarRange,
  Clock4,
  CreditCard,
  MapPin,
  Phone,
  User,
  Users,
  Briefcase,
  Accessibility,
  Truck,
  Calendar,
  Search,
  X,
} from "lucide-react";
import { useDispatchStore } from "../../store/useDispatchStore";
import toast from "react-hot-toast";

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

const JobComposer: React.FC = () => {
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

  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [customerResults, setCustomerResults] = useState<any[]>([]);

  const handleChange = (
    field: keyof JobFormState,
    value: string
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }));
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
      });

      toast.success("Job created successfully!", { id: loadingToast });

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
    } catch (error) {
      console.error("Failed to create job", error);
      toast.error("Failed to create job. Please try again.", { id: loadingToast });
    }
  };

  return (
    <div className="flex h-full flex-col border-l border-slate-200 bg-white">
      <header className="flex items-center justify-between border-b border-slate-200 px-6 py-3 bg-slate-50">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Create New Job</h2>
          <p className="text-xs text-slate-600">
            Enter ride details and assign driver
          </p>
        </div>
        <button 
          type="button"
          onClick={() => {
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
          }}
          className="rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100"
        >
          Clear
        </button>
      </header>
      <form className="flex-1 overflow-auto px-6 py-5" onSubmit={handleSubmit}>
        {/* Customer Search Section */}
        <section className="space-y-3 text-xs mb-6">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-700 mb-1">
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
            {customerResults.length > 0 && (
              <div className="mt-1 rounded-md border border-slate-300 bg-white shadow-lg max-h-48 overflow-auto">
                {customerResults.map((customer) => (
                  <button
                    key={customer.id}
                    type="button"
                    onClick={() => {
                      setForm(prev => ({
                        ...prev,
                        passengerName: customer.name,
                        phone: customer.phone,
                      }));
                      setCustomerResults([]);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-0"
                  >
                    <div className="font-medium text-sm text-slate-900">{customer.name}</div>
                    <div className="text-xs text-slate-600">{customer.phone}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Scheduling Section */}
        <section className="space-y-3 text-xs mb-6">
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-700 mb-1">
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
                onChange={(event) => handleChange("scheduledDate", event.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
              <input
                type="time"
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                value={form.scheduledTime || ""}
                onChange={(event) => handleChange("scheduledTime", event.target.value)}
              />
            </div>
          )}
        </section>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Pick-up location
              </label>
              <div className="mt-1 flex items-center gap-2 rounded-md border border-slate-800 bg-slate-950 px-3 py-2">
                <MapPin size={14} className="text-brand-400" />
                <input
                  className="flex-1 bg-transparent text-sm outline-none"
                  placeholder="123 Main St"
                  value={form.pickupAddress}
                  onChange={(event) => handleChange("pickupAddress", event.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Drop-off location
              </label>
              <div className="mt-1 flex items-center gap-2 rounded-md border border-slate-800 bg-slate-950 px-3 py-2">
                <MapPin size={14} className="text-emerald-400" />
                <input
                  className="flex-1 bg-transparent text-sm outline-none"
                  placeholder="Destination"
                  value={form.dropoffAddress}
                  onChange={(event) => handleChange("dropoffAddress", event.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Ride type
              </label>
              <select
                className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand-500"
                value={form.paymentMethod}
                onChange={(event) => handleChange("paymentMethod", event.target.value)}
              >
                <option value="cash">Cash</option>
                <option value="card">Card</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Tariff
              </label>
              <select
                className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand-500"
                value={form.tariffId}
                onChange={(event) => handleChange("tariffId", event.target.value)}
              >
                <option value="">Select tariff</option>
                {tariffs.map((tariff: any) => (
                  <option key={tariff.id ?? tariff.identifier} value={tariff.id ?? tariff.identifier}>
                    {tariff.name ?? tariff.identifier ?? "Tariff"}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-slate-300">
            <div className="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2">
              <Clock4 size={14} />
              <div>
                <p className="text-[11px] uppercase text-slate-500">Est. time</p>
                <p className="text-sm font-semibold text-slate-100">18 min</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2">
              <CalendarRange size={14} />
              <div>
                <p className="text-[11px] uppercase text-slate-500">Est. distance</p>
                <p className="text-sm font-semibold text-slate-100">11.6 km</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2">
              <CreditCard size={14} />
              <div>
                <p className="text-[11px] uppercase text-slate-500">Est. cost</p>
                <p className="text-sm font-semibold text-slate-100">$40.98</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 space-y-4 text-xs">
          <h3 className="text-sm font-semibold text-slate-100">Account / Customer Details</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-950 px-3 py-2">
              <User size={14} className="text-slate-500" />
              <input
                className="flex-1 bg-transparent text-sm outline-none"
                placeholder="Passenger name"
                value={form.passengerName}
                onChange={(event) => handleChange("passengerName", event.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-950 px-3 py-2">
              <Phone size={14} className="text-slate-500" />
              <input
                className="flex-1 bg-transparent text-sm outline-none"
                placeholder="Contact number"
                value={form.phone}
                onChange={(event) => handleChange("phone", event.target.value)}
              />
            </div>
          </div>
          <textarea
            className="min-h-[72px] w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-brand-500"
            placeholder="Job related info (eg. special instructions, notes)"
            value={form.notes}
            onChange={(event) => handleChange("notes", event.target.value)}
          />
        </section>
        <section className="mt-6 space-y-4 text-xs">
          <h3 className="text-sm font-semibold text-slate-100">Assign Driver</h3>
          <select
            className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand-500"
            value={form.driverId}
            onChange={(event) => handleChange("driverId", event.target.value)}
          >
            <option value="">Auto assign later</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.name}
              </option>
            ))}
          </select>
        </section>
        <div className="h-16" />
      </form>
      <footer className="flex items-center justify-between border-t border-slate-900 bg-slate-950/90 px-6 py-3">
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="rounded border-slate-700 bg-slate-900" /> Wheelchair
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="rounded border-slate-700 bg-slate-900" /> Luggage
          </label>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <button
            type="submit"
            formNoValidate
            disabled={loading}
            className="rounded-md bg-brand-500 px-4 py-2 font-semibold text-white transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Saving…" : "Create New Job"}
          </button>
        </div>
      </footer>
    </div>
  );
};

export default JobComposer;
