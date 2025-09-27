"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { format } from "date-fns";
import Link from "next/link";
import { Id } from "../../../convex/_generated/dataModel";

export default function AppointmentsPage() {
  const appointments = useQuery(api.appointments.get);
  const cancelAppointment = useMutation(api.appointments.cancel);
  const [searchQuery, setSearchQuery] = useState("");
  const [cancelConfirmationId, setCancelConfirmationId] = useState<Id<"appointments"> | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pageRef.current && !pageRef.current.contains(event.target as Node)) {
        setCancelConfirmationId(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [pageRef]);

  const filteredAppointments = appointments
    ?.filter((appointment) => {
      const patientName = appointment.patient?.name.toLowerCase() || "";
      const patientPhone = appointment.patient?.phone || "";
      const query = searchQuery.toLowerCase();
      return patientName.includes(query) || patientPhone.includes(query);
    })
    .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());

  const groupedAppointments = filteredAppointments?.reduce((acc, appointment) => {
    const date = format(new Date(appointment.dateTime), "PPPP");
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(appointment);
    return acc;
  }, {} as Record<string, typeof filteredAppointments>);

  const handleCancelClick = (appointmentId: Id<"appointments">) => {
    if (cancelConfirmationId === appointmentId) {
      cancelAppointment({ id: appointmentId });
      setCancelConfirmationId(null);
    } else {
      setCancelConfirmationId(appointmentId);
    }
  };

  return (
    <div ref={pageRef} className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 transition-colors">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Upcoming Appointments</h1>
          <Link 
            href="/submit" 
            className="inline-flex items-center justify-center w-12 h-12 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-white dark:focus:ring-offset-gray-800"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
          </Link>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 transition-colors">
        <input
          type="text"
          placeholder="Search by name or phone..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors"
        />
      </div>

      {/* Loading State */}
      {appointments === undefined && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center transition-colors">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading appointments...</p>
        </div>
      )}
      
      {/* Appointments */}
      {groupedAppointments && Object.keys(groupedAppointments).length > 0 ? (
        Object.entries(groupedAppointments).map(([date, appointmentsForDay]) => (
          <div key={date} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 transition-colors overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{date}</h2>
            </div>
            
            {/* Desktop Table View */}
            <div className="hidden md:block">
              <table className="min-w-full">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Time</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Patient</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Notes</th>
                    <th className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {appointmentsForDay.map((appointment) => (
                    <tr key={appointment._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                        {format(new Date(appointment.dateTime), "p")}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                        <div className="font-medium">{appointment.patient?.name}</div>
                        <div className="text-gray-500 dark:text-gray-400">{appointment.patient?.phone}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300 max-w-xs truncate">
                        {appointment.notes || "—"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleCancelClick(appointment._id)}
                          className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 font-medium transition-colors"
                        >
                          {cancelConfirmationId === appointment._id ? "Are you sure?" : "Cancel"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Mobile Card View */}
            <div className="md:hidden p-4 space-y-4">
              {appointmentsForDay.map((appointment) => (
                <div key={appointment._id} className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg transition-colors">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{appointment.patient?.name}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{appointment.patient?.phone}</p>
                    </div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {format(new Date(appointment.dateTime), "p")}
                    </p>
                  </div>
                  {appointment.notes && (
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{appointment.notes}</p>
                  )}
                  <div className="mt-4 text-right">
                    <button
                      onClick={() => handleCancelClick(appointment._id)}
                      className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 font-medium transition-colors"
                    >
                      {cancelConfirmationId === appointment._id ? "Are you sure?" : "Cancel"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      ) : (
        appointments && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center transition-colors">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-gray-600 dark:text-gray-400">No appointments found.</p>
            <Link 
              href="/submit"
              className="inline-block mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Schedule First Appointment
            </Link>
          </div>
        )
      )}
    </div>
  );
}
