import {
  Accessibility,
  ArrowLeftRight,
  Briefcase,
  Car,
  Mail,
  MapPin,
  Phone,
  Search,
  User,
  Users,
  X,
} from "lucide-react";
import React, { useState } from "react";
import toast from "react-hot-toast";
import { useDispatchStore } from "../../store/useDispatchStore";

interface JobFormState {
  customerSearch: string;
  pickupAddress: string;
  pickupLat?: number;
  pickupLng?: number;
  dropoffAddress: string;
  dropoffLat?: number;
  dropoffLng?: number;
  passengerName: string;
  phone: string;
  email: string;
  tariffId: string;
  notes: string;
  validationCode: string;
  scheduledFor: "now" | "later";
  passengers: number;
  bags: number;
  wheelchairs: number;
  vehiclesNeeded: number;
  estimatedDistance?: string;
  estimatedCost?: string;
  remainingRides?: number;
}

const JobComposerV0Style: React.FC = () => {
  const tariffs = useDispatchStore((state) => state.tariffs);
  const createJob = useDispatchStore((state) => state.createJob);
  const loading = useDispatchStore((state) => state.loading);

  const [form, setForm] = useState<JobFormState>({
    customerSearch: "",
    pickupAddress: "",
    dropoffAddress: "",
    passengerName: "",
    phone: "",
    email: "",
    tariffId: "",
    notes: "",
    validationCode: "",
    scheduledFor: "now",
    passengers: 1,
    bags: 0,
    wheelchairs: 0,
    vehiclesNeeded: 1,
  });

  const handleChange = (field: keyof JobFormState, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const reverseLocations = () => {
    setForm((prev) => ({
      ...prev,
      pickupAddress: prev.dropoffAddress,
      dropoffAddress: prev.pickupAddress,
      pickupLat: prev.dropoffLat,
      pickupLng: prev.dropoffLng,
      dropoffLat: prev.pickupLat,
      dropoffLng: prev.pickupLng,
    }));
  };

  const clearForm = () => {
    setForm({
      customerSearch: "",
      pickupAddress: "",
      dropoffAddress: "",
      passengerName: "",
      phone: "",
      email: "",
      tariffId: "",
      notes: "",
      validationCode: "",
      scheduledFor: "now",
      passengers: 1,
      bags: 0,
      wheelchairs: 0,
      vehiclesNeeded: 1,
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!form.pickupAddress || !form.dropoffAddress) {
      toast.error("Pick up and drop off addresses are required.");
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
        email: form.email,
        tariffId: form.tariffId || undefined,
        notes: form.notes,
        scheduledFor: form.scheduledFor,
        passengerCount: form.passengers,
        baggageCount: form.bags,
        wheelchairAccessible: form.wheelchairs > 0,
        vehiclesNeeded: form.vehiclesNeeded,
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
    <div className="flex h-full flex-col bg-white border-l border-gray-200">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-white">
        <h2 className="text-lg font-semibold text-gray-900">Create New Job</h2>
      </div>

      {/* Scrollable Form Content */}
      <div className="flex-1 overflow-y-auto">
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Customer Search */}
          <div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search Customer"
                value={form.customerSearch}
                onChange={(e) => handleChange("customerSearch", e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Pick and Drop off Address */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Pick and Drop off Address
            </label>

            {/* Pickup Location */}
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-blue-500 w-4 h-4" />
              <input
                type="text"
                placeholder="Drag off Location"
                value={form.pickupAddress}
                onChange={(e) => handleChange("pickupAddress", e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {form.pickupAddress && (
                <button
                  type="button"
                  onClick={() => handleChange("pickupAddress", "")}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Reverse Button */}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={reverseLocations}
                className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition"
              >
                <ArrowLeftRight className="w-3 h-3" />
                REVERSE LOCATIONS
              </button>
            </div>

            {/* Dropoff Location */}
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-green-500 w-4 h-4" />
              <input
                type="text"
                placeholder="Drag off Location"
                value={form.dropoffAddress}
                onChange={(e) => handleChange("dropoffAddress", e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {form.dropoffAddress && (
                <button
                  type="button"
                  onClick={() => handleChange("dropoffAddress", "")}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Distance and Cost Estimate */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1 text-xs text-gray-600">
                  <span className="font-medium">Est. Distance</span>
                  <span className="text-gray-800 font-semibold">
                    {form.estimatedDistance || "11.6 km"}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-600">
                  <span className="font-medium">Cost</span>
                  <span className="text-gray-800 font-semibold">
                    ${form.estimatedCost || "98"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Now / Later Toggle */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleChange("scheduledFor", "now")}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition ${
                form.scheduledFor === "now"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Now
            </button>
            <button
              type="button"
              onClick={() => handleChange("scheduledFor", "later")}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition ${
                form.scheduledFor === "later"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Later
            </button>
          </div>

          {/* Tariff Selector */}
          <div>
            <select
              value={form.tariffId}
              onChange={(e) => handleChange("tariffId", e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
            >
              <option value="">SUPER1</option>
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

          {/* Spacing and Rate Info */}
          <div className="flex items-center justify-between text-xs">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-gray-600">Spacing Price</span>
                <span className="text-gray-900 font-semibold">$3000.00</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-600">Distance Rate</span>
                <span className="text-gray-900 font-semibold">$8.50/km</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-gray-600">Waiting Rate</div>
              <div className="text-gray-900 font-semibold">$0.02/min</div>
            </div>
          </div>

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
                placeholder="+974121312312"
                value={form.phone}
                onChange={(e) => handleChange("phone", e.target.value)}
                required
                className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <Phone className="w-4 h-4" />
              </button>
            </div>

            {/* Email */}
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="email"
                placeholder="john.doe@example.com"
                value={form.email}
                onChange={(e) => handleChange("email", e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <Mail className="w-4 h-4" />
              </button>
            </div>

            {/* Remaining Rides */}
            {form.remainingRides !== undefined && (
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Remaining Rides"
                  value={`Remaining Rides: ${form.remainingRides}`}
                  readOnly
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-md text-sm bg-gray-50 text-gray-600"
                />
              </div>
            )}

            {/* Validation Code */}
            <div className="relative">
              <input
                type="text"
                placeholder="Validation Code"
                value={form.validationCode}
                onChange={(e) => handleChange("validationCode", e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Job Related Info */}
            <div>
              <textarea
                placeholder="Job Related Info (e.g., special instructions, notes)"
                value={form.notes}
                onChange={(e) => handleChange("notes", e.target.value)}
                rows={3}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
              <div className="text-right text-xs text-gray-500 mt-1">
                this is the new job comming up!
              </div>
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
                  min="0"
                  value={form.passengers}
                  onChange={(e) =>
                    handleChange("passengers", parseInt(e.target.value) || 0)
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
                  Vehicles Needed
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
          className="px-4 py-2 border border-blue-600 rounded-md text-sm font-medium text-blue-600 bg-white hover:bg-blue-50 transition"
        >
          UPDATE JOB
        </button>
        <button
          type="submit"
          onClick={handleSubmit}
          disabled={loading}
          className="px-4 py-2 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "CREATING..." : "CREATE NEW JOB"}
        </button>
      </div>
    </div>
  );
};

export default JobComposerV0Style;
