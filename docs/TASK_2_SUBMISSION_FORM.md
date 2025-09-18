# Task Spec: Implement Patient Submission Form

## 1. Task

Build the patient submission form, a global header and footer, and the backend logic to handle the form submission.

## 2. Objective

To create a functional form that captures patient data, stores it in the Convex database, and prepares for the webhook integration, all within a consistent and navigable app layout.

## 3. Key Steps

1.  **Create Header and Footer Components:**
    *   Create a new `Header` component that includes the application title/logo, navigation links to the "Submit" and "Logs" pages, and a user profile section with a "Logout" button.
    *   Create a new `Footer` component with basic information (e.g., copyright).
    *   Integrate these components into the root layout file (`src/app/layout.tsx`) so they appear on all pages.
    *   Style the header and footer using Tailwind CSS.

2.  **Define Patient Schema:**
    *   In `convex/schema.ts`, define a new table for `patients` with fields for the patient's information (e.g., `name`, `phone`, etc.).

3.  **Build the Form UI:**
    *   In `src/app/submit/page.tsx`, create a React component for the patient submission form.
    *   The form should include input fields for the patient's details.
    *   Style the form using Tailwind CSS to ensure it is clean and user-friendly.

4.  **Create Convex Mutation:**
    *   Create a new file in the `convex` directory for patient-related functions.
    *   Write a Convex mutation that takes the patient's information as arguments and creates a new document in the `patients` table.

5.  **Implement Form Submission Logic:**
    *   In the `SubmitPage` component, use the `useMutation` hook from Convex to call the new mutation.
    *   Implement an `onSubmit` handler for the form that calls the mutation with the form data.

6.  **Add Form Validation:**
    *   Implement basic client-side validation to ensure that required fields are filled out before submission.

7.  **Webhook Placeholder:**
    *   After successfully submitting the form and saving the data, log a message to the console indicating that the webhook would be triggered. This will serve as a placeholder for the actual webhook implementation.

## 4. Deliverables

*   Reusable `Header` and `Footer` components integrated into the main layout.
*   An updated `convex/schema.ts` with the `patients` table.
*   A new Convex mutation for creating a patient.
*   A functional and styled patient submission form at the `/submit` route.
*   Client-side logic for form handling, validation, and submission to Convex.
