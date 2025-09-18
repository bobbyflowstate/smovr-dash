# Task Spec: Initial Project Setup

## 1. Task

Initialize the Next.js project and set up the core integrations.

## 2. Objective

To create a foundational, runnable Next.js application with all the necessary dependencies and configurations for styling, database, and authentication. This will serve as the starting point for feature development.

## 3. Key Steps

1.  **Initialize Next.js Project:**
    *   Use `create-next-app` to bootstrap a new Next.js application with TypeScript.

2.  **Integrate Tailwind CSS:**
    *   Add and configure Tailwind CSS for styling according to the official Next.js integration guide.

3.  **Set up Convex:**
    *   Install the Convex client library.
    *   Initialize Convex in the project to connect to the database backend.
    *   Define the initial database schema for `logs`.

4.  **Set up Logto:**
    *   Install the Logto Next.js SDK.
    *   Configure Logto for authentication, including setting up the necessary environment variables.

5.  **Create Basic Page Structure:**
    *   Create placeholder pages for the two main routes:
        *   `/app/submit/page.tsx` (for the patient submission form)
        *   `/app/logs/page.tsx` (for the logs view)

## 4. Deliverables

*   A new Next.js project in the repository.
*   The project should be runnable with `npm run dev`.
*   Tailwind CSS, Convex, and Logto should be installed and configured.
*   Basic placeholder pages for `submit` and `logs` should exist.
