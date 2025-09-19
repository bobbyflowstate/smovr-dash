# Task Spec: Create Appointments Page

## 1. Task

Create a new page to display a list of all upcoming appointments.

## 2. Objective

To provide users with a clear, organized, and searchable view of all scheduled appointments, allowing them to quickly find the information they need.

## 3. UX/UI Design

*   **Layout:** A clean and simple list or table view.
*   **Default Sort Order:** Appointments should be sorted by date and time, with the soonest appointments appearing first.
*   **Key Information:** Each item in the list should clearly display:
    *   Patient Name
    *   Patient Phone Number
    *   Appointment Date & Time
    *   Appointment Notes (if any)
*   **Search/Filter:** A prominent search bar at the top of the page should allow users to filter the list by patient name or phone number in real-time.
*   **Actions:** Each appointment should have placeholder buttons for "Cancel" and "Reschedule" actions. These will not be functional in this task but will be part of the UI.

## 4. Key Steps

1.  **Create New Page:**
    *   Create a new page component at `src/app/appointments/page.tsx`.
    *   Add a link to this new page in the `Header` component.

2.  **Create Convex Query:**
    *   In a new file, `convex/appointments.ts`, create a Convex query to fetch all appointments.
    *   The query should be structured to also retrieve the associated patient information (name and phone number) for each appointment. This will likely involve querying the `appointments` table and then, for each appointment, fetching the corresponding patient from the `patients` table.

3.  **Build the Appointments List UI:**
    *   In the `AppointmentsPage` component, use the `useQuery` hook from Convex to fetch the appointment data.
    *   Render the appointments in a table or a list, styled with Tailwind CSS.
    *   The table should have columns for Patient Name, Patient Phone, Appointment Date & Time, and Notes.

4.  **Implement Search Functionality:**
    *   Add a search input field to the page.
    *   Implement client-side filtering logic to filter the displayed appointments based on the search query (matching against patient name or phone number).

5.  **Add Action Placeholders:**
    *   For each appointment in the list, add placeholder buttons for "Cancel" and "Reschedule".

## 5. Deliverables

*   A new, functional page at the `/appointments` route.
*   An updated `Header` component with a link to the new page.
*   A new Convex query for fetching appointments with patient data.
*   A searchable and sortable view of all upcoming appointments.
