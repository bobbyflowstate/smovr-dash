"use client";

import { useState, useEffect } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";
import "react-phone-number-input/style.css";
import {
  APPOINTMENT_TIMEZONE,
  extractComponentsInTimezone,
  convertToTimezoneDisplayDate,
  convertFromTimezoneDisplayDate,
  getTimezoneDisplayName,
  formatFullDateTimeInAppointmentTimezone,
} from '@/lib/timezone-utils';
import { Id } from '../../../convex/_generated/dataModel';

interface SubmitFormProps {
  userName: string;
  teamName: string;
}

interface Patient {
  phone: string;
  name: string;
}

interface ExistingAppointment {
  id: Id<"appointments">;
  dateTime: string;
  patient: {
    name: string | null;
    phone: string;
  };
}

export default function SubmitForm({ userName, teamName }: SubmitFormProps) {
  const [phone, setPhone] = useState<string | undefined>("");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  // Store the actual UTC Date object
  const [appointmentDateTimeUTC, setAppointmentDateTimeUTC] = useState<Date | null>(
    new Date()
  );
  const [currentTeamName, setCurrentTeamName] = useState<string>(teamName);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  
  // Autocomplete states
  const [patients, setPatients] = useState<Patient[]>([]);
  const [showPhoneDropdown, setShowPhoneDropdown] = useState(false);
  const [showNameDropdown, setShowNameDropdown] = useState(false);
  
  // Confirmation dialog states
  const [showConfirmationDialog, setShowConfirmationDialog] = useState(false);
  const [existingAppointment, setExistingAppointment] = useState<ExistingAppointment | null>(null);
  const [pendingAppointmentData, setPendingAppointmentData] = useState<{
    phone: string;
    name: string;
    notes: string;
    appointmentDateTimeUTC: Date;
  } | null>(null);

  // Convert UTC date to display date (shows appointment timezone in DatePicker)
  const appointmentDateTime = appointmentDateTimeUTC 
    ? convertToTimezoneDisplayDate(appointmentDateTimeUTC, APPOINTMENT_TIMEZONE)
    : null;
  
  // Handle DatePicker change - convert from display date back to UTC
  const handleDateChange = (date: Date | null) => {
    if (!date) {
      setAppointmentDateTimeUTC(null);
      return;
    }
    // Convert the selected date (which represents appointment timezone time) back to UTC
    const utcDate = convertFromTimezoneDisplayDate(date, APPOINTMENT_TIMEZONE);
    setAppointmentDateTimeUTC(utcDate);
  };

  // Fetch patients for autocomplete on mount
  useEffect(() => {
    fetchPatients();
  }, []);

  const fetchPatients = async () => {
    try {
      const response = await fetch('/api/patients');
      if (response.ok) {
        const data = await response.json();
        setPatients(data);
      }
    } catch (err) {
      console.error('Error fetching patients:', err);
    }
  };

  // Filter phone suggestions
  const phoneMatches = phone
    ? patients.filter(p => p.phone.includes(phone)).slice(0, 5)
    : [];

  // Filter name suggestions
  const nameMatches = name
    ? patients.filter(p => p.name.toLowerCase().includes(name.toLowerCase())).slice(0, 5)
    : [];

  // Select from phone dropdown -> auto-fill name
  const selectPhone = (patient: Patient) => {
    setPhone(patient.phone);
    setName(patient.name);
    setShowPhoneDropdown(false);
  };

  // Select from name dropdown -> auto-fill phone
  const selectName = (patient: Patient) => {
    setName(patient.name);
    setPhone(patient.phone);
    setShowNameDropdown(false);
  };

  const scheduleAppointment = async (skipExistingCheck: boolean = false) => {
    if (!phone || !name || !appointmentDateTimeUTC) {
      setError("Phone number, patient name, and appointment date/time are required.");
      return;
    }

    if (appointmentDateTimeUTC < new Date()) {
      setError("Cannot schedule an appointment in the past.");
      return;
    }

    if (!isValidPhoneNumber(phone)) {
      setError("Please enter a valid phone number.");
      return;
    }

    setIsSubmitting(true);

    try {
      console.log('SubmitForm: Submitting appointment for user:', userName);

      // Extract time components as they appear in the backend's configured timezone
      const timezoneComponents = extractComponentsInTimezone(appointmentDateTimeUTC, APPOINTMENT_TIMEZONE);
      
      const appointmentResponse = await fetch('/api/appointments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone,
          name,
          notes,
          appointmentDateTime: appointmentDateTimeUTC.toISOString(),
          appointmentDateTimeLocal: {
            year: timezoneComponents.year,
            month: timezoneComponents.month,
            day: timezoneComponents.day,
            hour: timezoneComponents.hour,
            minute: timezoneComponents.minute,
            second: timezoneComponents.second,
          },
          metadata: {},
          skipExistingCheck,
        }),
      });

      if (!appointmentResponse.ok) {
        const errorData = await appointmentResponse.json();
        throw new Error(errorData.error || 'Failed to create appointment');
      }

      const result = await appointmentResponse.json();

      // Check if confirmation is required
      if (result.requiresConfirmation && result.existingAppointment) {
        setExistingAppointment(result.existingAppointment);
        setPendingAppointmentData({
          phone,
          name,
          notes,
          appointmentDateTimeUTC,
        });
        setShowConfirmationDialog(true);
        setIsSubmitting(false);
        return;
      }

      // Update team name if provided
      if (result.teamName) {
        setCurrentTeamName(result.teamName);
      }

      if (result.newAppointment) {
        setSuccessMessage("New appointment scheduled successfully!");
        setPhone("");
        setName("");
        setNotes("");
        setAppointmentDateTimeUTC(new Date());
      } else {
        setError("This appointment already exists for this patient.");
      }
    } catch (err) {
      setError("Failed to schedule appointment. Please try again.");
      console.error('SubmitForm: Error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");
    await scheduleAppointment(false);
  };

  const handleConfirmCancelAndSchedule = async () => {
    if (!existingAppointment || !pendingAppointmentData) {
      return;
    }

    setIsSubmitting(true);
    setShowConfirmationDialog(false);

    // Store current form state temporarily
    const savedPhone = phone;
    const savedName = name;
    const savedNotes = notes;
    const savedDateTime = appointmentDateTimeUTC;

    // Restore pending appointment data to form state
    setPhone(pendingAppointmentData.phone);
    setName(pendingAppointmentData.name);
    setNotes(pendingAppointmentData.notes);
    setAppointmentDateTimeUTC(pendingAppointmentData.appointmentDateTimeUTC);

    try {
      // First, cancel the existing appointment
      console.log('SubmitForm: Canceling existing appointment:', existingAppointment.id);
      const cancelResponse = await fetch(`/api/appointments/${existingAppointment.id}`, {
        method: 'DELETE',
      });

      if (!cancelResponse.ok) {
        const errorData = await cancelResponse.json();
        throw new Error(errorData.error || 'Failed to cancel existing appointment');
      }

      // Then, schedule the new appointment (skip the existing check since we just canceled it)
      console.log('SubmitForm: Scheduling new appointment after cancellation');
      await scheduleAppointment(true);
    } catch (err) {
      // Restore original form state on error
      setPhone(savedPhone);
      setName(savedName);
      setNotes(savedNotes);
      setAppointmentDateTimeUTC(savedDateTime);
      setError("Failed to cancel existing appointment and schedule new one. Please try again.");
      console.error('SubmitForm: Error:', err);
      setIsSubmitting(false);
    }
  };

  const handleCancelConfirmation = () => {
    setShowConfirmationDialog(false);
    setExistingAppointment(null);
    setPendingAppointmentData(null);
    setIsSubmitting(false);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 transition-colors">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Patient Submission Form</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Submitting appointment for: <span className="font-semibold">{currentTeamName}</span>
        </p>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Phone Number with Autocomplete */}
          <div className="relative">
            <label
              htmlFor="phone"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              Phone Number
            </label>
            <div className="phone-input-dark">
              <PhoneInput
                id="phone"
                placeholder="Enter phone number"
                value={phone}
                onChange={(value) => {
                  setPhone(value);
                  setShowPhoneDropdown(true);
                }}
                onFocus={() => setShowPhoneDropdown(true)}
                onBlur={() => setTimeout(() => setShowPhoneDropdown(false), 200)}
                defaultCountry="US"
              />
            </div>
            {showPhoneDropdown && phoneMatches.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-auto">
                {phoneMatches.map((patient, i) => (
                  <div
                    key={i}
                    onClick={() => selectPhone(patient)}
                    className="px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer border-b border-gray-200 dark:border-gray-600 last:border-b-0 transition-colors"
                  >
                    <div className="font-medium text-gray-900 dark:text-white">{patient.phone}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">{patient.name}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Patient Name with Autocomplete */}
          <div className="relative">
            <label
              htmlFor="name"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              Patient Name
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setShowNameDropdown(true);
              }}
              onFocus={() => setShowNameDropdown(true)}
              onBlur={() => setTimeout(() => setShowNameDropdown(false), 200)}
              required
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors"
              placeholder="Enter patient name"
            />
            {showNameDropdown && nameMatches.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-auto">
                {nameMatches.map((patient, i) => (
                  <div
                    key={i}
                    onClick={() => selectName(patient)}
                    className="px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer border-b border-gray-200 dark:border-gray-600 last:border-b-0 transition-colors"
                  >
                    <div className="font-medium text-gray-900 dark:text-white">{patient.name}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">{patient.phone}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label
              htmlFor="appointmentDateTime"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              Appointment Date & Time
            </label>
            <div className="datepicker-dark">
              <DatePicker
                id="appointmentDateTime"
                selected={appointmentDateTime}
                onChange={handleDateChange}
                showTimeSelect
                dateFormat="Pp"
                minDate={convertToTimezoneDisplayDate(new Date(), APPOINTMENT_TIMEZONE)}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors"
              />
            </div>
            <div className="mt-2 space-y-1">
              {appointmentDateTimeUTC && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">Selected time:</span>
                  <span className="text-sm font-mono text-gray-900 dark:text-gray-100">
                    {formatFullDateTimeInAppointmentTimezone(appointmentDateTimeUTC)}
                  </span>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border border-blue-200 dark:border-blue-700">
                    {getTimezoneDisplayName(APPOINTMENT_TIMEZONE)}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div>
            {/* <label
              htmlFor="notes"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              Notes (Optional)
            </label> */}
            {/* <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={1}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors resize-none"
            /> */}
          </div>
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
            </div>
          )}
          {successMessage && (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <p className="text-green-700 dark:text-green-400 text-sm">{successMessage}</p>
            </div>
          )}
          <div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-white dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:shadow-lg transform hover:-translate-y-0.5"
            >
              {isSubmitting ? "Submitting..." : "Submit Appointment"}
            </button>
          </div>
        </form>
      </div>

      {/* Confirmation Dialog */}
      {showConfirmationDialog && existingAppointment && pendingAppointmentData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 max-w-md w-full mx-4 border border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              Existing Appointment Found
            </h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              This phone number already has a scheduled appointment. Scheduling a new appointment will cancel the existing one.
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              If this is a different patient, use a different phone number.
            </p>
            
            <div className="space-y-3 mb-6">
              <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-1">
                  Existing Appointment:
                </p>
                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                  {existingAppointment.patient.name && (
                    <span className="font-semibold">{existingAppointment.patient.name}</span>
                  )}
                  {existingAppointment.patient.name && ' - '}
                  {existingAppointment.patient.phone}
                </p>
                <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                  {formatFullDateTimeInAppointmentTimezone(new Date(existingAppointment.dateTime))}
                </p>
              </div>
              
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-1">
                  New Appointment:
                </p>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  {pendingAppointmentData.name} - {pendingAppointmentData.phone}
                </p>
                <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                  {formatFullDateTimeInAppointmentTimezone(pendingAppointmentData.appointmentDateTimeUTC)}
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleCancelConfirmation}
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmCancelAndSchedule}
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? "Processing..." : "Cancel Old & Schedule New"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
