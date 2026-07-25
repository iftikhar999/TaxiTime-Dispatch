import React from "react";
import { useV2Pod } from "../../hooks/useV2Stops";
import "./PODViewer.css";

interface PODViewerProps {
  jobId: string;
  stopId: string;
  onClose: () => void;
}

const PROOF_TYPE_ICONS: Record<string, string> = {
  SIGNATURE: "✍️",
  PHOTO: "📸",
  PIN: "🔢",
  BARCODE: "📊",
};

const PODViewer: React.FC<PODViewerProps> = ({ jobId, stopId, onClose }) => {
  const { proofs, requirements, loading, error, isPodComplete } = useV2Pod(jobId, stopId);

  return (
    <div className="pod-viewer-overlay" onClick={onClose}>
      <div className="pod-viewer-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pod-viewer-header">
          <h3>Proof of Delivery</h3>
          <button className="close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        {requirements && (
          <div className="pod-requirements">
            <h4>Requirements</h4>
            <div className={`requirement-status ${isPodComplete ? "complete" : "incomplete"}`}>
              {isPodComplete ? "✅ POD Complete" : "⏳ POD Required"}
            </div>
            {requirements.required && (
              <div className="requirement-type">
                Required: {PROOF_TYPE_ICONS[requirements.type]} {requirements.type}
                {requirements.pincode && " + PIN"}
              </div>
            )}
          </div>
        )}

        {loading && <div className="pod-loading">Loading proofs...</div>}
        {error && <div className="pod-error">Error: {String(error)}</div>}

        <div className="pod-proofs-list">
          <h4>Captured Proofs ({proofs.length})</h4>
          {proofs.length === 0 ? (
            <div className="no-proofs">No proofs captured yet</div>
          ) : (
            proofs.map((proof: any) => (
              <div key={proof.id} className="proof-item">
                <div className="proof-header">
                  <span className="proof-type">
                    {PROOF_TYPE_ICONS[proof.type]} {proof.type}
                  </span>
                  <span className={`proof-verified ${proof.verified ? "yes" : "no"}`}>
                    {proof.verified ? "✅ Verified" : "⏳ Pending"}
                  </span>
                </div>
                <div className="proof-content">
                  {proof.type === "SIGNATURE" && proof.signatureData && (
                    <div className="signature-preview">
                      <img src={proof.signatureData} alt="Signature" className="signature-image" />
                      {proof.recipientName && (
                        <div className="recipient-name">Signed by: {proof.recipientName}</div>
                      )}
                    </div>
                  )}
                  {proof.type === "PHOTO" && proof.photoUrl && (
                    <div className="photo-preview">
                      <img src={proof.photoUrl} alt="Delivery" className="photo-image" />
                      {proof.notes && <div className="photo-notes">{proof.notes}</div>}
                    </div>
                  )}
                  {proof.type === "PIN" && (
                    <div className="pin-verified">PIN Verified: {proof.verified ? "✅" : "❌"}</div>
                  )}
                </div>
                <div className="proof-meta">
                  <span className="captured-at">
                    {proof.capturedAt ? new Date(proof.capturedAt).toLocaleString() : ""}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default PODViewer;
