'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { format, getDaysInMonth } from 'date-fns';

interface Patient {
  _id: string;
  name?: string;
  phone: string;
  notes?: string;
  birthday?: string; // MM-DD (month and day only)
  recommendedReturnDate?: string; // YYYY-MM-DD
  teamId: string;
  upcomingAppointments: number;
}

const MONTHS = Array.from({ length: 12 }, (_, i) => {
  const date = new Date(2024, i, 1);
  return { value: String(i + 1).padStart(2, '0'), label: format(date, 'MMMM') };
});

function getDaysForMonth(month: string): string[] {
  const count = getDaysInMonth(new Date(2024, parseInt(month, 10) - 1));
  return Array.from({ length: count }, (_, i) => String(i + 1).padStart(2, '0'));
}

function formatBirthday(birthday: string): string {
  const parts = birthday.split('-');
  const mm = parts.length === 3 ? parts[1] : parts[0];
  const dd = parts.length === 3 ? parts[2] : parts[1];
  const date = new Date(2024, parseInt(mm, 10) - 1, parseInt(dd, 10));
  return format(date, 'MMMM d');
}

interface PatientWithHistory extends Patient {
  appointments: Array<{
    _id: string;
    dateTime: string;
    status?: string;
    notes?: string;
  }>;
}

interface Referral {
  _id: string;
  referralName?: string;
  referralAddress?: string;
  referralPhone?: string;
  notes?: string;
  status: "pending" | "confirmed" | "needs_help";
  statusUpdatedAt?: string;
  followUpSentAt?: string;
  followUpDelay?: number;
  token: string;
  createdAt: string;
}

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300" },
  confirmed: { label: "Confirmed", className: "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300" },
  needs_help: { label: "Needs Help", className: "bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300" },
};

export default function PatientsClient() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientWithHistory | null>(null);
  
  // Form states
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formBirthdayMonth, setFormBirthdayMonth] = useState('');
  const [formBirthdayDay, setFormBirthdayDay] = useState('');
  const [formReturnDate, setFormReturnDate] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  // Referral states
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [referralsLoading, setReferralsLoading] = useState(false);
  const [showAddReferral, setShowAddReferral] = useState(false);
  const [refName, setRefName] = useState('');
  const [refAddress, setRefAddress] = useState('');
  const [refPhone, setRefPhone] = useState('');
  const [refNotes, setRefNotes] = useState('');
  const [refDelay, setRefDelay] = useState(0);
  const [refSaving, setRefSaving] = useState(false);
  const [refError, setRefError] = useState<string | null>(null);

  // Reactivation states
  const [selectedPatients, setSelectedPatients] = useState<Set<string>>(new Set());
  const [showReactivationConfirm, setShowReactivationConfirm] = useState(false);
  const [reactivationSending, setReactivationSending] = useState(false);
  const [reactivationResult, setReactivationResult] = useState<{ sent: number; failed: number } | null>(null);

  const fetchPatients = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/patients');
      if (!res.ok) throw new Error('Failed to fetch patients');
      const data = await res.json();
      setPatients(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPatients();
  }, [fetchPatients]);

  const handleAddPatient = async () => {
    if (!formName.trim() || !formPhone.trim()) {
      setFormError('Name and phone are required');
      return;
    }
    
    setFormLoading(true);
    setFormError(null);
    
    try {
      const birthday = formBirthdayMonth && formBirthdayDay
        ? `${formBirthdayMonth}-${formBirthdayDay}`
        : undefined;

      const res = await fetch('/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          phone: formPhone.trim(),
          notes: formNotes.trim() || undefined,
          birthday,
          recommendedReturnDate: formReturnDate || undefined,
        }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add patient');
      }
      
      setShowAddModal(false);
      setFormName('');
      setFormPhone('');
      setFormNotes('');
      setFormBirthdayMonth('');
      setFormBirthdayDay('');
      setFormReturnDate('');
      fetchPatients();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to add patient');
    } finally {
      setFormLoading(false);
    }
  };

  const handleEditPatient = async () => {
    if (!selectedPatient || !formName.trim() || !formPhone.trim()) {
      setFormError('Name and phone are required');
      return;
    }
    
    setFormLoading(true);
    setFormError(null);
    
    try {
      const birthday = formBirthdayMonth && formBirthdayDay
        ? `${formBirthdayMonth}-${formBirthdayDay}`
        : '';

      const res = await fetch('/api/patients', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: selectedPatient._id,
          name: formName.trim(),
          phone: formPhone.trim(),
          notes: formNotes.trim() || undefined,
          birthday,
          recommendedReturnDate: formReturnDate || '',
        }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update patient');
      }
      
      setShowEditModal(false);
      setSelectedPatient(null);
      fetchPatients();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to update patient');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeletePatient = async (patientId: string) => {
    if (!confirm('Are you sure you want to delete this patient? This cannot be undone.')) {
      return;
    }
    
    try {
      const res = await fetch(`/api/patients?id=${patientId}`, {
        method: 'DELETE',
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete patient');
      }
      
      fetchPatients();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete patient');
    }
  };

  const handleViewPatient = async (patientId: string) => {
    try {
      const res = await fetch(`/api/patients?id=${patientId}`);
      if (!res.ok) throw new Error('Failed to fetch patient details');
      const data = await res.json();
      setSelectedPatient(data);
      setReferrals([]);
      setShowAddReferral(false);
      setShowViewModal(true);
      fetchReferrals(patientId);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to load patient details');
    }
  };

  const openEditModal = (patient: Patient) => {
    setFormName(patient.name || '');
    setFormPhone(patient.phone);
    setFormNotes(patient.notes || '');
    if (patient.birthday && patient.birthday.includes('-')) {
      const parts = patient.birthday.split('-');
      if (parts.length === 2) {
        setFormBirthdayMonth(parts[0]);
        setFormBirthdayDay(parts[1]);
      } else if (parts.length === 3) {
        setFormBirthdayMonth(parts[1]);
        setFormBirthdayDay(parts[2]);
      }
    } else {
      setFormBirthdayMonth('');
      setFormBirthdayDay('');
    }
    setFormReturnDate(patient.recommendedReturnDate || '');
    setFormError(null);
    setSelectedPatient(patient as PatientWithHistory);
    setShowEditModal(true);
  };

  const openAddModal = () => {
    setFormName('');
    setFormPhone('');
    setFormNotes('');
    setFormBirthdayMonth('');
    setFormBirthdayDay('');
    setFormReturnDate('');
    setFormError(null);
    setShowAddModal(true);
  };

  const fetchReferrals = useCallback(async (patientId: string) => {
    setReferralsLoading(true);
    try {
      const res = await fetch(`/api/referrals?patientId=${patientId}`);
      if (res.ok) {
        const data = await res.json();
        setReferrals(data);
      }
    } catch (err) {
      console.error("Failed to fetch referrals", err);
    } finally {
      setReferralsLoading(false);
    }
  }, []);

  const handleAddReferral = async () => {
    if (!selectedPatient) return;
    setRefSaving(true);
    setRefError(null);
    try {
      const res = await fetch('/api/referrals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: selectedPatient._id,
          referralName: refName.trim() || undefined,
          referralAddress: refAddress.trim() || undefined,
          referralPhone: refPhone.trim() || undefined,
          notes: refNotes.trim() || undefined,
          followUpDelay: refDelay,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create referral');
      }
      setShowAddReferral(false);
      setRefName('');
      setRefAddress('');
      setRefPhone('');
      setRefNotes('');
      setRefDelay(0);
      fetchReferrals(selectedPatient._id);
    } catch (err) {
      console.error("Failed to create referral", err);
      setRefError(err instanceof Error ? err.message : 'Failed to create referral');
    } finally {
      setRefSaving(false);
    }
  };

  const filteredPatients = patients.filter(patient => {
    const query = searchQuery.toLowerCase();
    return (
      (patient.name?.toLowerCase().includes(query) || false) ||
      patient.phone.includes(query)
    );
  });

  const togglePatientSelection = (patientId: string) => {
    setSelectedPatients((prev) => {
      const next = new Set(prev);
      if (next.has(patientId)) next.delete(patientId);
      else next.add(patientId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedPatients.size === filteredPatients.length) {
      setSelectedPatients(new Set());
    } else {
      setSelectedPatients(new Set(filteredPatients.map((p) => p._id)));
    }
  };

  const handleSendReactivation = async () => {
    setReactivationSending(true);
    setReactivationResult(null);
    try {
      const res = await fetch('/api/reactivation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientIds: Array.from(selectedPatients) }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to send');
      }
      const result = await res.json();
      setReactivationResult(result);
      setSelectedPatients(new Set());
    } catch (err) {
      console.error("Failed to send reactivation messages", err);
      setReactivationResult({ sent: 0, failed: selectedPatients.size });
    } finally {
      setReactivationSending(false);
    }
  };

  const formatPhone = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    } else if (cleaned.length === 11 && cleaned[0] === '1') {
      return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
    }
    return phone;
  };

  const formatDateTime = (dateTime: string) => {
    return new Date(dateTime).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="container mx-auto px-4 max-w-6xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Patients</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Manage patient information and view appointment history
            </p>
          </div>
          <button
            onClick={openAddModal}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            Add Patient
          </button>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by name or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 p-4 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Patients list */}
        {filteredPatients.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
            <div className="mx-auto w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              {searchQuery ? 'No patients found' : 'No patients yet'}
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              {searchQuery 
                ? 'Try adjusting your search criteria.'
                : 'Get started by adding your first patient.'}
            </p>
            {!searchQuery && (
              <button
                onClick={openAddModal}
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                Add your first patient
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                  <tr>
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={filteredPatients.length > 0 && selectedPatients.size === filteredPatients.length}
                        onChange={toggleSelectAll}
                        className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Patient
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Phone
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Birthday
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Upcoming Appts
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Notes
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredPatients.map((patient) => (
                    <tr key={patient._id} className={`hover:bg-gray-50 dark:hover:bg-gray-700/30 ${selectedPatients.has(patient._id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                      <td className="px-4 py-4 w-10">
                        <input
                          type="checkbox"
                          checked={selectedPatients.has(patient._id)}
                          onChange={() => togglePatientSelection(patient._id)}
                          className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900 rounded-full flex items-center justify-center">
                            <span className="text-orange-600 dark:text-orange-400 font-medium text-sm">
                              {(patient.name || '?')[0].toUpperCase()}
                            </span>
                          </div>
                          <div className="ml-3">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {patient.name || 'Unknown'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-white font-mono">
                          {formatPhone(patient.phone)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {patient.birthday ? (
                          <div className="text-sm text-gray-900 dark:text-white">
                            {formatBirthday(patient.birthday)}
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400 dark:text-gray-500">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {patient.upcomingAppointments > 0 ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300">
                            {patient.upcomingAppointments}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-500 dark:text-gray-400">None</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-xs">
                          {patient.notes || '—'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleViewPatient(patient._id)}
                            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                            title="View details"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => openEditModal(patient)}
                            className="text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-300"
                            title="Edit"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <Link
                            href={`/messages/${patient._id}`}
                            className="text-teal-600 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300"
                            title="Send message"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                          </Link>
                          <button
                            onClick={() => handleDeletePatient(patient._id)}
                            className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                            title="Delete"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Patient count */}
        <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          {filteredPatients.length} patient{filteredPatients.length !== 1 ? 's' : ''}
          {searchQuery && ` matching "${searchQuery}"`}
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedPatients.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-gray-900 dark:bg-gray-700 text-white rounded-xl shadow-2xl px-6 py-3 flex items-center gap-4">
          <span className="text-sm font-medium">
            {selectedPatients.size} patient{selectedPatients.size > 1 ? 's' : ''} selected
          </span>
          <button
            onClick={() => setShowReactivationConfirm(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Send Reactivation Message
          </button>
          <button
            onClick={() => setSelectedPatients(new Set())}
            className="px-3 py-2 text-gray-300 hover:text-white text-sm transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Reactivation Confirmation Dialog */}
      {showReactivationConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full p-6">
            {reactivationResult ? (
              <>
                <div className="text-center mb-4">
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3 ${reactivationResult.failed === 0 ? 'bg-green-100 dark:bg-green-900' : 'bg-yellow-100 dark:bg-yellow-900'}`}>
                    {reactivationResult.failed === 0 ? (
                      <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-7 h-7 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01" />
                      </svg>
                    )}
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                    Reactivation Complete
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300">
                    {reactivationResult.sent} message{reactivationResult.sent !== 1 ? 's' : ''} sent successfully
                    {reactivationResult.failed > 0 && `, ${reactivationResult.failed} failed`}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowReactivationConfirm(false);
                    setReactivationResult(null);
                  }}
                  className="w-full py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
                >
                  Close
                </button>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Send Reactivation Messages?
                </h3>
                <p className="text-gray-600 dark:text-gray-300 mb-6">
                  You are about to send a reactivation message to{' '}
                  <strong>{selectedPatients.size}</strong> patient{selectedPatients.size > 1 ? 's' : ''}.
                  Each will receive an SMS with a scheduling link.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowReactivationConfirm(false);
                      setReactivationResult(null);
                    }}
                    disabled={reactivationSending}
                    className="flex-1 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSendReactivation}
                    disabled={reactivationSending}
                    className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {reactivationSending ? 'Sending...' : `Send ${selectedPatients.size} Message${selectedPatients.size > 1 ? 's' : ''}`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Add Patient Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Add New Patient
            </h2>
            
            {formError && (
              <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 p-3 rounded-lg mb-4 text-sm">
                {formError}
              </div>
            )}
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="John Doe"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Phone *
                </label>
                <input
                  type="tel"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="+1 (555) 123-4567"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Birthday
                </label>
                <div className="flex gap-2">
                  <select
                    value={formBirthdayMonth}
                    onChange={(e) => {
                      setFormBirthdayMonth(e.target.value);
                      if (!e.target.value) setFormBirthdayDay('');
                    }}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Month...</option>
                    {MONTHS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                  <select
                    value={formBirthdayDay}
                    onChange={(e) => setFormBirthdayDay(e.target.value)}
                    disabled={!formBirthdayMonth}
                    className="w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                  >
                    <option value="">Day...</option>
                    {formBirthdayMonth && getDaysForMonth(formBirthdayMonth).map((d) => (
                      <option key={d} value={d}>{parseInt(d, 10)}</option>
                    ))}
                  </select>
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  For birthday reminder notifications
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Recommended Return Date
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={formReturnDate}
                    onChange={(e) => setFormReturnDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  {formReturnDate && (
                    <button
                      type="button"
                      onClick={() => setFormReturnDate('')}
                      className="px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Patient will receive reminders 30 and 7 days before this date
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Notes
                </label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  placeholder="Any notes about this patient..."
                />
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddPatient}
                disabled={formLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {formLoading ? 'Adding...' : 'Add Patient'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Patient Modal */}
      {showEditModal && selectedPatient && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Edit Patient
            </h2>
            
            {formError && (
              <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 p-3 rounded-lg mb-4 text-sm">
                {formError}
              </div>
            )}
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Phone *
                </label>
                <input
                  type="tel"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Birthday
                </label>
                <div className="flex gap-2">
                  <select
                    value={formBirthdayMonth}
                    onChange={(e) => {
                      setFormBirthdayMonth(e.target.value);
                      if (!e.target.value) setFormBirthdayDay('');
                    }}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Month...</option>
                    {MONTHS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                  <select
                    value={formBirthdayDay}
                    onChange={(e) => setFormBirthdayDay(e.target.value)}
                    disabled={!formBirthdayMonth}
                    className="w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                  >
                    <option value="">Day...</option>
                    {formBirthdayMonth && getDaysForMonth(formBirthdayMonth).map((d) => (
                      <option key={d} value={d}>{parseInt(d, 10)}</option>
                    ))}
                  </select>
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  For birthday reminder notifications
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Recommended Return Date
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={formReturnDate}
                    onChange={(e) => setFormReturnDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  {formReturnDate && (
                    <button
                      type="button"
                      onClick={() => setFormReturnDate('')}
                      className="px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Patient will receive reminders 30 and 7 days before this date
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Notes
                </label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedPatient(null);
                }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleEditPatient}
                disabled={formLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {formLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Patient Modal */}
      {showViewModal && selectedPatient && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-2xl w-full p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-orange-100 dark:bg-orange-900 rounded-full flex items-center justify-center">
                  <span className="text-orange-600 dark:text-orange-400 font-bold text-2xl">
                    {(selectedPatient.name || '?')[0].toUpperCase()}
                  </span>
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    {selectedPatient.name || 'Unknown'}
                  </h2>
                  <p className="text-gray-500 dark:text-gray-400 font-mono">
                    {formatPhone(selectedPatient.phone)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowViewModal(false);
                  setSelectedPatient(null);
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Patient Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              {selectedPatient.birthday && (
                <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 15.546c-.523 0-1.046.151-1.5.454a2.704 2.704 0 01-3 0 2.704 2.704 0 00-3 0 2.704 2.704 0 01-3 0 2.704 2.704 0 00-3 0 2.704 2.704 0 01-3 0A2.704 2.704 0 003 15.546V3h18v12.546z" />
                    </svg>
                    Birthday
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    {formatBirthday(selectedPatient.birthday)}
                  </p>
                </div>
              )}
              {selectedPatient.recommendedReturnDate && (
                <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Recommended Return
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    {format(new Date(selectedPatient.recommendedReturnDate + 'T00:00:00'), 'MMMM d, yyyy')}
                  </p>
                </div>
              )}
              {selectedPatient.notes && (
                <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</h3>
                  <p className="text-gray-600 dark:text-gray-400">{selectedPatient.notes}</p>
                </div>
              )}
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                Appointment History
              </h3>
              
              {selectedPatient.appointments?.length > 0 ? (
                <div className="space-y-3">
                  {selectedPatient.appointments.map((apt) => (
                    <div
                      key={apt._id}
                      className={`p-4 rounded-lg border ${
                        apt.status === 'cancelled'
                          ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                          : 'bg-gray-50 dark:bg-gray-700/30 border-gray-200 dark:border-gray-600'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-gray-900 dark:text-white">
                            {formatDateTime(apt.dateTime)}
                          </div>
                          {apt.notes && (
                            <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                              {apt.notes}
                            </div>
                          )}
                        </div>
                        {apt.status === 'cancelled' && (
                          <span className="px-2 py-1 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 text-xs rounded-full">
                            Cancelled
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                  No appointment history
                </p>
              )}
            </div>
            
            {/* Referrals Section */}
            <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Referrals</h3>
                <button
                  onClick={() => setShowAddReferral(!showAddReferral)}
                  className="text-sm px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
                >
                  {showAddReferral ? 'Cancel' : '+ Add Referral'}
                </button>
              </div>

              {showAddReferral && (
                <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg space-y-3">
                  {refError && (
                    <p className="text-sm text-red-600 dark:text-red-400">{refError}</p>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Referral Name</label>
                    <input
                      type="text"
                      value={refName}
                      onChange={(e) => setRefName(e.target.value)}
                      placeholder="Dr. Smith / Specialist Office"
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Address</label>
                      <input
                        type="text"
                        value={refAddress}
                        onChange={(e) => setRefAddress(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Phone</label>
                      <input
                        type="tel"
                        value={refPhone}
                        onChange={(e) => setRefPhone(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Notes</label>
                    <textarea
                      value={refNotes}
                      onChange={(e) => setRefNotes(e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Follow-up Delay (minutes)</label>
                    <select
                      value={refDelay}
                      onChange={(e) => setRefDelay(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    >
                      <option value={0}>Send immediately</option>
                      <option value={30}>30 minutes</option>
                      <option value={60}>1 hour</option>
                      <option value={120}>2 hours</option>
                      <option value={240}>4 hours</option>
                      <option value={1440}>24 hours</option>
                    </select>
                  </div>
                  <button
                    onClick={handleAddReferral}
                    disabled={refSaving}
                    className="w-full py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
                  >
                    {refSaving ? 'Creating...' : 'Create Referral & Send Follow-Up'}
                  </button>
                </div>
              )}

              {referralsLoading ? (
                <p className="text-gray-400 text-sm text-center py-4">Loading referrals...</p>
              ) : referrals.length > 0 ? (
                <div className="space-y-3">
                  {referrals.map((ref) => {
                    const badge = STATUS_BADGES[ref.status];
                    return (
                      <div key={ref._id} className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-200 dark:border-gray-600">
                        <div className="flex items-start justify-between">
                          <div>
                            {ref.referralName && (
                              <p className="font-medium text-gray-900 dark:text-white">{ref.referralName}</p>
                            )}
                            {ref.referralAddress && (
                              <p className="text-sm text-gray-500 dark:text-gray-400">{ref.referralAddress}</p>
                            )}
                            {ref.referralPhone && (
                              <p className="text-sm text-gray-500 dark:text-gray-400">{ref.referralPhone}</p>
                            )}
                            {ref.notes && (
                              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 italic">{ref.notes}</p>
                            )}
                          </div>
                          <span className={`px-2 py-1 text-xs rounded-full whitespace-nowrap ${badge.className}`}>
                            {badge.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                          <span>Created {new Date(ref.createdAt).toLocaleDateString()}</span>
                          {ref.followUpSentAt && <span>Follow-up sent {new Date(ref.followUpSentAt).toLocaleDateString()}</span>}
                          {ref.statusUpdatedAt && <span>Updated {new Date(ref.statusUpdatedAt).toLocaleDateString()}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400 text-center text-sm py-4">
                  No referrals yet
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
              <Link
                href={`/messages/${selectedPatient._id}`}
                className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                Send Message
              </Link>
              <button
                onClick={() => {
                  setShowViewModal(false);
                  openEditModal(selectedPatient);
                }}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
              >
                Edit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

