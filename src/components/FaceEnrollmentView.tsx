import React, { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, Clock, ScanFace, ShieldCheck, XCircle } from 'lucide-react';
import { essApi } from '../services/api';
import {
  captureVideoFrame,
  extractSignatureFromCanvas,
  extractSignatureFromImageUrl,
} from '../services/faceVerification';
import type { EmployeeProfile, Language } from '../types';

interface FaceEnrollmentViewProps {
  profile: EmployeeProfile;
  lang: Language;
  onProfileUpdated: (profile: EmployeeProfile) => void;
}

export const FaceEnrollmentView: React.FC<FaceEnrollmentViewProps> = ({
  profile,
  onProfileUpdated,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [capturedSig, setCapturedSig] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // HR / Manager review queue
  const [pendingFaces, setPendingFaces] = useState<EmployeeProfile[]>([]);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  useEffect(() => {
    if (profile.is_manager || profile.is_hr) {
      essApi
        .getPendingFaces()
        .then((res) => setPendingFaces(res.pending))
        .catch(() => undefined);
    }
  }, [profile.is_manager, profile.is_hr]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((tr) => tr.stop());
      }
    };
  }, []);

  const startCamera = async () => {
    setCameraError(null);
    setCapturedPhoto(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      }, 60);
    } catch (err) {
      setCameraError(
        err instanceof Error
          ? err.message
          : 'Camera permission denied. Upload a clear front-facing portrait photo instead.',
      );
    }
  };

  const captureLive = () => {
    if (!videoRef.current) return;
    const frame = captureVideoFrame(videoRef.current, 480);
    const sig = extractSignatureFromCanvas(frame.canvas);
    setCapturedPhoto(frame.dataUrl);
    setCapturedSig(sig);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const handleUploadFallback = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result === 'string') {
        setCapturedPhoto(reader.result);
        const sig = await extractSignatureFromImageUrl(reader.result);
        setCapturedSig(sig);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitEnrollment = async () => {
    if (!capturedPhoto || capturedSig.length === 0) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const res = await essApi.enrollFace(capturedPhoto, capturedSig);
      onProfileUpdated(res.profile);
      setMessage('Face enrollment submitted to HR for approval.');
      setCapturedPhoto(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit face enrollment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReview = async (employeeId: string, decision: 'Approved' | 'Rejected') => {
    setReviewingId(employeeId);
    try {
      await essApi.reviewFace(employeeId, decision);
      setPendingFaces((prev) => prev.filter((p) => p.name !== employeeId));
    } finally {
      setReviewingId(null);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      <section className="lg:col-span-7 rounded-3xl bg-white border border-slate-200 p-5 sm:p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Face Registration</h2>
            <p className="text-sm text-slate-500 mt-1">
              One-time enrollment reviewed by HR for contactless attendance punches.
            </p>
          </div>
          <div className="text-end shrink-0">
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                profile.custom_face_status === 'Approved'
                  ? 'text-emerald-700'
                  : profile.custom_face_status === 'Pending HR Approval'
                  ? 'text-amber-700'
                  : profile.custom_face_status === 'Rejected'
                  ? 'text-red-700'
                  : 'text-slate-600'
              }`}
            >
              {profile.custom_face_status === 'Approved' && <CheckCircle2 className="w-4 h-4" />}
              {profile.custom_face_status === 'Pending HR Approval' && <Clock className="w-4 h-4" />}
              {profile.custom_face_status === 'Rejected' && <XCircle className="w-4 h-4" />}
              <span>{profile.custom_face_status}</span>
            </span>
          </div>
        </div>

        {profile.custom_face_photo && !capturedPhoto && !cameraActive && (
          <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200">
            <img
              src={profile.custom_face_photo}
              alt={profile.employee_name}
              referrerPolicy="no-referrer"
              className="w-16 h-16 rounded-2xl object-cover border border-slate-200 shrink-0"
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">Registered Face Reference</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {profile.custom_face_reviewed_by
                  ? `Reviewed by ${profile.custom_face_reviewed_by}`
                  : 'Waiting for HR verification'}
              </p>
              {profile.custom_face_review_note && (
                <p className="text-xs text-slate-600 mt-1">{profile.custom_face_review_note}</p>
              )}
            </div>
          </div>
        )}

        {cameraActive && (
          <div className="space-y-3">
            <div className="relative rounded-2xl overflow-hidden bg-slate-900 aspect-[4/3] max-w-md mx-auto">
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover scale-x-[-1]"
              />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-44 h-56 rounded-full border-[3px] border-white/80" />
              </div>
            </div>
            <button
              type="button"
              onClick={captureLive}
              className="w-full min-h-[50px] rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              <Camera className="w-4 h-4" />
              <span>Capture Portrait</span>
            </button>
          </div>
        )}

        {capturedPhoto && (
          <div className="space-y-4">
            <div className="rounded-2xl overflow-hidden border border-slate-200 max-w-xs mx-auto aspect-square">
              <img src={capturedPhoto} alt="Captured face" className="w-full h-full object-cover" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setCapturedPhoto(null);
                  void startCamera();
                }}
                className="min-h-[48px] rounded-xl border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Retake
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleSubmitEnrollment()}
                className="min-h-[48px] rounded-xl text-white text-sm font-semibold"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                {submitting ? 'Submitting...' : 'Submit for HR Approval'}
              </button>
            </div>
          </div>
        )}

        {!cameraActive && !capturedPhoto && (
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void startCamera()}
              className="min-h-[48px] px-5 py-2.5 rounded-xl text-white text-sm font-semibold inline-flex items-center gap-2"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              <ScanFace className="w-4 h-4" />
              <span>
                {profile.custom_face_status === 'Not Enrolled'
                  ? 'Start Camera Registration'
                  : 'Re-register Face'}
              </span>
            </button>

            <label className="min-h-[48px] px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-medium text-slate-700 inline-flex items-center gap-2 cursor-pointer">
              <Camera className="w-4 h-4" />
              <span>Upload Selfie</span>
              <input
                type="file"
                accept="image/*"
                capture="user"
                onChange={handleUploadFallback}
                className="hidden"
              />
            </label>
          </div>
        )}

        {cameraError && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
            {cameraError}
          </p>
        )}
        {error && (
          <p className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-xl p-3">
            {error}
          </p>
        )}
        {message && (
          <p className="text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
            {message}
          </p>
        )}
      </section>

      {/* HR / Manager Approval Queue */}
      {(profile.is_manager || profile.is_hr) && (
        <section className="lg:col-span-5 rounded-3xl bg-white border border-slate-200 p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-700" />
            <h3 className="text-base font-bold text-slate-900">
              Pending HR Face Approvals ({pendingFaces.length})
            </h3>
          </div>

          {pendingFaces.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500 py-6 text-center">
              No pending face enrollment requests.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {pendingFaces.map((emp) => (
                <li key={emp.name} className="py-4 space-y-3">
                  <div className="flex items-center gap-3">
                    {emp.custom_face_photo && (
                      <img
                        src={emp.custom_face_photo}
                        alt={emp.employee_name}
                        referrerPolicy="no-referrer"
                        className="w-14 h-14 rounded-2xl object-cover border border-slate-200 shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {emp.employee_name}
                      </p>
                      <p className="text-xs text-slate-500 font-mono-tabular">
                        ID {emp.name} · {emp.department}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={reviewingId === emp.name}
                      onClick={() => void handleReview(emp.name, 'Rejected')}
                      className="min-h-[44px] rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-xs font-semibold text-red-800"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      disabled={reviewingId === emp.name}
                      onClick={() => void handleReview(emp.name, 'Approved')}
                      className="min-h-[44px] rounded-xl bg-emerald-700 hover:bg-emerald-800 text-xs font-semibold text-white"
                    >
                      Approve Face
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
};
