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
  normalizeWardKey,
  cleanWardName,
  resolveWards,
  saveWardRename,
  saveDeletedWard
} from './lib/supabase';
import { CameraCaptureModal } from './components/CameraCaptureModal';
import { AddWardModal } from './components/AddWardModal';
import { WardStatisticsModal } from './components/WardStatisticsModal';
import { saveVoterPhoto, getVoterPhoto, deleteVoterPhoto, generateDummyVoterPhoto, compressImage, saveWardPhoto, getWardPhoto } from './lib/photoStorage';

const blockedWardNames = ['pinj 1', 'pinj 2'];

function normalizeWardForComparison(ward: string) {
  return formatWardDisplay(ward || '')
    .toLowerCase()
    .replace(/^\d+\.\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isBlockedWardName(ward: string) {
  const value = normalizeWardForComparison(ward);
  return blockedWardNames.includes(value);
}

function filterBlockedWards(wardList: string[]) {
  return wardList.filter((ward) => !isBlockedWardName(ward));
}

interface LogEntry {
  id: string;
  time: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warn';
}

function parseNotes(notesStr?: string | null) {
