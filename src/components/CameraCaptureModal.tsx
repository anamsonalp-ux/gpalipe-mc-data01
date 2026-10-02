import React, { useState, useRef, useEffect } from 'react';
import { Camera, RefreshCw, X, Check, Image as ImageIcon, AlertTriangle, SwitchCamera } from 'lucide-react';
import { compressImage } from '../lib/photoStorage';

interface CameraCaptureModalProps {
  isOpen?: boolean;
  onClose: () => void;
  onCapture?: (photoDataUrl: string) => void;
  onPhotoCaptured?: (photoDataUrl: string) => void;
}

export function CameraCaptureModal({
  isOpen = true,
  onClose,
  onCapture,
  onPhotoCaptured,
}: CameraCaptureModalProps) {
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingCamera, setLoadingCamera] = useState(false);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraRequestRef = useRef(0);

  const stopCamera = () => {
    cameraRequestRef.current += 1;
    const activeStream = streamRef.current;
    streamRef.current = null;

    activeStream?.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        // The track may already have ended.
      }
    });

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
  };

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  const handleFinishCapture = (photoDataUrl: string) => {
    stopCamera();
    // These names are compatibility aliases; only one completion callback should run.
    if (onCapture) onCapture(photoDataUrl);
    else if (onPhotoCaptured) onPhotoCaptured(photoDataUrl);
    onClose();
  };

  // Check available devices
  useEffect(() => {
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices
        .enumerateDevices()
        .then((devices) => {
          const videoInputs = devices.filter((d) => d.kind === 'videoinput');
          setHasMultipleCameras(videoInputs.length > 1);
        })
        .catch(() => {});
    }
  }, []);

  // Start camera stream with multi-tier fallback
  const startCamera = async (mode: 'user' | 'environment') => {
    stopCamera();
    const requestId = cameraRequestRef.current;
    setLoadingCamera(true);
    setError(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError(
        'Live camera access is restricted in this browser context. You can use your device camera directly with the button below.'
      );
      setLoadingCamera(false);
      return;
    }

    let mediaStream: MediaStream | null = null;

    // Attempt 1: Specific facingMode with resolution
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
    } catch {
      // Attempt 2: Simple facingMode
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: mode },
          audio: false,
        });
      } catch {
        // Attempt 3: Any video device
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        } catch (finalErr: any) {
          console.warn('Camera stream failed:', finalErr);
          if (finalErr.name === 'NotAllowedError' || finalErr.name === 'PermissionDeniedError') {
            setError('Camera permission was blocked. Please tap "Open Device Camera" or allow camera access in browser settings.');
          } else if (finalErr.name === 'NotFoundError' || finalErr.name === 'DevicesNotFoundError') {
            setError('No camera hardware detected on this device.');
          } else {
            setError('Unable to activate camera stream. Tap "Open Device Camera" to take a photo.');
          }
          setLoadingCamera(false);
          return;
        }
      }
    }

    if (mediaStream) {
      if (requestId !== cameraRequestRef.current) {
        mediaStream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = mediaStream;
      if (videoRef.current) {
        const video = videoRef.current;
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
        video.srcObject = mediaStream;
        video.onloadedmetadata = () => {
          video.play().catch((playErr) => console.warn('Video play error:', playErr));
        };
      }
    }
    setLoadingCamera(false);
  };

  // Manage camera lifecycle
  useEffect(() => {
    if (isOpen) {
      setCapturedPreview(null);
      setError(null);
      startCamera(facingMode);
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode]);

  // Flip camera front / back
  const toggleFacingMode = () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
  };

  // Capture frame from live video
  const takeSnapshot = () => {
    if (!videoRef.current) return;
    try {
      const dataUrl = compressImage(videoRef.current, 0.85);
      setCapturedPreview(dataUrl);
      stopCamera();
    } catch (err: any) {
      setError('Snapshot failed: ' + (err.message || 'Please try again'));
    }
  };

  // Retake photo
  const handleRetake = () => {
    setCapturedPreview(null);
    startCamera(facingMode);
  };

  // Confirm photo
  const handleConfirm = () => {
    if (capturedPreview) {
      handleFinishCapture(capturedPreview);
    }
  };

  // Handle direct file/camera fallback
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const compressed = compressImage(img, 0.85);
        setCapturedPreview(compressed);
        stopCamera();
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Open file picker safely (works better on Android)
  const openFilePicker = () => {
    if (fileInputRef.current) {
      // Reset the input to allow selecting the same file twice
      fileInputRef.current.value = '';
      // Trigger the file picker
      fileInputRef.current.click();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-md w-full overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 bg-slate-800 border-b border-slate-700 flex items-center justify-between text-white">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400">
              <Camera className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-base sm:text-lg">
              {capturedPreview ? 'Confirm Voter Photo' : 'Take Voter Photo'}
            </h3>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-full hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewfinder / Preview Area */}
        <div className="relative bg-black flex-1 min-h-[320px] sm:min-h-[380px] flex items-center justify-center overflow-hidden">
          {capturedPreview ? (
            /* Captured Image Preview */
            <div className="relative w-full h-full flex items-center justify-center p-4">
              <img
                src={capturedPreview}
                alt="Captured Voter"
                className="max-h-[340px] w-auto rounded-2xl shadow-xl border-2 border-indigo-500 object-contain"
              />
            </div>
          ) : error ? (
            /* Error & Direct Fallback */
            <div className="p-6 text-center text-slate-300 max-w-xs">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto mb-3">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <p className="text-sm text-slate-200 mb-2 font-medium">{error}</p>
              <div className="flex flex-col gap-2 mt-4">
                <button
                  type="button"
                  onClick={openFilePicker}
                  className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-md"
                >
                  <Camera className="w-4 h-4" />
                  Open Device Camera / Photos
                </button>
                <button
                  type="button"
                  onClick={() => startCamera(facingMode)}
                  className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  Retry Live Camera
                </button>
              </div>
            </div>
          ) : (
            /* Live Stream */
            <div className="relative w-full h-full flex items-center justify-center">
              {loadingCamera && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/70 text-white">
                  <RefreshCw className="w-8 h-8 animate-spin text-indigo-400 mb-2" />
                  <span className="text-xs font-medium">Starting camera...</span>
                </div>
              )}
              <video
                ref={videoRef}
                playsInline
                autoPlay
                muted
                className={`w-full h-full object-cover max-h-[380px] ${
                  facingMode === 'user' ? 'scale-x-[-1]' : ''
                }`}
              />

              {/* Face Guide Oval */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-48 h-60 border-2 border-dashed border-white/50 rounded-full" />
                <span className="absolute bottom-3 text-[11px] font-medium bg-black/60 px-3 py-1 rounded-full text-white/90">
                  Align face in frame
                </span>
              </div>
            </div>
          )}
        </div>

        {/* File Input - Now positioned outside hidden divs for better Android compatibility */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        {/* Action Controls Bar */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-3">
          {capturedPreview ? (
            <>
              <button
                type="button"
                onClick={handleRetake}
                className="flex-1 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Retake</span>
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Use Photo</span>
              </button>
            </>
          ) : (
            <>
              {/* Native Device Camera / File Picker */}
              <button
                type="button"
                onClick={openFilePicker}
                title="Open device camera or pick file"
                className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all cursor-pointer"
              >
                <ImageIcon className="w-5 h-5" />
              </button>

              {/* Shutter Button */}
              <button
                type="button"
                onClick={takeSnapshot}
                disabled={loadingCamera || !!error}
                className="w-16 h-16 rounded-full bg-white hover:bg-slate-100 active:scale-95 flex items-center justify-center p-1.5 shadow-xl transition-all cursor-pointer disabled:opacity-50"
              >
                <div className="w-full h-full rounded-full border-4 border-slate-900 bg-indigo-600 flex items-center justify-center">
                  <Camera className="w-6 h-6 text-white" />
                </div>
              </button>

              {/* Flip camera */}
              <button
                type="button"
                onClick={toggleFacingMode}
                title="Switch front / rear camera"
                className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all cursor-pointer"
              >
                <SwitchCamera className="w-5 h-5" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
