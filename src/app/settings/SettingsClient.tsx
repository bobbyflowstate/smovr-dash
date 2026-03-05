'use client';

import { useState, useEffect, useCallback } from 'react';

interface TeamSettings {
  _id: string;
  name: string;
  contactPhone?: string;
  timezone?: string;
  hospitalAddress?: string;
  languageMode: 'en' | 'en_es';
  rescheduleUrl?: string;
  entrySlug?: string;
}

const TIMEZONE_OPTIONS = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
];

export default function SettingsClient() {
  const [settings, setSettings] = useState<TeamSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [timezone, setTimezone] = useState('');
  const [hospitalAddress, setHospitalAddress] = useState('');
  const [languageMode, setLanguageMode] = useState<'en' | 'en_es'>('en_es');
  const [rescheduleUrl, setRescheduleUrl] = useState('');
  const [entrySlug, setEntrySlug] = useState('');

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/settings');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to fetch settings (${res.status})`);
      }
      const data: TeamSettings = await res.json();
      setSettings(data);
      setName(data.name);
      setContactPhone(data.contactPhone || '');
      setTimezone(data.timezone || '');
      setHospitalAddress(data.hospitalAddress || '');
      setLanguageMode(data.languageMode);
      setRescheduleUrl(data.rescheduleUrl || '');
      setEntrySlug(data.entrySlug || '');
      setError(null);
    } catch (err) {
      console.error('Error fetching settings:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Team name is required');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          contactPhone: contactPhone.trim(),
          timezone,
          hospitalAddress: hospitalAddress.trim(),
          languageMode,
          rescheduleUrl: rescheduleUrl.trim(),
          entrySlug: entrySlug.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save settings');
      }

      setSuccessMessage('Settings saved successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
      await fetchSettings();
    } catch (err) {
      console.error('Error saving settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const entryUrl = entrySlug
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/entry/${entrySlug}`
    : null;

  const copyEntryUrl = async () => {
    if (!entryUrl) return;
    try {
      await navigator.clipboard.writeText(entryUrl);
      setSuccessMessage('Entry URL copied to clipboard');
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (err) {
      console.error('Error copying entry URL to clipboard:', err);
      setError('Could not copy to clipboard. Your browser may have denied clipboard access.');
    }
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
      <div className="container mx-auto px-4 max-w-3xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Manage your team configuration and messaging preferences
          </p>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 p-4 rounded-lg mb-6">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 p-4 rounded-lg mb-6">
            {successMessage}
          </div>
        )}

        <div className="space-y-6">
          {/* General Settings */}
          <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">General</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Team Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Contact Phone
                </label>
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="+1 (555) 123-4567"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Timezone
                </label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select timezone...</option>
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <option key={tz} value={tz}>{tz.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Office Address
                </label>
                <input
                  type="text"
                  value={hospitalAddress}
                  onChange={(e) => setHospitalAddress(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="123 Main St, Suite 100, City, ST 12345"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Included in appointment confirmation and reminder messages
                </p>
              </div>
            </div>
          </section>

          {/* Messaging Settings */}
          <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Messaging</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Language Mode
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="languageMode"
                      value="en"
                      checked={languageMode === 'en'}
                      onChange={() => setLanguageMode('en')}
                      className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">English only</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="languageMode"
                      value="en_es"
                      checked={languageMode === 'en_es'}
                      onChange={() => setLanguageMode('en_es')}
                      className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">English + Spanish</span>
                  </label>
                </div>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Controls whether automated messages are sent in English only or in both English and Spanish
                </p>
              </div>
            </div>
          </section>

          {/* Scheduling Settings */}
          <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Scheduling</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Custom Scheduling URL
                </label>
                <input
                  type="url"
                  value={rescheduleUrl}
                  onChange={(e) => setRescheduleUrl(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="https://your-booking-system.com/schedule"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {rescheduleUrl
                    ? 'Scheduling links in messages will point to this URL'
                    : 'Leave empty to use the built-in SMOVR booking page'}
                </p>
              </div>
            </div>
          </section>

          {/* Website Entry Settings */}
          <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Website Entry</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Entry Slug
                </label>
                <input
                  type="text"
                  value={entrySlug}
                  onChange={(e) => setEntrySlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="my-clinic"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Lowercase letters, numbers, and hyphens only. Used to generate your website entry URL.
                </p>
              </div>

              {entryUrl && (
                <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Your Website Entry URL
                  </label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-gray-100 break-all">
                      {entryUrl}
                    </code>
                    <button
                      type="button"
                      onClick={copyEntryUrl}
                      className="px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors whitespace-nowrap"
                    >
                      Copy
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Place this URL behind a button on your website so visitors can start a text interaction
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Save Button */}
        <div className="mt-8 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
