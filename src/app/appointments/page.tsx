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
    <div ref={pageRef}>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Upcoming Appointments</h1>
        <Link href="/submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-full">
            +
        </Link>
      </div>
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by name or phone..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
        />
      </div>

      {appointments === undefined && <p>Loading appointments...</p>}
      
      {groupedAppointments && Object.keys(groupedAppointments).length > 0 ? (
        Object.entries(groupedAppointments).map(([date, appointmentsForDay]) => (
          <div key={date} className="mb-8">
            <h2 className="text-lg font-bold mb-2 border-b pb-2">{date}</h2>
            <div className="hidden md:block">
              <table className="min-w-full">
                <thead className="border-b">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Patient</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
                    <th className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {appointmentsForDay.map((appointment) => (
                    <tr key={appointment._id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{format(new Date(appointment.dateTime), "p")}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div>{appointment.patient?.name}</div>
                        <div>{appointment.patient?.phone}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{appointment.notes}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleCancelClick(appointment._id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          {cancelConfirmationId === appointment._id ? "Are you sure?" : "Cancel"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="md:hidden space-y-4">
              {appointmentsForDay.map((appointment) => (
                <div key={appointment._id} className="bg-white p-4 rounded-lg shadow">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{appointment.patient?.name}</p>
                      <p className="text-sm text-gray-500">{appointment.patient?.phone}</p>
                    </div>
                    <p className="text-sm font-medium text-gray-900">{format(new Date(appointment.dateTime), "p")}</p>
                  </div>
                  {appointment.notes && <p className="mt-2 text-sm text-gray-500">{appointment.notes}</p>}
                  <div className="mt-4 text-right">
                    <button
                      onClick={() => handleCancelClick(appointment._id)}
                      className="text-red-600 hover:text-red-900"
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
        appointments && <p>No appointments found.</p>
      )}
    </div>
  );
}
