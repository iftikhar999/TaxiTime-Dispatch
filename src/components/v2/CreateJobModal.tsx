import React, { useState } from "react";
import { ServiceTypeSelector } from "./ServiceTypeSelector";
import { useV2Jobs } from "../../hooks/useV2Jobs";
import "./CreateJobModal.css";

interface CreateJobModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (job: any) => void;
}

interface StopInput {
  address: string;
  latitude?: number;
  longitude?: number;
  contactName?: string;
  contactPhone?: string;
  notes?: string;
  proofRequired?: boolean;
  proofType?: string;
}

const CreateJobModal: React.FC<CreateJobModalProps> = ({
  isOpen,
  onClose,
  onCreated,
}) => {
  const { createJob } = useV2Jobs();
  const [serviceType, setServiceType] = useState<string>("TAXI");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pickup, setPickup] = useState<StopInput>({ address: "" });
  const [dropoff, setDropoff] = useState<StopInput>({ address: "" });
  const [notes, setNotes] = useState("");
  const [stops, setStops] = useState<StopInput[]>([]);
  const [proofRequired, setProofRequired] = useState(true);
  const [proofType, setProofType] = useState("SIGNATURE");
  const [packageDescription, setPackageDescription] = useState("");

  const handleAddStop = () => setStops([...stops, { address: "", proofRequired: true }]);
  const handleRemoveStop = (idx: number) => setStops(stops.filter((_, i) => i !== idx));
  const handleStopChange = (idx: number, field: string, value: any) => {
    const next = [...stops];
    next[idx] = { ...next[idx], [field]: value };
    setStops(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const jobData: any = {
        serviceType,
        pickupLocation: pickup,
        notes,
      };
      if (serviceType === "TAXI") {
        jobData.dropoffLocation = dropoff;
      } else if (serviceType === "DELIVERY") {
        jobData.dropoffLocation = { ...dropoff, proofRequired, proofType };
        jobData.packageDescription = packageDescription;
      } else if (serviceType === "COURIER") {
        jobData.stops = [
          { ...pickup, sequence: 1, type: "PICKUP" },
          ...stops.map((s, idx) => ({ ...s, sequence: idx + 2, type: "DROPOFF" })),
        ];
      }
      const result = await createJob(jobData);
      onCreated(result.data);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || "Failed to create job");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="create-job-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create New Job</h2>
          <button className="close-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-section">
            <label>Service Type</label>
            <ServiceTypeSelector
              value={serviceType}
              onChange={(type) => setServiceType(type || "TAXI")}
              showAll={false}
              variant="buttons"
            />
          </div>
          <div className="form-section">
            <label>Pickup</label>
            <input
              value={pickup.address}
              onChange={(e) => setPickup({ ...pickup, address: e.target.value })}
              placeholder="Pickup address"
              required
            />
            <div className="form-row">
              <input
                value={pickup.contactName || ""}
                onChange={(e) => setPickup({ ...pickup, contactName: e.target.value })}
                placeholder="Contact name"
              />
              <input
                value={pickup.contactPhone || ""}
                onChange={(e) => setPickup({ ...pickup, contactPhone: e.target.value })}
                placeholder="Contact phone"
              />
            </div>
          </div>
          {(serviceType === "TAXI" || serviceType === "DELIVERY") && (
            <div className="form-section">
              <label>Dropoff</label>
              <input
                value={dropoff.address}
                onChange={(e) => setDropoff({ ...dropoff, address: e.target.value })}
                placeholder="Dropoff address"
                required
              />
              <div className="form-row">
                <input
                  value={dropoff.contactName || ""}
                  onChange={(e) => setDropoff({ ...dropoff, contactName: e.target.value })}
                  placeholder="Contact name"
                />
                <input
                  value={dropoff.contactPhone || ""}
                  onChange={(e) => setDropoff({ ...dropoff, contactPhone: e.target.value })}
                  placeholder="Contact phone"
                />
              </div>
            </div>
          )}
          {serviceType === "DELIVERY" && (
            <div className="form-section">
              <label>Package</label>
              <textarea
                value={packageDescription}
                onChange={(e) => setPackageDescription(e.target.value)}
                placeholder="Package description"
              />
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={proofRequired}
                  onChange={(e) => setProofRequired(e.target.checked)}
                />
                Require POD
              </label>
              {proofRequired && (
                <select value={proofType} onChange={(e) => setProofType(e.target.value)}>
                  <option value="SIGNATURE">Signature</option>
                  <option value="PHOTO">Photo</option>
                  <option value="PIN">PIN</option>
                  <option value="BOTH">Signature + Photo</option>
                </select>
              )}
            </div>
          )}
          {serviceType === "COURIER" && (
            <div className="form-section">
              <label>Courier Stops</label>
              {stops.map((stop, idx) => (
                <div key={idx} className="stop-input">
                  <span className="stop-number">{idx + 2}</span>
                  <input
                    value={stop.address}
                    onChange={(e) => handleStopChange(idx, "address", e.target.value)}
                    placeholder={`Stop ${idx + 2} address`}
                    required
                  />
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={stop.proofRequired || false}
                      onChange={(e) => handleStopChange(idx, "proofRequired", e.target.checked)}
                    />
                    POD
                  </label>
                  <button type="button" className="btn-remove" onClick={() => handleRemoveStop(idx)}>
                    ✕
                  </button>
                </div>
              ))}
              <button type="button" className="btn-add-stop" onClick={handleAddStop}>
                + Add Stop
              </button>
            </div>
          )}
          <div className="form-section">
            <label>Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error && <div className="form-error">⚠️ {error}</div>}
          <div className="form-actions">
            <button type="button" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "⏳ Creating..." : "✅ Create Job"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateJobModal;
