'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface Patient {
  _id: string;
  name?: string;
  phone: string;
  notes?: string;
  birthday?: string; // ISO date string (YYYY-MM-DD)
  teamId: string;
  upcomingAppointments: number;
}

interface PatientWithHistory extends Patient {
  appointments: Array<{
    _id: string;
    dateTime: string;
    status?: string;
    notes?: string;
  }>;
}

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
  const [formBirthday, setFormBirthday] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);

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
      const res = await fetch('/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          phone: formPhone.trim(),
          notes: formNotes.trim() || undefined,
          birthday: formBirthday || undefined,
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
      setFormBirthday('');
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
      const res = await fetch('/api/patients', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: selectedPatient._id,
          name: formName.trim(),
          phone: formPhone.trim(),
          notes: formNotes.trim() || undefined,
          birthday: formBirthday || '', // Empty string clears birthday
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
      setShowViewModal(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to load patient details');
    }
  };

  const openEditModal = (patient: Patient) => {
    setFormName(patient.name || '');
    setFormPhone(patient.phone);
    setFormNotes(patient.notes || '');
    setFormBirthday(patient.birthday || '');
    setFormError(null);
    setSelectedPatient(patient as PatientWithHistory);
    setShowEditModal(true);
  };

  const openAddModal = () => {
    setFormName('');
    setFormPhone('');
    setFormNotes('');
    setFormBirthday('');
    setFormError(null);
    setShowAddModal(true);
  };

  const filteredPatients = patients.filter(patient => {
    const query = searchQuery.toLowerCase();
    return (
      (patient.name?.toLowerCase().includes(query) || false) ||
      patient.phone.includes(query)
    );
  });

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
                    <tr key={patient._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
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
                            {new Date(patient.birthday + 'T12:00:00').toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                            })}
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
                <input
                  type="date"
                  value={formBirthday}
                  onChange={(e) => setFormBirthday(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  For birthday reminder notifications
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
                <input
                  type="date"
                  value={formBirthday}
                  onChange={(e) => setFormBirthday(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  For birthday reminder notifications
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
                    {new Date(selectedPatient.birthday + 'T12:00:00').toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </p>
                </div>
              )}
              {selectedPatient.notes && (
                <div className={`p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg ${!selectedPatient.birthday ? 'sm:col-span-2' : ''}`}>
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

