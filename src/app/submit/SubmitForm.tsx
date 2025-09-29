"use client";

import { useState } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";
import "react-phone-number-input/style.css";

interface SubmitFormProps {
  userName: string;
  teamName: string;
}

export default function SubmitForm({ userName, teamName }: SubmitFormProps) {
  const [phone, setPhone] = useState<string | undefined>("");
  const [notes, setNotes] = useState("");
  const [appointmentDateTime, setAppointmentDateTime] = useState<Date | null>(
    new Date()
  );
  const [currentTeamName, setCurrentTeamName] = useState<string>(teamName);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // No more direct Convex calls - using API routes instead

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");

    if (!phone || !appointmentDateTime) {
      setError("Phone number and appointment date/time are required.");
      return;
    }

    if (appointmentDateTime < new Date()) {
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

      // 🔒 Create appointment via authenticated API route
      console.log('SubmitForm: Creating appointment...');
      const appointmentResponse = await fetch('/api/appointments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone,
          notes,
          appointmentDateTime: appointmentDateTime.toISOString(),
          metadata: {}, // Empty metadata for now, can be extended later
        }),
      });

      if (!appointmentResponse.ok) {
        const errorData = await appointmentResponse.json();
        throw new Error(errorData.error || 'Failed to create appointment');
      }

      const result = await appointmentResponse.json();

      // Update team name if provided
      if (result.teamName) {
        setCurrentTeamName(result.teamName);
      }

      if (result.newAppointment) {
        setSuccessMessage("New appointment scheduled successfully!");
        setPhone("");
        setNotes("");
        setAppointmentDateTime(new Date());
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

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 transition-colors">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Patient Submission Form</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Submitting appointment for: <span className="font-semibold">{currentTeamName}</span>
        </p>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
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
                onChange={setPhone}
                defaultCountry="US"
              />
            </div>
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
                onChange={(date) => setAppointmentDateTime(date)}
                showTimeSelect
                dateFormat="Pp"
                minDate={new Date()}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors"
              />
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
    </div>
  );
}
