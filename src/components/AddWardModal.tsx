import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  MapPin,
  X,
  Plus,
  AlertCircle,
  CheckCircle,
  Trash2,
  Search,
  Pencil,
  Camera,
  Upload,
  RefreshCw,
  Sparkles,
  Layers,
} from 'lucide-react';
import { formatWardDisplay, cleanWardName } from '../lib/supabase';
import {
  saveWardPhoto,
  getWardPhoto,
  deleteWardPhoto,
  generateDummyWardPhoto,
  compressImage,
} from '../lib/photoStorage';

interface AddWardModalProps {
  isOpen?: boolean;
  onClose: () => void;
  wards?: string[];
  existingWards?: string[];
  initialWard?: string | null;
  onAddWard: (wardName: string) => Promise<boolean> | boolean;
  onEditWard?: (oldWardName: string, newWardName: string) => Promise<boolean> | boolean;
  onDeleteWard?: (wardName: string) => void;
  onOpenWardCamera?: (wardName?: string) => void;
}

export function AddWardModal({
  isOpen = true,
  onClose,
  wards: wardsProp,
  existingWards,
  initialWard = null,
  onAddWard,
  onEditWard,
  onDeleteWard,
  onOpenWardCamera,
}: AddWardModalProps) {
  const wards = wardsProp || existingWards || [];

  // Active Form State
  const [editingWard, setEditingWard] = useState<string | null>(initialWard || null);
  const [wardName, setWardName] = useState(initialWard ? formatWardDisplay(initialWard) : '');
  const [district, setDistrict] = useState('Mendi Central Open District');
  const [pollingPlace, setPollingPlace] = useState('');
  const [notes, setNotes] = useState('');
  const [wardPhoto, setWardPhoto] = useState<string | null>(null);

  const [wardPhotosMap, setWardPhotosMap] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [wardSearch, setWardSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load photos for all existing wards on mount / open
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      const map: Record<string, string> = {};
      for (const w of wards) {
        const p = await getWardPhoto(w);
        if (p) map[w] = p;
      }
      if (!cancelled) {
        setWardPhotosMap(map);
        if (initialWard && map[initialWard]) {
          setWardPhoto(map[initialWard]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, wards, initialWard]);

  // Sync initialWard when opened or changed
  useEffect(() => {
    if (!isOpen) return;
    if (initialWard) {
      handleStartEdit(initialWard);
    } else {
      handleResetToCreate();
    }
  }, [isOpen, initialWard]);

  // When selecting a ward to edit in the rich form
  const handleStartEdit = async (wardToEdit: string) => {
    setEditingWard(wardToEdit);
    setWardName(formatWardDisplay(wardToEdit));
    setDistrict('Mendi Central Open District');
    setPollingPlace('');
    setNotes('');
    setError(null);
    setSuccess(null);

    const p = wardPhotosMap[wardToEdit] || (await getWardPhoto(wardToEdit));
    setWardPhoto(p);
  };

  // Reset form back to Create mode
  const handleResetToCreate = () => {
    setEditingWard(null);
    setWardName('');
    setDistrict('Mendi Central Open District');
    setPollingPlace('');
    setNotes('');
    setWardPhoto(null);
    setError(null);
    setSuccess(null);
  };

  // Handle local photo file upload
  const handlePhotoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file (JPEG, PNG, WebP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const rawDataUrl = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const compressed = compressImage(img, 0.85);
        setWardPhoto(compressed);
        setError(null);
      };
      img.onerror = () => {
        setWardPhoto(rawDataUrl);
        setError(null);
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Handle remove photo
  const handleRemovePhoto = async () => {
    setWardPhoto(null);
    if (editingWard) {
      await deleteWardPhoto(editingWard);
      setWardPhotosMap((prev) => {
        const copy = { ...prev };
        delete copy[editingWard];
        return copy;
      });
    }
  };

  // Submit Ward Form (Create new or Update existing)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = cleanWardName(wardName.trim());
    if (!trimmed) {
      setError('Please enter a valid ward name.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      if (editingWard) {
        // Renaming / Updating existing ward
        const oldFormatted = formatWardDisplay(editingWard).toLowerCase();
        const isSameAsOld =
          trimmed.toLowerCase() === editingWard.toLowerCase() ||
          trimmed.toLowerCase() === oldFormatted;

        if (
          !isSameAsOld &&
          wards.some((w) => {
            const wFmtLower = formatWardDisplay(w).toLowerCase();
            return (
              wFmtLower !== oldFormatted &&
              wFmtLower === formatWardDisplay(trimmed).toLowerCase()
            );
          })
        ) {
          setError(`Ward "${trimmed}" already exists.`);
          setSubmitting(false);
          return;
        }

        if (onEditWard && !isSameAsOld) {
          await onEditWard(editingWard, trimmed);
        }

        // Save or update photo
        if (wardPhoto) {
          await saveWardPhoto(trimmed, wardPhoto);
          if (editingWard !== trimmed) {
            await deleteWardPhoto(editingWard);
          }
          setWardPhotosMap((prev) => ({
            ...prev,
            [trimmed]: wardPhoto,
          }));
        } else {
          await deleteWardPhoto(trimmed);
          if (editingWard !== trimmed) {
            await deleteWardPhoto(editingWard);
          }
          setWardPhotosMap((prev) => {
            const copy = { ...prev };
            delete copy[editingWard];
            delete copy[trimmed];
            return copy;
          });
        }

        setSuccess(`Ward profile for "${trimmed}" updated successfully!`);
        setTimeout(() => {
          handleResetToCreate();
        }, 1200);
      } else {
        // Creating new ward
        if (wards.some((w) => w.toLowerCase() === trimmed.toLowerCase())) {
          setError(`Ward "${trimmed}" already exists in the database.`);
          setSubmitting(false);
          return;
        }

        await onAddWard(trimmed);

        if (wardPhoto) {
          await saveWardPhoto(trimmed, wardPhoto);
          setWardPhotosMap((prev) => ({
            ...prev,
            [trimmed]: wardPhoto,
          }));
        }

        setSuccess(`Ward "${trimmed}" created successfully!`);
        handleResetToCreate();
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save ward profile.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredExistingWards = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    const search = wardSearch.toLowerCase().trim();
    for (const w of wards) {
      const formatted = formatWardDisplay(w);
      const key = formatted.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        if (
          !search ||
          w.toLowerCase().includes(search) ||
          formatted.toLowerCase().includes(search)
        ) {
          list.push(w);
        }
      }
    }
    return list;
  }, [wards, wardSearch]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-100 overflow-hidden my-auto max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header - Matching Voter Profile Modal Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-800 text-white flex items-center justify-between shadow-xs shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20 shadow-xs">
              <MapPin className="w-5 h-5 text-indigo-100" />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight">
                {editingWard ? 'Edit Ward Profile' : 'Create Ward Profile'}
              </h3>
              <p className="text-xs text-indigo-200">
                {editingWard
                  ? `Updating profile for ${formatWardDisplay(editingWard)}`
                  : 'Capture photo and register ward profile'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Content */}
        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {/* Quick Ward Switcher / Mode Selector */}
          <div className="flex items-center justify-between gap-3 p-3 bg-gradient-to-r from-indigo-50/90 to-purple-50/70 border border-indigo-100 rounded-2xl">
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-900">
              <Layers className="w-4 h-4 text-indigo-600" />
              <span>Select Mode / Ward:</span>
            </div>
            <select
              value={editingWard || '__new__'}
              onChange={(e) => {
                if (e.target.value === '__new__') {
                  handleResetToCreate();
                } else {
                  handleStartEdit(e.target.value);
                }
              }}
              className="px-3 py-1.5 bg-white border border-indigo-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-xs max-w-[260px] truncate"
            >
              <option value="__new__">+ Register New Ward</option>
              <optgroup label="Edit Existing Wards">
                {wards.map((w) => (
                  <option key={w} value={w}>
                    Edit: {formatWardDisplay(w)}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Ward Profile Photo Showcase at the Top - Exact Match to Voter Profile */}
            <div className="bg-gradient-to-b from-indigo-50/50 to-slate-50 border border-indigo-100/80 rounded-2xl p-4 sm:p-5 shadow-2xs">
              <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-5">
                
                {/* Photo Frame / Avatar */}
                <div className="relative shrink-0">
                  {wardPhoto ? (
                    <div className="relative group">
                      <img
                        src={wardPhoto}
                        alt="Ward Profile Photo"
                        className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover border-2 border-indigo-500 shadow-md ring-4 ring-indigo-100/60"
                      />
                      <div className="absolute -bottom-2 -right-1 bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs flex items-center gap-1 border border-white">
                        <CheckCircle className="w-3 h-3" />
                        <span>Attached</span>
                      </div>
                    </div>
                  ) : editingWard ? (
                    <div className="relative group">
                      <img
                        src={generateDummyWardPhoto(editingWard)}
                        alt="Ward Badge Avatar"
                        className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover border-2 border-slate-200 shadow-md ring-4 ring-indigo-100/50"
                      />
                      <div className="absolute -bottom-2 -right-1 bg-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs flex items-center gap-1 border border-white">
                        <Sparkles className="w-3 h-3" />
                        <span>Generated</span>
                      </div>
                    </div>
                  ) : (
                    <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl border-2 border-dashed border-indigo-200 bg-white flex flex-col items-center justify-center text-slate-400 group hover:border-indigo-400 shadow-2xs">
                      <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-500 mb-1">
                        <Camera className="w-5 h-5" />
                      </div>
                      <span className="text-[11px] font-semibold text-slate-500">No Photo</span>
                    </div>
                  )}
                </div>

                {/* Photo Title & Actions */}
                <div className="flex-1 text-center sm:text-left">
                  <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
                    <h4 className="text-sm font-bold text-slate-900">Ward Profile Photo</h4>
                    {wardPhoto ? (
                      <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        Photo Ready
                      </span>
                    ) : (
                      <span className="bg-slate-100 text-slate-600 text-[10px] font-medium px-2 py-0.5 rounded-full">
                        Optional / Recommended
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mb-3">
                    {wardPhoto
                      ? 'Photo is attached to this ward profile and will appear in all ward cards & statistics.'
                      : 'Take an instant picture with live camera or choose a photo from your phone/computer.'}
                  </p>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                    {onOpenWardCamera && (
                      <button
                        type="button"
                        onClick={() => onOpenWardCamera(editingWard || wardName || undefined)}
                        className="px-3.5 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>{wardPhoto ? 'Retake Photo' : 'Live Camera'}</span>
                      </button>
                    )}

                    <label className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer active:scale-95">
                      <Upload className="w-3.5 h-3.5 text-slate-500" />
                      <span>{wardPhoto ? 'Change File' : 'Device Camera / Files'}</span>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoFileUpload}
                        className="hidden"
                      />
                    </label>

                    {wardPhoto && (
                      <button
                        type="button"
                        onClick={handleRemovePhoto}
                        className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                        title="Remove attached photo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remove</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Ward Name Field */}
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                Ward Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. 43. Kiburu Box E, Tente Ward 3..."
                value={wardName}
                onChange={(e) => {
                  setWardName(e.target.value);
                  if (error) setError(null);
                }}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all bg-white"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                {editingWard
                  ? 'Renaming will automatically update all voters and records linked to this ward.'
                  : 'New wards will instantly appear in all filters and voter registration forms.'}
              </p>
            </div>

            {/* District & Polling Place Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  District / Electorate
                </label>
                <input
                  type="text"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  placeholder="e.g. Mendi Central Open"
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Polling Place / Community
                </label>
                <input
                  type="text"
                  value={pollingPlace}
                  onChange={(e) => setPollingPlace(e.target.value)}
                  placeholder="e.g. Kiburu Community School"
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                />
              </div>
            </div>

            {/* Ward Notes */}
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                Ward Notes & Information
              </label>
              <textarea
                rows={2}
                placeholder="Key ward coordinators, voting center location, landmarks, population notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              />
            </div>

            {/* Form Actions */}
            <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
              {editingWard ? (
                <div className="flex items-center gap-2">
                  {onDeleteWard && (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Are you sure you want to delete ward "${formatWardDisplay(editingWard)}"?`)) {
                          onDeleteWard(editingWard);
                          handleResetToCreate();
                        }
                      }}
                      className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl border border-rose-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Delete Ward</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleResetToCreate}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                  >
                    + New Ward
                  </button>
                </div>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={submitting || !wardName.trim()}
                  className="px-6 py-2 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-600/20 transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
                >
                  {submitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : editingWard ? (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      <span>Update Ward Profile</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>Save Ward</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>

          {/* CURRENT WARDS LIST - Shows Profile Photo for every ward! */}
          <div className="border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-indigo-600" />
                <span>Current Wards ({wards.length})</span>
              </span>
              <span className="text-[11px] text-slate-400">Click any ward or edit button to update</span>
            </div>

            {/* Filter */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Filter current wards by name or number..."
                value={wardSearch}
                onChange={(e) => setWardSearch(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-800 transition-all"
              />
            </div>

            {/* List with Ward Profile Photos */}
            <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-2xl bg-white shadow-inner">
              {filteredExistingWards.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">No matching wards found</div>
              ) : (
                filteredExistingWards.map((w, idx) => {
                  const display = formatWardDisplay(w);
                  const isSelected = editingWard === w;
                  const photoSrc = wardPhotosMap[w] || generateDummyWardPhoto(w);
                  const hasCustomPhoto = Boolean(wardPhotosMap[w]);

                  return (
                    <div
                      key={w}
                      className={`p-2.5 px-3.5 flex items-center justify-between text-xs transition-colors gap-3 ${
                        isSelected
                          ? 'bg-indigo-50/80 border-l-4 border-indigo-600'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      {/* Left: Ward Profile Picture + Ward Name */}
                      <div
                        onClick={() => handleStartEdit(w)}
                        className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                        title="Click to edit ward profile"
                      >
                        <div className="relative shrink-0">
                          <img
                            src={photoSrc}
                            alt={display}
                            className={`w-9 h-9 rounded-xl object-cover shadow-2xs ${
                              hasCustomPhoto
                                ? 'border-2 border-indigo-500 ring-2 ring-indigo-100'
                                : 'border border-slate-200'
                            }`}
                          />
                          {hasCustomPhoto && (
                            <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border border-white flex items-center justify-center">
                              <span className="w-1.5 h-1.5 rounded-full bg-white" />
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-slate-800 truncate flex items-center gap-1.5">
                            {!/^\d+\./.test(display) && (
                              <span className="text-slate-400 text-[10px] w-5 shrink-0">{idx + 1}.</span>
                            )}
                            <span className="truncate">{display}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 flex items-center gap-1.5 truncate">
                            <span>Mendi Central</span>
                            <span>&bull;</span>
                            <span className={hasCustomPhoto ? 'text-emerald-600 font-semibold' : 'text-slate-400'}>
                              {hasCustomPhoto ? 'Photo Uploaded' : 'Standard Badge'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Actions (Camera, Edit, Delete) */}
                      <div className="flex items-center gap-1 shrink-0">
                        {onOpenWardCamera && (
                          <button
                            type="button"
                            onClick={() => onOpenWardCamera(w)}
                            title="Take live photo with camera"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition-colors cursor-pointer active:scale-95"
                          >
                            <Camera className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleStartEdit(w)}
                          title="Edit ward profile"
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer active:scale-95 ${
                            isSelected
                              ? 'bg-indigo-600 text-white'
                              : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'
                          }`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>

                        {onDeleteWard && (
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Are you sure you want to delete ward "${display}"?`)) {
                                onDeleteWard(w);
                                if (editingWard === w) handleResetToCreate();
                              }
                            }}
                            title="Delete ward"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer active:scale-95"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
