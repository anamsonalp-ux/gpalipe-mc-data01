import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Users,
  Search,
  Plus,
  Download,
  RotateCcw,
  Edit,
  Trash2,
  Phone,
  MapPin,
  X,
  AlertCircle,
  CheckCircle,
  Settings,
  Terminal,
  BarChart2,
  Table as TableIcon,
  Database,
  Camera,
  Upload,
  User,
  UserCheck,
  Eye,
  RefreshCw,
  Pencil,
  Sparkles
} from 'lucide-react';
import {
  Voter,
  INITIAL_FALLBACK_WARDS,
  DEFAULT_SUPABASE_URL,
  DEFAULT_SUPABASE_KEY,
  getStoredSupabaseConfig,
  saveStoredSupabaseConfig,
  resetStoredSupabaseConfig,
  createSupabaseInstance,
  formatWardDisplay,
  cleanWardName,
  resolveWards,
  saveWardRename,
  saveDeletedWard
} from './lib/supabase';
import { CameraCaptureModal } from './components/CameraCaptureModal';
import { AddWardModal } from './components/AddWardModal';
import { WardStatisticsModal } from './components/WardStatisticsModal';
import { saveVoterPhoto, getVoterPhoto, deleteVoterPhoto, generateDummyVoterPhoto, compressImage, saveWardPhoto, getWardPhoto } from './lib/photoStorage';

interface LogEntry {
  id: string;
  time: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warn';
}

function parseNotes(notesStr?: string | null) {
  if (!notesStr) return { age: '', gender: '', cleanNotes: '' };
  
  let age = '';
  let gender = '';
  let cleanNotes = notesStr;

  const ageMatch = notesStr.match(/(?:Age|age):\s*([0-9]{1,3})/i);
  if (ageMatch) {
    age = ageMatch[1];
  }

  const genderMatch = notesStr.match(/(?:Gender|gender):\s*(Male|Female|Other)/i);
  if (genderMatch) {
    gender = genderMatch[1];
  }

  cleanNotes = cleanNotes
    .replace(/^\[(?:META:)?.*?\]\n?/i, '')
    .replace(/^Age:\s*[0-9]{1,3}\s*\|\s*Gender:\s*(?:Male|Female|Other)\n?/i, '')
    .trim();

  return { age, gender, cleanNotes };
}

function formatNotes(cleanNotes: string, age: string, gender: string) {
  const parts: string[] = [];
  if (age) parts.push(`Age: ${age}`);
  if (gender && gender !== 'Select Gender') parts.push(`Gender: ${gender}`);

  const header = parts.join(' | ');
  if (!header) return cleanNotes;
  if (!cleanNotes) return header;
  return `${header}\n${cleanNotes}`;
}

export default function App() {
  const [supabaseConfig, setSupabaseConfig] = useState(getStoredSupabaseConfig);
  const [supabaseClient, setSupabaseClient] = useState(() =>
    createSupabaseInstance(supabaseConfig.url, supabaseConfig.key)
  );

  const [voters, setVoters] = useState<Voter[]>([]);
  const [wards, setWards] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('gp_custom_wards');
      const custom: string[] = stored ? JSON.parse(stored) : [];
      return resolveWards([INITIAL_FALLBACK_WARDS, custom]);
    } catch {
      return resolveWards([INITIAL_FALLBACK_WARDS]);
    }
  });

  const [photosMap, setPhotosMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'connecting' | 'ready' | 'syncing' | 'error'>('connecting');
  const [lastSyncTime, setLastSyncTime] = useState<string>('');

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWard, setSelectedWard] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [activeTab, setActiveTab] = useState<'table' | 'analytics'>('table');

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isWardModalOpen, setIsWardModalOpen] = useState(false);
  const [isWardStatsModalOpen, setIsWardStatsModalOpen] = useState(false);
  const [supabaseWardStats, setSupabaseWardStats] = useState<any[]>([]);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [cameraTargetVoter, setCameraTargetVoter] = useState<Voter | null>(null);
  const [cameraTargetWard, setCameraTargetWard] = useState<string | null>(null);
  const [isWardFormCamera, setIsWardFormCamera] = useState(false);
  const [capturedWardPhoto, setCapturedWardPhoto] = useState<{ id: number; dataUrl: string } | null>(null);
  const [editingWardTarget, setEditingWardTarget] = useState<string | null>(null);
  const [viewingPhoto, setViewingPhoto] = useState<{ name: string; photoUrl: string } | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingVoter, setEditingVoter] = useState<Voter | null>(null);
  const [deletingVoter, setDeletingVoter] = useState<Voter | null>(null);

  // Form State
  const [formData, setFormData] = useState<{
    full_name: string;
    phone: string;
    ward: string;
    village: string;
    support_status: 'Supporter' | 'Undecided' | 'Opposed';
    age: string;
    gender: string;
    notes: string;
    photo: string | null;
  }>({
    full_name: '',
    phone: '',
    ward: INITIAL_FALLBACK_WARDS[0],
    village: '',
    support_status: 'Undecided',
    age: '',
    gender: '',
    notes: '',
    photo: null,
  });

  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Settings Temp Form
  const [tempUrl, setTempUrl] = useState(supabaseConfig.url);
  const [tempKey, setTempKey] = useState(supabaseConfig.key);

  // Real-time Console Logs
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const addLog = (message: string, type: 'info' | 'success' | 'error' | 'warn' = 'info') => {
    const newEntry: LogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      time: new Date().toLocaleTimeString(),
      message,
      type,
    };
    setLogs((prev) => [newEntry, ...prev.slice(0, 49)]);
  };

  // Rebuild Supabase Client when config changes
  useEffect(() => {
    try {
      const client = createSupabaseInstance(supabaseConfig.url, supabaseConfig.key);
      setSupabaseClient(client);
      addLog(`Connected to Supabase: ${new URL(supabaseConfig.url).hostname}`, 'info');
    } catch {
      setSyncStatus('error');
      addLog('Failed to instantiate Supabase client with given URL/Key', 'error');
    }
  }, [supabaseConfig]);

  const [isGeneratingDummyPhotos, setIsGeneratingDummyPhotos] = useState(false);

  // Load Photos from Storage & Auto-Generate Dummy Photos for all voters without photos
  const loadPhotosForVoters = async (voterList: Voter[]) => {
    const map: Record<string, string> = {};
    for (const v of voterList) {
      if (v.id) {
        try {
          const photoData = await getVoterPhoto(v.id);
          if (photoData) {
            map[String(v.id)] = photoData;
          } else {
            map[String(v.id)] = generateDummyVoterPhoto(v.id, v.full_name);
          }
        } catch {
          map[String(v.id)] = generateDummyVoterPhoto(v.id, v.full_name);
        }
      }
    }
    setPhotosMap(map);
  };

  // Generate / Save dummy photos for all voters in storage
  const handleGenerateAllDummyPhotos = async () => {
    if (voters.length === 0) return;
    setIsGeneratingDummyPhotos(true);
    addLog(`🎨 Generating and saving dummy portrait pictures for all ${voters.length} voters...`, 'info');
    try {
      const newMap: Record<string, string> = { ...photosMap };
      let savedCount = 0;
      for (const v of voters) {
        if (v.id) {
          const dummyPic = generateDummyVoterPhoto(v.id, v.full_name);
          newMap[String(v.id)] = dummyPic;
          await saveVoterPhoto(v.id, dummyPic);
          savedCount++;
        }
      }
      setPhotosMap(newMap);
      addLog(`✓ Successfully generated dummy pictures for all ${savedCount} voters!`, 'success');
    } catch (err: any) {
      addLog(`✗ Error generating dummy photos: ${err.message}`, 'error');
    } finally {
      setIsGeneratingDummyPhotos(false);
    }
  };

  // Load Voters from Supabase (Guarantees 100% of rows are fetched, even >1000)
  const fetchVoters = async (quiet = false) => {
    if (!quiet) setLoading(true);
    setSyncStatus('syncing');
    try {
      if (!quiet) {
        addLog('📥 Loading voters from Supabase...', 'info');
      }

      let allRecords: Voter[] = [];
      let from = 0;
      const step = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error, count } = await supabaseClient
          .from('voters')
          .select('*', { count: 'exact' })
          .order('id', { ascending: true })
          .range(from, from + step - 1);

        if (error) {
          throw error;
        }

        if (data && data.length > 0) {
          allRecords = allRecords.concat(data);
          from += step;
          if (count !== null && allRecords.length >= count) {
            hasMore = false;
          }
          if (data.length < step) {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }

      setVoters(allRecords);
      setSyncStatus('ready');
      setLastSyncTime(new Date().toLocaleTimeString());

      // Auto-extract and sync all distinct wards from loaded voters
      const distinctWardsFromDb = allRecords.map((v) => v.ward).filter(Boolean);
      setWards((prev) => resolveWards([INITIAL_FALLBACK_WARDS, distinctWardsFromDb, prev]));

      if (!quiet) {
        addLog(`✓ Loaded ${allRecords.length} voters from Supabase (100% verified)`, 'success');
      }
      loadPhotosForVoters(allRecords);
    } catch (err: any) {
      console.error('Fetch error:', err);
      setSyncStatus('error');
      addLog(`✗ Load error: ${err.message || 'Unknown error'}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Load Wards from Supabase
  const fetchWards = async () => {
    try {
      const { data, error } = await supabaseClient
        .from('wards')
        .select('name')
        .order('name');

      if (!error && data && data.length > 0) {
        const dbNames = data.map((d: any) => d.name).filter(Boolean);
        setWards((prev) => resolveWards([INITIAL_FALLBACK_WARDS, dbNames, prev]));
        addLog(`✓ Synchronized ${dbNames.length} wards from database`, 'info');
      }
    } catch {
      // fallback
    }
  };

  // Fetch wards_statistics from Supabase if view/table exists
  const fetchWardStats = async () => {
    try {
      const { data, error } = await supabaseClient.from('wards_statistics').select('*');
      if (!error && data && data.length > 0) {
        setSupabaseWardStats(data);
      }
    } catch {
      // fallback to dynamic computation
    }
  };

  // Add new ward
  const handleAddWard = async (wardName: string) => {
    const trimmed = cleanWardName(wardName.trim());
    if (!trimmed) return false;

    try {
      await supabaseClient.from('wards').insert([{ name: trimmed }]);
    } catch {
      // fallback
    }

    try {
      const stored = localStorage.getItem('gp_custom_wards');
      const existing: string[] = stored ? JSON.parse(stored) : [];
      if (!existing.includes(trimmed)) {
        existing.push(trimmed);
        localStorage.setItem('gp_custom_wards', JSON.stringify(existing));
      }
    } catch {
      // ignore
    }

    setWards((prev) => resolveWards([[trimmed], prev]));
    addLog(`➕ Added new ward: "${trimmed}"`, 'success');
    return true;
  };

  // Edit / Rename Ward
  const handleEditWard = async (oldName: string, newName: string) => {
    const trimmed = cleanWardName(newName.trim());
    if (!trimmed || trimmed.toLowerCase() === oldName.toLowerCase()) return true;

    const oldFormatted = formatWardDisplay(oldName);
    const rawWithoutNum = oldName.replace(/^\d+\.\s*/, '').trim();

    // 0. Save persistent rename mappings so old fallback/database names never re-appear
    saveWardRename(oldName, trimmed);
    if (oldFormatted && oldFormatted !== oldName) {
      saveWardRename(oldFormatted, trimmed);
    }
    if (rawWithoutNum && rawWithoutNum !== oldName) {
      saveWardRename(rawWithoutNum, trimmed);
    }

    // 1. Update database 'wards' table if exists
    try {
      await supabaseClient.from('wards').update({ name: trimmed }).eq('name', oldName);
      if (oldFormatted && oldFormatted !== oldName) {
        await supabaseClient.from('wards').update({ name: trimmed }).eq('name', oldFormatted);
      }
      if (rawWithoutNum && rawWithoutNum !== oldName) {
        await supabaseClient.from('wards').update({ name: trimmed }).eq('name', rawWithoutNum);
      }
    } catch {
      // ignore
    }

    // 2. Cascade rename to voters with this ward in Supabase
    try {
      await supabaseClient.from('voters').update({ ward: trimmed }).eq('ward', oldName);
      if (oldFormatted && oldFormatted !== oldName) {
        await supabaseClient.from('voters').update({ ward: trimmed }).eq('ward', oldFormatted);
      }
      if (rawWithoutNum && rawWithoutNum !== oldName) {
        await supabaseClient.from('voters').update({ ward: trimmed }).eq('ward', rawWithoutNum);
      }
    } catch {
      // ignore
    }

    // 3. Update localStorage custom wards
    try {
      const stored = localStorage.getItem('gp_custom_wards');
      const existing: string[] = stored ? JSON.parse(stored) : [];
      const updated = existing.map((w) =>
        w === oldName || formatWardDisplay(w) === oldFormatted || w === rawWithoutNum ? trimmed : w
      );
      if (!updated.includes(trimmed)) {
        updated.push(trimmed);
      }
      localStorage.setItem('gp_custom_wards', JSON.stringify(Array.from(new Set(updated))));
    } catch {
      // ignore
    }

    // 4. Update state for both wards and voters using resolveWards
    setWards((prev) =>
      resolveWards([
        prev.map((w) =>
          w === oldName || formatWardDisplay(w) === oldFormatted || w === rawWithoutNum
            ? trimmed
            : w
        ),
      ])
    );
    setVoters((prev) =>
      prev.map((v) =>
        v.ward === oldName ||
        formatWardDisplay(v.ward) === oldFormatted ||
        (v.ward && v.ward.toLowerCase() === rawWithoutNum.toLowerCase())
          ? { ...v, ward: trimmed }
          : v
      )
    );
    addLog(`✏️ Renamed ward "${oldName}" to "${trimmed}"`, 'success');
    return true;
  };

  const handleDeleteWard = (wardToDelete: string) => {
    saveDeletedWard(wardToDelete);
    try {
      const stored = localStorage.getItem('gp_custom_wards');
      if (stored) {
        const existing: string[] = JSON.parse(stored);
        const filtered = existing.filter(
          (w) => formatWardDisplay(w).toLowerCase() !== formatWardDisplay(wardToDelete).toLowerCase()
        );
        localStorage.setItem('gp_custom_wards', JSON.stringify(filtered));
      }
    } catch {
      // ignore
    }
    setWards((prev) =>
      prev.filter(
        (w) => formatWardDisplay(w).toLowerCase() !== formatWardDisplay(wardToDelete).toLowerCase()
      )
    );
  };

  // Initial Fetch & Real-Time Subscription
  useEffect(() => {
    fetchVoters();
    fetchWards();
    fetchWardStats();

    const channel = supabaseClient
      .channel('voters-realtime-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'voters' },
        (payload) => {
          addLog(`📡 Real-time event [${payload.eventType}] on voter #${(payload.new as any)?.id || (payload.old as any)?.id}`, 'info');
          fetchVoters(true);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          addLog('✓ Subscribed to Postgres Real-Time database updates', 'success');
        }
      });

    return () => {
      supabaseClient.removeChannel(channel);
    };
  }, [supabaseClient]);

  // Filtered Voters
  const filteredVoters = useMemo(() => {
    return voters.filter((v) => {
      const name = (v.full_name || '').toLowerCase();
      const phone = (v.phone || '').toLowerCase();
      const ward = (v.ward || '').toLowerCase();
      const formattedWard = formatWardDisplay(v.ward).toLowerCase();
      const village = (v.village || '').toLowerCase();
      const notes = (v.notes || '').toLowerCase();
      const term = searchTerm.toLowerCase().trim();

      const matchesSearch =
        !term ||
        name.includes(term) ||
        phone.includes(term) ||
        ward.includes(term) ||
        formattedWard.includes(term) ||
        village.includes(term) ||
        notes.includes(term);

      const matchesWard =
        !selectedWard ||
        v.ward === selectedWard ||
        formatWardDisplay(v.ward) === selectedWard;

      const matchesStatus =
        !selectedStatus ||
        (v.support_status || 'Undecided').toLowerCase() === selectedStatus.toLowerCase();

      return matchesSearch && matchesWard && matchesStatus;
    });
  }, [voters, searchTerm, selectedWard, selectedStatus]);

  // Dynamic Statistics (Normalized & Case-Insensitive)
  const stats = useMemo(() => {
    const total = voters.length;
    let supporters = 0;
    let opposed = 0;
    let undecided = 0;

    for (const v of voters) {
      const s = (v.support_status || '').trim().toLowerCase();
      if (s === 'supporter') {
        supporters += 1;
      } else if (s === 'opposed') {
        opposed += 1;
      } else {
        undecided += 1;
      }
    }

    return { total, supporters, undecided, opposed };
  }, [voters]);

  // Ward Breakdown for analytics tab
  const wardBreakdown = useMemo(() => {
    const map: Record<string, { total: number; supporters: number; undecided: number; opposed: number }> = {};
    wards.forEach((w) => {
      map[w] = { total: 0, supporters: 0, undecided: 0, opposed: 0 };
    });

    voters.forEach((v) => {
      const w = formatWardDisplay(v.ward) || v.ward || 'Other';
      if (!map[w]) {
        map[w] = { total: 0, supporters: 0, undecided: 0, opposed: 0 };
      }
      map[w].total += 1;
      const s = (v.support_status || '').trim().toLowerCase();
      if (s === 'supporter') map[w].supporters += 1;
      else if (s === 'opposed') map[w].opposed += 1;
      else map[w].undecided += 1;
    });

    return Object.entries(map).map(([ward, data]) => ({ ward, ...data }));
  }, [wards, voters]);

  // Open Add Modal
  const handleOpenAdd = () => {
    setEditingVoter(null);
    setFormData({
      full_name: '',
      phone: '',
      ward: wards[0] || INITIAL_FALLBACK_WARDS[0],
      village: '',
      support_status: 'Undecided',
      age: '',
      gender: '',
      notes: '',
      photo: null,
    });
    setFormError('');
    setIsModalOpen(true);
  };

  // Launch Camera for specific voter from table
  const handleRowCamera = (voter: Voter) => {
    setCameraTargetVoter(voter);
    setIsCameraModalOpen(true);
  };

  // Launch Quick Camera from main action bar
  const handleQuickCamera = () => {
    setCameraTargetVoter(null);
    setIsCameraModalOpen(true);
  };

  // Handle Photo Capture completion
  const handleCameraCaptureComplete = async (photoDataUrl: string) => {
    if (!photoDataUrl) return;

    if (isWardFormCamera) {
      setCapturedWardPhoto({ id: Date.now(), dataUrl: photoDataUrl });
      addLog('📸 Photo attached to ward profile', 'success');
      setIsWardFormCamera(false);
    } else if (cameraTargetWard) {
      await saveWardPhoto(cameraTargetWard, photoDataUrl);
      addLog(`📸 Saved photo for ward "${formatWardDisplay(cameraTargetWard)}"`, 'success');
      setCameraTargetWard(null);
    } else if (cameraTargetVoter && cameraTargetVoter.id) {
      await saveVoterPhoto(cameraTargetVoter.id, photoDataUrl);
      setPhotosMap((prev) => ({ ...prev, [String(cameraTargetVoter.id)]: photoDataUrl }));
      addLog(`📸 Saved photo for ${cameraTargetVoter.full_name}`, 'success');
      setCameraTargetVoter(null);
    } else {
      setFormData((prev) => ({ ...prev, photo: photoDataUrl }));
      if (!isModalOpen) {
        setEditingVoter(null);
        setFormData({
          full_name: '',
          phone: '',
          ward: wards[0] || INITIAL_FALLBACK_WARDS[0],
          village: '',
          support_status: 'Undecided',
          age: '',
          gender: '',
          notes: '',
          photo: photoDataUrl,
        });
        setFormError('');
        setIsModalOpen(true);
      }
      addLog('📸 Photo snapped and attached to Voter Profile', 'success');
    }
    setIsCameraModalOpen(false);
  };

  // Open Edit Modal
  const handleOpenEdit = async (voter: Voter) => {
    setEditingVoter(voter);
    const { age, gender, cleanNotes } = parseNotes(voter.notes);

    let photoData: string | null = null;
    if (voter.id) {
      photoData =
        photosMap[String(voter.id)] ||
        (await getVoterPhoto(voter.id)) ||
        generateDummyVoterPhoto(voter.id, voter.full_name);
    }

    setFormData({
      full_name: voter.full_name || '',
      phone: voter.phone || '',
      ward: formatWardDisplay(voter.ward) || voter.ward || wards[0],
      village: voter.village || '',
      support_status: voter.support_status || 'Undecided',
      age,
      gender,
      notes: cleanNotes,
      photo: photoData,
    });
    setFormError('');
    setIsModalOpen(true);
  };

  // Submit Voter Form (Insert or Update)
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.full_name.trim()) {
      setFormError('Full name is required.');
      return;
    }

    setFormSubmitting(true);
    setFormError('');
    setSyncStatus('syncing');

    try {
      const combinedNotes = formatNotes(formData.notes.trim(), formData.age.trim(), formData.gender);
      const timestamp = new Date().toISOString();

      const payload = {
        full_name: formData.full_name.trim(),
        phone: formData.phone.trim() || null,
        ward: formData.ward.trim(),
        village: formData.village.trim() || null,
        support_status: formData.support_status,
        notes: combinedNotes || null,
        updated_at: timestamp,
      };

      let savedId = editingVoter?.id;

      if (editingVoter && editingVoter.id) {
        addLog(`💾 Updating voter #${editingVoter.id} (${payload.full_name})...`, 'info');
        const { error } = await supabaseClient
          .from('voters')
          .update(payload)
          .eq('id', editingVoter.id);

        if (error) throw error;
        addLog(`✓ Voter #${editingVoter.id} updated successfully`, 'success');
      } else {
        addLog(`💾 Adding new voter: ${payload.full_name}...`, 'info');
        const { data, error } = await supabaseClient
          .from('voters')
          .insert([
            {
              ...payload,
              created_at: timestamp,
            },
          ])
          .select();

        if (error) throw error;
        if (data && data[0]) {
          savedId = data[0].id;
        }
        addLog(`✓ New voter ${payload.full_name} added successfully`, 'success');
      }

      if (savedId) {
        if (formData.photo) {
          await saveVoterPhoto(savedId, formData.photo);
          setPhotosMap((prev) => ({ ...prev, [String(savedId)]: formData.photo! }));
          addLog(`📸 Saved photo for voter #${savedId}`, 'info');
        } else if (editingVoter) {
          await deleteVoterPhoto(savedId);
          setPhotosMap((prev) => {
            const copy = { ...prev };
            delete copy[String(savedId)];
            return copy;
          });
        }
      }

      setIsModalOpen(false);
      await fetchVoters(true);
    } catch (err: any) {
      console.error('Save error:', err);
      setFormError(err.message || 'Error saving voter to database.');
      addLog(`✗ Save failed: ${err.message || 'Error'}`, 'error');
      setSyncStatus('error');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Delete Voter
  const confirmDelete = async () => {
    if (!deletingVoter || !deletingVoter.id) return;
    setSyncStatus('syncing');
    try {
      addLog(`🗑️ Deleting voter #${deletingVoter.id} (${deletingVoter.full_name})...`, 'info');
      const { error } = await supabaseClient
        .from('voters')
        .delete()
        .eq('id', deletingVoter.id);

      if (error) throw error;

      await deleteVoterPhoto(deletingVoter.id);
      setPhotosMap((prev) => {
        const copy = { ...prev };
        delete copy[String(deletingVoter.id)];
        return copy;
      });

      addLog(`✓ Successfully removed voter #${deletingVoter.id}`, 'success');
      setDeletingVoter(null);
      setIsModalOpen(false);
      await fetchVoters(true);
    } catch (err: any) {
      console.error('Delete error:', err);
      alert('Failed to delete voter: ' + (err.message || 'Unknown error'));
      addLog(`✗ Deletion error: ${err.message || 'Unknown'}`, 'error');
      setSyncStatus('error');
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (filteredVoters.length === 0) {
      alert('No voter records to export for current view.');
      return;
    }

    const headers = ['NAME', 'PHONE', 'WARD', 'STATUS', 'LAST VISIT'];
    const rows = filteredVoters.map((v) => [
      v.full_name || '',
      v.phone || '-',
      formatWardDisplay(v.ward),
      v.support_status || 'Undecided',
      v.updated_at ? new Date(v.updated_at).toLocaleDateString() : '-',
    ]);

    let csvContent = headers.join(',') + '\n';
    rows.forEach((row) => {
      csvContent += row.map((field) => `"${String(field).replace(/"/g, '""')}"`).join(',') + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Gibson_Palipe_Voters_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addLog(`📥 Exported ${filteredVoters.length} voter records to CSV`, 'success');
  };

  // Photo file upload from disk or native camera
  const handlePhotoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file (JPEG, PNG, WebP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const rawDataUrl = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const compressed = compressImage(img, 0.85);
        setFormData((prev) => ({ ...prev, photo: compressed }));
        addLog('📸 Voter photo attached from file upload', 'info');
      };
      img.onerror = () => {
        setFormData((prev) => ({ ...prev, photo: rawDataUrl }));
        addLog('📸 Voter photo attached from file upload', 'info');
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="min-h-screen bg-slate-100 p-2 sm:p-5 flex flex-col items-center">
      {/* Main Container Card matching the Live Original Site */}
      <div className="w-full max-w-[1400px] bg-white rounded-xl shadow-lg border border-slate-200/90 overflow-hidden flex flex-col">
        
        {/* Top Header Bar matching screenshot */}
        <header className="bg-[#0f172a] text-white px-5 sm:px-7 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-600/20 border border-blue-400/30 flex items-center justify-center shrink-0">
              <Database className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                Advanced Voter Database
              </h1>
              <p className="text-slate-400 text-xs sm:text-sm font-normal">
                Gibson Palipe · Mendi Central Open | Complete Voter Management System
              </p>
            </div>
          </div>

          {/* Quick status & tools */}
          <div className="flex items-center gap-2 self-start md:self-auto">
            <div
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                syncStatus === 'ready'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                  : syncStatus === 'syncing'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-400/30 animate-pulse'
                  : 'bg-rose-500/20 text-rose-300 border border-rose-400/30'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  syncStatus === 'ready'
                    ? 'bg-emerald-400'
                    : syncStatus === 'syncing'
                    ? 'bg-amber-400'
                    : 'bg-rose-400'
                }`}
              />
              <span>{syncStatus === 'ready' ? 'Live Synced' : syncStatus === 'syncing' ? 'Syncing...' : 'Offline'}</span>
            </div>

            <button
              onClick={() => fetchVoters()}
              disabled={loading}
              title="Force Refresh Data"
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={() => setShowLogs(!showLogs)}
              title="Toggle Real-Time Monitor Console"
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                showLogs ? 'bg-white text-slate-900' : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              <Terminal className="w-4 h-4" />
            </button>

            <button
              onClick={() => setIsSettingsOpen(true)}
              title="Supabase Settings"
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* 4 Stat Cards in a Row (Exact match to screenshot) */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 p-4 sm:p-6 bg-slate-50 border-b border-slate-200">
          <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 text-center shadow-xs">
            <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-1">
              TOTAL VOTERS
            </p>
            <h3 className="text-3xl sm:text-4xl font-extrabold text-blue-600">
              {stats.total.toLocaleString()}
            </h3>
          </div>

          <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 text-center shadow-xs">
            <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-1">
              SUPPORTERS
            </p>
            <h3 className="text-3xl sm:text-4xl font-extrabold text-blue-600">
              {stats.supporters.toLocaleString()}
            </h3>
          </div>

          <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 text-center shadow-xs">
            <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-1">
              UNDECIDED
            </p>
            <h3 className="text-3xl sm:text-4xl font-extrabold text-blue-600">
              {stats.undecided.toLocaleString()}
            </h3>
          </div>

          <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 text-center shadow-xs">
            <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-1">
              OPPOSED
            </p>
            <h3 className="text-3xl sm:text-4xl font-extrabold text-blue-600">
              {stats.opposed.toLocaleString()}
            </h3>
          </div>
        </section>

        {/* Filter & Action Controls Bar (Exact match to screenshot) */}
        <div className="p-4 sm:p-6 bg-white border-b border-slate-200 flex flex-col gap-3">
          {/* Row 1: Search and Dropdowns */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="relative md:col-span-6">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search voter name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-9 py-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-slate-800 placeholder-slate-400"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="md:col-span-3">
              <select
                value={selectedWard}
                onChange={(e) => setSelectedWard(e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="">All Wards</option>
                {wards.map((ward) => (
                  <option key={ward} value={ward}>
                    {formatWardDisplay(ward)}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-3">
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="">All Status</option>
                <option value="Supporter">Supporter</option>
                <option value="Undecided">Undecided</option>
                <option value="Opposed">Opposed</option>
              </select>
            </div>
          </div>

          {/* Row 2: Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {/* Add Voter (Purple Button) */}
            <button
              type="button"
              onClick={handleOpenAdd}
              className="flex-1 sm:flex-none py-2.5 px-6 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold text-sm rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Voter</span>
            </button>

            {/* + Add Wards (same button style as Add Voter) */}
            <button
              type="button"
              onClick={() => {
                setEditingWardTarget(null);
                setIsWardModalOpen(true);
              }}
              className="flex-1 sm:flex-none py-2.5 px-6 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold text-sm rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add Wards</span>
            </button>

            {/* Edit Wards Button */}
            <button
              type="button"
              onClick={() => {
                setEditingWardTarget(selectedWard || (wards.length > 0 ? wards[0] : null));
                setIsWardModalOpen(true);
              }}
              className="flex-1 sm:flex-none py-2.5 px-5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold text-sm rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              title="Edit existing ward names"
            >
              <Pencil className="w-4 h-4" />
              <span>Edit Wards</span>
            </button>

            {/* Ward Statistics Button */}
            <button
              type="button"
              onClick={() => {
                fetchWardStats();
                setIsWardStatsModalOpen(true);
              }}
              className="flex-1 sm:flex-none py-2.5 px-5 bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white font-semibold text-sm rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              title="Open comprehensive Ward Statistics & Distribution"
            >
              <BarChart2 className="w-4 h-4 text-sky-200" />
              <span>Ward Statistics</span>
            </button>

            {/* Camera Button */}
            <button
              type="button"
              onClick={handleQuickCamera}
              className="flex-1 sm:flex-none py-2.5 px-5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold text-sm rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              title="Open camera to take portrait"
            >
              <Camera className="w-4 h-4" />
              <span>Camera</span>
            </button>


            {/* Export CSV (Light Button with download tray icon) */}
            <button
              type="button"
              onClick={handleExportCSV}
              className="flex-1 sm:flex-none py-2.5 px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm rounded-lg border border-slate-300 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4 text-slate-600" />
              <span>Export CSV</span>
            </button>

            {/* Reset (Light Button with reload/undo icon) */}
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setSelectedWard('');
                setSelectedStatus('');
                fetchVoters(false);
                fetchWards();
                fetchWardStats();
                addLog('🔄 Reset all filters and refreshed data', 'info');
              }}
              className="flex-1 sm:flex-none py-2.5 px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm rounded-lg border border-slate-300 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 text-slate-600" />
              <span>Reset</span>
            </button>

            {/* Ward Analytics Toggle */}
            <div className="ml-auto flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
              <button
                onClick={() => setActiveTab('table')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'table' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Table View
              </button>
              <button
                onClick={() => setActiveTab('analytics')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'analytics' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Ward Breakdown
              </button>
              <button
                onClick={() => {
                  fetchWardStats();
                  setIsWardStatsModalOpen(true);
                }}
                className="px-2.5 py-1 rounded-md text-xs font-bold text-indigo-600 hover:bg-indigo-50 transition-all cursor-pointer flex items-center gap-1"
                title="Open Detailed Ward Statistics Report"
              >
                <BarChart2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Stats Modal</span>
              </button>
            </div>
          </div>
        </div>

        {/* Table Content Area */}
        <main className="flex-1 bg-white overflow-x-auto">
          {loading && voters.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-3" />
              <h3 className="text-base font-semibold text-slate-800">Loading voter database...</h3>
              <p className="text-xs text-slate-500 mt-0.5">Connecting to Supabase PostgreSQL</p>
            </div>
          ) : activeTab === 'analytics' ? (
            /* Ward Analytics View */
            <div className="p-6 space-y-4">
              <h3 className="font-bold text-slate-900 text-lg">Ward Breakdown & Distribution</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {wardBreakdown.map((item) => (
                  <div
                    key={item.ward}
                    className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 transition-all"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <h4 className="font-semibold text-slate-800 text-sm truncate max-w-[200px]" title={item.ward}>
                        {item.ward}
                      </h4>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                        {item.total} {item.total === 1 ? 'voter' : 'voters'}
                      </span>
                    </div>

                    {item.total > 0 ? (
                      <>
                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden flex my-2">
                          <div
                            style={{ width: `${(item.supporters / item.total) * 100}%` }}
                            className="bg-emerald-500 h-full"
                            title={`Supporters: ${item.supporters}`}
                          />
                          <div
                            style={{ width: `${(item.undecided / item.total) * 100}%` }}
                            className="bg-amber-400 h-full"
                            title={`Undecided: ${item.undecided}`}
                          />
                          <div
                            style={{ width: `${(item.opposed / item.total) * 100}%` }}
                            className="bg-rose-500 h-full"
                            title={`Opposed: ${item.opposed}`}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-600 font-medium">
                          <span className="text-emerald-700">✓ {item.supporters}</span>
                          <span className="text-amber-700">? {item.undecided}</span>
                          <span className="text-rose-700">✕ {item.opposed}</span>
                        </div>
                      </>
                    ) : (
                      <div className="text-[11px] text-slate-400 italic py-1">No voters registered yet</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : filteredVoters.length === 0 ? (
            <div className="p-16 text-center text-slate-500">
              <Users className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p className="font-medium text-slate-700">No voters found</p>
              <p className="text-xs text-slate-400 mt-1">Try adjusting your search or ward filter</p>
            </div>
          ) : (
            /* Table (Columns match screenshot: NAME, PHONE, WARD, STATUS, LAST VISIT, ACTION) */
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="bg-[#4f46e5] text-white text-xs font-bold uppercase tracking-wider">
                  <th className="py-3 px-4 font-semibold">NAME</th>
                  <th className="py-3 px-4 font-semibold text-center sm:text-left">PHONE</th>
                  <th className="py-3 px-4 font-semibold">WARD</th>
                  <th className="py-3 px-4 font-semibold text-center">STATUS</th>
                  <th className="py-3 px-4 font-semibold text-center">LAST VISIT</th>
                  <th className="py-3 px-4 font-semibold text-center">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredVoters.map((voter) => {
                  const status = voter.support_status || 'Undecided';
                  const photo =
                    (voter.id && photosMap[String(voter.id)]) ||
                    generateDummyVoterPhoto(voter.id || 0, voter.full_name);
                  const displayWard = formatWardDisplay(voter.ward);
                  const lastVisit = voter.updated_at
                    ? new Date(voter.updated_at).toLocaleDateString()
                    : '-';

                  return (
                    <tr
                      key={voter.id || Math.random()}
                      className="hover:bg-slate-50/90 transition-colors"
                    >
                      {/* NAME */}
                      <td className="py-3 px-4 font-medium text-slate-900 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <div className="relative group shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                setViewingPhoto({
                                  name: voter.full_name,
                                  photoUrl: photo,
                                })
                              }
                              className="w-8 h-8 rounded-full overflow-hidden border border-indigo-200/90 hover:ring-2 hover:ring-indigo-500 transition-all cursor-pointer shadow-2xs block"
                              title="Click to view photo"
                            >
                              <img src={photo} alt="" className="w-full h-full object-cover" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRowCamera(voter)}
                              className="absolute inset-0 bg-black/60 text-white rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"
                              title="Take / Replace live photo"
                            >
                              <Camera className="w-3.5 h-3.5 text-white" />
                            </button>
                          </div>
                          <span>{voter.full_name}</span>
                        </div>
                      </td>

                      {/* PHONE */}
                      <td className="py-3 px-4 text-slate-600 text-center sm:text-left whitespace-nowrap">
                        {voter.phone || '-'}
                      </td>

                      {/* WARD */}
                      <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span>{displayWard}</span>
                          <button
                            type="button"
                            onClick={() => setIsWardModalOpen(true)}
                            title="Edit this ward"
                            className="text-slate-400 hover:text-indigo-600 p-1 rounded-md hover:bg-indigo-50 transition-colors cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                      {/* STATUS */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <span
                          className={`inline-block px-3 py-0.5 rounded-full text-xs font-semibold ${
                            status === 'Supporter'
                              ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                              : status === 'Opposed'
                              ? 'bg-rose-100 text-rose-700 border border-rose-300'
                              : 'bg-amber-100 text-amber-700 border border-amber-300'
                          }`}
                        >
                          {status}
                        </span>
                      </td>

                      {/* LAST VISIT */}
                      <td className="py-3 px-4 text-center text-slate-500 whitespace-nowrap text-xs">
                        {lastVisit}
                      </td>

                      {/* ACTION (Edit & Camera Buttons) */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(voter)}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-3 py-1 rounded-md transition-all shadow-2xs cursor-pointer active:scale-95"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRowCamera(voter)}
                            className="bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-semibold text-xs px-2.5 py-1 rounded-md transition-all flex items-center gap-1 cursor-pointer active:scale-95 shadow-2xs"
                            title="Take photo with Live Camera"
                          >
                            <Camera className="w-3.5 h-3.5 text-purple-600" />
                            <span className="hidden sm:inline">Camera</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </main>

        {/* Real-Time Activity Log */}
        {showLogs && (
          <section className="bg-slate-900 border-t border-slate-800 text-slate-300 p-4 transition-all">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-xs font-mono">
              <span className="flex items-center gap-2 text-indigo-400 font-semibold">
                <Terminal className="w-4 h-4" />
                Live Real-Time Postgres Sync Monitor
              </span>
              <button
                onClick={() => setLogs([])}
                className="text-slate-500 hover:text-slate-300 text-xs cursor-pointer"
              >
                Clear Console
              </button>
            </div>
            <div
              ref={logContainerRef}
              className="max-h-36 overflow-y-auto space-y-1 font-mono text-xs pr-2"
            >
              {logs.length === 0 ? (
                <div className="text-slate-500 italic">No events logged yet. Listening on public:voters...</div>
              ) : (
                logs.map((item) => (
                  <div key={item.id} className="flex items-start gap-2">
                    <span className="text-slate-500 select-none">[{item.time}]</span>
                    <span
                      className={
                        item.type === 'success'
                          ? 'text-emerald-400'
                          : item.type === 'error'
                          ? 'text-rose-400'
                          : item.type === 'warn'
                          ? 'text-amber-400'
                          : 'text-slate-300'
                      }
                    >
                      {item.message}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="p-4 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>Gibson Palipe Campaign Official Database — Mendi Central Open</div>
          <div className="flex items-center gap-3">
            <span>Supabase PostgreSQL</span>
            <button
              onClick={() => setShowLogs(!showLogs)}
              className="text-indigo-600 hover:underline cursor-pointer"
            >
              {showLogs ? 'Hide Live Monitor' : 'Show Live Monitor'}
            </button>
          </div>
        </footer>
      </div>

      {/* Add / Edit Voter Modal with Live Camera & Photo Capture */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 sm:p-5 bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 text-white flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-xs flex items-center justify-center border border-white/20 text-white shadow-2xs">
                  <UserCheck className="w-5 h-5 text-indigo-100" />
                </div>
                <div>
                  <h3 className="font-bold text-lg sm:text-xl flex items-center gap-2">
                    {editingVoter ? 'Edit Voter Profile' : 'Create Voter Profile'}
                  </h3>
                  <p className="text-xs text-indigo-100/90 font-medium">
                    {editingVoter
                      ? `Voter ID #${editingVoter.id || ''} • ${editingVoter.full_name}`
                      : 'Capture photo and register voter profile'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-white/80 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="p-5 sm:p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {formError && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Voter Profile Photo Showcase at the Top */}
              <div className="bg-gradient-to-b from-indigo-50/50 to-slate-50 border border-indigo-100/80 rounded-2xl p-4 sm:p-5 shadow-2xs">
                <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-5">
                  {/* Photo Frame / Avatar */}
                  <div className="relative shrink-0">
                    {formData.photo ? (
                      <div className="relative group">
                        <img
                          src={formData.photo}
                          alt="Voter Profile Photo"
                          className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover border-2 border-indigo-500 shadow-md ring-4 ring-indigo-100/60"
                        />
                        <div className="absolute -bottom-2 -right-1 bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs flex items-center gap-1 border border-white">
                          <CheckCircle className="w-3 h-3" />
                          <span>Attached</span>
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
                      <h4 className="text-sm font-bold text-slate-900">Voter Profile Photo</h4>
                      {formData.photo ? (
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
                      {formData.photo
                        ? 'Photo is attached to this voter profile and will appear on voter cards & records.'
                        : 'Take an instant picture with live camera or choose a photo from your phone/computer.'}
                    </p>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                      <button
                        type="button"
                        onClick={() => setIsCameraModalOpen(true)}
                        className="px-3.5 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>{formData.photo ? 'Retake Photo' : 'Live Camera'}</span>
                      </button>

                      <label className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer active:scale-95">
                        <Upload className="w-3.5 h-3.5 text-slate-500" />
                        <span>{formData.photo ? 'Change File' : 'Device Camera / Files'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={handlePhotoFileUpload}
                          className="hidden"
                        />
                      </label>

                      {formData.photo && (
                        <button
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, photo: null }))}
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

              {/* Full Name */}
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Paul Simon"
                  value={formData.full_name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, full_name: e.target.value }))}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Phone & Ward Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                    Phone
                  </label>
                  <input
                    type="tel"
                    placeholder="e.g. 71234567"
                    value={formData.phone}
                    onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold uppercase text-slate-600">
                      Ward *
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingWardTarget(formData.ward || (wards.length > 0 ? wards[0] : null));
                        setIsWardModalOpen(true);
                      }}
                      className="text-indigo-600 hover:text-indigo-800 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Pencil className="w-3 h-3" />
                      <span>Edit Wards</span>
                    </button>
                  </div>
                  <select
                    value={formData.ward}
                    onChange={(e) => setFormData((prev) => ({ ...prev, ward: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer bg-white"
                  >
                    {wards.map((w) => (
                      <option key={w} value={w}>
                        {formatWardDisplay(w)}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center justify-between mt-1 text-[11px] text-slate-500">
                    <span>Manage all district wards</span>
                    <button
                      type="button"
                      onClick={() => setIsCameraModalOpen(true)}
                      className="text-purple-600 hover:text-purple-800 font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Camera className="w-3 h-3" />
                      <span>Take Photo</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Village & Status Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                    Village / Polling Place
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Kiburu"
                    value={formData.village}
                    onChange={(e) => setFormData((prev) => ({ ...prev, village: e.target.value }))}
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                    Status *
                  </label>
                  <select
                    value={formData.support_status}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        support_status: e.target.value as any,
                      }))
                    }
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer bg-white"
                  >
                    <option value="Supporter">Supporter</option>
                    <option value="Undecided">Undecided</option>
                    <option value="Opposed">Opposed</option>
                  </select>
                </div>
              </div>

              {/* Age & Gender */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                    Age
                  </label>
                  <input
                    type="number"
                    min="18"
                    max="120"
                    placeholder="e.g. 35"
                    value={formData.age}
                    onChange={(e) => setFormData((prev) => ({ ...prev, age: e.target.value }))}
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                    Gender
                  </label>
                  <select
                    value={formData.gender}
                    onChange={(e) => setFormData((prev) => ({ ...prev, gender: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer bg-white"
                  >
                    <option value="">Select Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="Key voter concerns, commitments, contact notes..."
                  value={formData.notes}
                  onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Form Buttons */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
                {editingVoter ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Are you sure you want to delete ${editingVoter.full_name}?`)) {
                        setDeletingVoter(editingVoter);
                        confirmDelete();
                      }
                    }}
                    className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-lg border border-rose-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Voter</span>
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={formSubmitting}
                    className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    {formSubmitting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <span>Save Voter</span>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Ward Modal */}
      {isWardModalOpen && (
        <AddWardModal
          isOpen={isWardModalOpen}
          wards={wards}
          existingWards={wards}
          initialWard={editingWardTarget}
          onAddWard={handleAddWard}
          onEditWard={handleEditWard}
          onDeleteWard={handleDeleteWard}
          capturedCameraPhoto={capturedWardPhoto}
          onOpenWardCamera={(wardName) => {
            setCameraTargetWard(wardName || null);
            setIsWardFormCamera(true);
            setIsCameraModalOpen(true);
            addLog(`📸 Camera activated for ward "${wardName || 'General'}"`, 'info');
          }}
          onClose={() => {
            setIsWardModalOpen(false);
            setEditingWardTarget(null);
            setCapturedWardPhoto(null);
          }}
        />
      )}

      {/* Ward Statistics & Analytics Modal */}
      {isWardStatsModalOpen && (
        <WardStatisticsModal
          isOpen={isWardStatsModalOpen}
          onClose={() => setIsWardStatsModalOpen(false)}
          voters={voters}
          wards={wards}
          supabaseWardStats={supabaseWardStats}
          onEditWard={handleEditWard}
          onOpenWardCamera={(wardName) => {
            setCameraTargetWard(wardName);
            setIsCameraModalOpen(true);
            addLog(`📸 Camera activated for ward "${formatWardDisplay(wardName)}"`, 'info');
          }}
          onSelectWardFilter={(ward) => {
            setSelectedWard(ward);
            setActiveTab('table');
            addLog(`🔍 Filtered table to ward: "${formatWardDisplay(ward)}"`, 'info');
          }}
        />
      )}

      {/* Camera Capture Modal */}
      {isCameraModalOpen && (
        <CameraCaptureModal
          isOpen={isCameraModalOpen}
          onCapture={handleCameraCaptureComplete}
          onClose={() => {
            setIsCameraModalOpen(false);
            setCameraTargetVoter(null);
            setCameraTargetWard(null);
            setIsWardFormCamera(false);
          }}
        />
      )}

      {/* Photo Lightbox */}
      {viewingPhoto && (
        <div
          onClick={() => setViewingPhoto(null)}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4 cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl p-4 max-w-sm w-full shadow-2xl text-center"
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-bold text-slate-900 text-sm">{viewingPhoto.name}</h4>
              <button
                onClick={() => setViewingPhoto(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-full cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <img
              src={viewingPhoto.photoUrl}
              alt={viewingPhoto.name}
              className="w-full h-72 object-cover rounded-xl border border-slate-200 shadow-inner"
            />
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Supabase Database Connection</h3>
            <p className="text-xs text-slate-500 mb-4">Mendi Central Open live database instance</p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Supabase Project URL</label>
                <input
                  type="text"
                  value={tempUrl}
                  onChange={(e) => setTempUrl(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Anon / Publishable API Key</label>
                <input
                  type="text"
                  value={tempKey}
                  onChange={(e) => setTempKey(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                />
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  resetStoredSupabaseConfig();
                  setTempUrl(DEFAULT_SUPABASE_URL);
                  setTempKey(DEFAULT_SUPABASE_KEY);
                  setSupabaseConfig({ url: DEFAULT_SUPABASE_URL, key: DEFAULT_SUPABASE_KEY });
                  setIsSettingsOpen(false);
                }}
                className="text-xs text-rose-600 hover:underline cursor-pointer"
              >
                Reset to Default
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(false)}
                  className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    saveStoredSupabaseConfig(tempUrl, tempKey);
                    setSupabaseConfig({ url: tempUrl, key: tempKey });
                    setIsSettingsOpen(false);
                  }}
                  className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Save Connection
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
