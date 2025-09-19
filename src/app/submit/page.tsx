"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";
import "react-phone-number-input/style.css";

export default function SubmitPage() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState<string | undefined>("");
  const [notes, setNotes] = useState("");
  const [appointmentDateTime, setAppointmentDateTime] = useState<Date | null>(
    new Date()
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const scheduleAppointment = useMutation(api.patients.scheduleAppointment);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");

    if (!name || !phone || !appointmentDateTime) {
      setError("Name, phone number, and appointment date/time are required.");
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
      const result = await scheduleAppointment({
        name,
        phone,
        notes,
        appointmentDateTime: appointmentDateTime.toISOString(),
      });

      if (result.newAppointment) {
        setSuccessMessage("New appointment scheduled successfully!");
        setName("");
        setPhone("");
        setNotes("");
        setAppointmentDateTime(new Date());
      } else {
        setError("This appointment already exists for this patient.");
      }
    } catch (err) {
      setError("Failed to schedule appointment. Please try again.");
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-4">Patient Submission Form</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium text-gray-700"
          >
            Name
          </label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            required
          />
        </div>
        <div>
          <label
            htmlFor="phone"
            className="block text-sm font-medium text-gray-700"
          >
            Phone Number
          </label>
          <PhoneInput
            id="phone"
            placeholder="Enter phone number"
            value={phone}
            onChange={setPhone}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            defaultCountry="US"
          />
        </div>
        <div>
          <label
            htmlFor="appointmentDateTime"
            className="block text-sm font-medium text-gray-700"
          >
            Appointment Date & Time
          </label>
          <DatePicker
            id="appointmentDateTime"
            selected={appointmentDateTime}
            onChange={(date) => setAppointmentDateTime(date)}
            showTimeSelect
            dateFormat="Pp"
            minDate={new Date()}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          />
        </div>
        <div>
          <label
            htmlFor="notes"
            className="block text-sm font-medium text-gray-700"
          >
            Notes (Optional)
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          />
        </div>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        {successMessage && (
          <p className="text-green-500 text-sm">
            {successMessage}
          </p>
        )}
        <div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {isSubmitting ? "Submitting..." : "Submit"}
          </button>
        </div>
      </form>
    </div>
  );
}

