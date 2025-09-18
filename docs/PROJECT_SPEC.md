# Project Specification: Patient Information Dashboard

## 1. Overview

A simple web application to manage patient information and track events. The application will consist of two main pages: a patient submission form and a log viewer.

## 2. Tech Stack

*   **Framework:** Next.js
*   **Language:** TypeScript
*   **UI Library:** React
*   **Styling:** Tailwind CSS
*   **Database:** Convex.dev
*   **Authentication:** Logto

## 3. Core Features

### 3.1. User Authentication

*   Users must be logged in to access the application.
*   Authentication will be handled by Logto.

### 3.2. Patient Submission Form

*   A dedicated page with a form to submit patient information.
*   The form will collect necessary patient details (e.g., name, phone number, etc.).
*   Upon submission, the form will trigger a webhook. This webhook will handle backend automation, such as sending an SMS to the patient.

### 3.3. Webhook and Landing Pages

*   The SMS messages sent to patients will contain unique links.
*   These links will lead to simple landing pages within this web application.
*   When a patient interacts with a landing page (e.g., clicks a button to confirm they are late), the landing page will be responsible for writing the corresponding event to the logs database.

### 3.4. Logs View

*   A dedicated page to display a log of events.
*   The logs will be displayed in a table with three columns:
    *   **Timestamp:** When the event occurred.
    *   **Event:** A description of what happened (e.g., "Patient will be 15 minutes late").
    *   **Patient:** The patient associated with the event.
*   This view will be updated in real-time or near real-time as new events occur.

## 4. Example Workflow

1.  A user of the dashboard logs into the application.
2.  The user navigates to the patient submission form.
3.  The user fills out and submits the information for "Patient A".
4.  A webhook is called, and an SMS is sent to Patient A with a link to a landing page.
5.  Patient A clicks the link in the SMS and is taken to a landing page where they can select an option (e.g., "I will be 15 minutes late").
6.  Patient A clicks the button for being 15 minutes late.
7.  The landing page writes a new entry to the logs database.
8.  The logs view on the dashboard updates to show the new entry:
    *   **Timestamp:** (current time)
    *   **Event:** "Patient will be 15 minutes late"
    *   **Patient:** "Patient A"
