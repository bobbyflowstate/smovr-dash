# SMOVR Pro Features — Release Summary

## Overview

This release adds eight new capabilities to the SMOVR dashboard, all focused on automating patient communication, reducing no-shows, and giving clinics more control over how they interact with patients via text. Every feature respects the team's language preference and works within existing HIPAA guidelines.

---

## 1. Team Settings Page

**What it does:** A new **Settings** page (accessible from the top navigation bar) where staff can manage all team-level configuration in one place.

**What you can configure:**

| Setting | Description |
|---|---|
| Team Name | The name shown in messages and on patient-facing pages |
| Contact Phone | The clinic's main phone number |
| Timezone | Used for scheduling reminders at appropriate local times |
| Office Address | Included in appointment confirmation and reminder messages |
| Language Mode | Controls whether messages go out in English only or English + Spanish (see Feature 2) |
| Custom Scheduling URL | An optional external booking link that overrides the built-in SMOVR booking page (see Feature 3) |
| Entry Slug | A short identifier used to generate the clinic's website button URL (see Feature 8) |

**How to use it:** Click **Settings** in the top navigation. Edit any fields and click **Save Settings**.

---

## 2. Language Toggle

**What it does:** All automated text messages — appointment confirmations, cancellations, reminders, birthday greetings, reactivation messages, and more — now respect a per-team language setting.

**Two modes:**

- **English only** — Messages go out in English
- **English + Spanish** — Messages go out bilingual (English first, then Spanish), which is the default and matches the system's previous behavior

**How to use it:** Go to **Settings > Messaging > Language Mode** and select the desired option. The change takes effect immediately for all future messages.

**Built to scale:** The underlying system is designed as a locale registry. Adding new languages (Portuguese, Vietnamese, etc.) in the future requires adding translations to a single configuration file — no re-engineering needed.

---

## 3. Configurable Scheduling Link + Patient Booking Page

This feature has two parts:

### 3a. Built-in Booking Page

**What it does:** SMOVR now hosts a patient-facing booking page at `/book/[your-slug]`. When a patient visits this page, they see a simple form asking for their name, phone number, and optional notes. On submission:

1. The patient is created (or matched to an existing record by phone number)
2. A scheduling request is logged in the dashboard
3. A confirmation text is sent to the patient
4. The request appears in the **Requests** page for staff to review

**How to use it:** Share the URL with patients directly, or include it in text messages. Staff can view and manage all incoming requests from the **Requests** link in the top navigation. Each request can be marked as "Scheduled" or "Dismissed."

### 3b. Custom Scheduling URL Override

**What it does:** If your clinic already uses an external booking system (e.g., Zocdoc, Calendly), you can paste that URL into **Settings > Scheduling > Custom Scheduling URL**. When set, every automated message that includes a scheduling link will point to your external system instead of the SMOVR booking page.

**Fallback rule:** If the Custom Scheduling URL is empty, SMOVR defaults to its own built-in booking page.

### Anti-abuse protections

The public booking page includes multiple layers of protection against spam:

- **Rate limiting per IP address** — No more than 10 submissions per minute from a single source
- **Rate limiting per phone number** — No more than 3 requests per phone/team within a 1-hour window
- **Bot detection** — A hidden field catches automated form submissions

---

## 4. Birthday Reminders

**What it does:** Patients with a birthday on file automatically receive a birthday greeting via text. The message is warm and simple — no clinical content.

**Example message (English):**
> Hello Sarah, happy birthday from everyone at our office. We wish you a great day.

**How it works:**

- Runs once daily (around 9 AM Eastern / 7 AM Pacific)
- Checks each patient's birthday (stored as month + day only — no full date of birth is collected or stored)
- Sends the greeting only once per year per patient (won't double-send)
- Respects quiet hours and team language mode

**How to use it:** When adding or editing a patient in the **Patients** page, set their birthday using the month/day picker. That's it — the rest is automatic.

---

## 5. Future Appointment Reminders (Return Date)

**What it does:** Staff can set a "Recommended Return Date" on any patient record. The system then sends two automated reminders as that date approaches:

1. **30 days before** — A reminder encouraging the patient to schedule their next visit, with a link to book
2. **7 days before** — A second reminder, but **only if** the patient does not already have a future appointment on or after the return date

**Example message (English):**
> Hello Sarah, it may be time to schedule your next visit. Please click the link to book an appointment: [link]

**How it works:**

- Runs once daily (around 10 AM Eastern / 8 AM Pacific)
- Each reminder is sent at most once (idempotent)
- The 7-day reminder is "smart" — it checks the appointment book first, so patients who have already scheduled won't get nagged
- The link in the message uses the team's custom scheduling URL if one is set, otherwise the SMOVR booking page

**How to use it:** On the **Patients** page, open any patient and set the "Recommended Return Date" field. Clear it anytime to stop reminders.

---

## 6. Referral Follow-Up

**What it does:** When a clinic refers a patient to another provider, staff can log the referral in SMOVR. The system sends a follow-up text asking the patient whether they've scheduled the referred appointment. The patient can respond via a simple web page — no app download or login needed.

**HIPAA safeguards:** The text message and the patient-facing status page are intentionally generic. They mention "the appointment we discussed" without naming the referral provider, address, or any clinical details. All referral specifics (provider name, address, phone, notes) are visible **only to staff in the dashboard**.

**Patient experience:**

1. Patient receives a text: *"Hi Sarah, just checking in about the appointment we discussed. Please click the link below to let us know your status."*
2. Patient clicks the link and sees two large buttons:
   - **YES, I scheduled the appointment**
   - **NEED HELP, I still need help scheduling**
3. Their response is recorded and visible to staff in the patient's record

**How it works:**

- Staff adds a referral from the patient detail view (click a patient, scroll to the Referrals section)
- A follow-up delay can be set (e.g., send the follow-up 60 minutes after creation, or immediately)
- Referral status is tracked: **Pending**, **Confirmed**, or **Needs Help**
- All status changes are timestamped and logged

**How to use it:** Open any patient from the **Patients** page. In the Referrals section, click **Add Referral**, fill in the details, and set a follow-up delay. The system handles the rest.

---

## 7. Lapsed Patient Reactivation

**What it does:** Staff can select patients from the patient list and send them a "we miss you" reactivation text with a link to schedule a visit.

**Example message (English):**
> Hi Sarah, we have not seen you in a while and just wanted to check in. If you would like to schedule a visit, you can do that here: [link]

**How to use it:**

1. Go to the **Patients** page
2. Use the checkboxes on the left side of the patient list to select one or more patients (there's also a "select all" checkbox in the header)
3. A blue action bar appears at the bottom of the screen showing how many patients are selected
4. Click **Send Reactivation Message**
5. A confirmation dialog appears — review the count and confirm
6. After sending, a results screen shows how many messages were sent vs. failed

**Safeguards:**

- Batch limit of 100 patients per send to prevent accidental mass messages
- Confirmation dialog requires explicit approval before any messages go out
- Each sent message is logged in the patient's conversation history and in the audit log

---

## 8. Website Button Entry

**What it does:** Gives clinics a URL they can place behind any button on their existing website. When a visitor clicks the button and fills out the simple form (name + phone), SMOVR:

1. Creates (or matches) the visitor as a patient
2. Sends them a first-contact text: *"Hello, thanks for reaching out! How can we help you today?"*
3. Creates a scheduling request visible in the **Requests** dashboard
4. The conversation continues in the **Messages** view — staff can reply normally

**How to use it:**

1. Go to **Settings** and set an **Entry Slug** (e.g., `my-clinic`)
2. The system generates your Entry URL (e.g., `https://app.smovr.com/entry/my-clinic`)
3. Click the **Copy** button next to the URL
4. Share that URL with your web developer to place behind a "Contact Us" or "Text Us" button on your website

**Patient experience:** The visitor sees a clean, branded page with two fields (name and phone), clicks "Start Text Conversation," and gets a confirmation screen saying they'll receive a text shortly. From there, it's a normal SMOVR text conversation.

---

## Dashboard Navigation (Updated)

The top navigation bar now includes these links:

| Link | Purpose |
|---|---|
| Appointments | View and manage scheduled appointments |
| Submit | Submit new appointments |
| Patients | Manage patient records, birthdays, return dates, referrals, and reactivation |
| Messages | Two-way text conversations with patients |
| Requests | View and resolve scheduling requests from booking pages and website buttons |
| Audit Logs | Activity log for compliance and troubleshooting |
| Settings | Team configuration (language, scheduling links, website entry, etc.) |

---

## Automated Schedules (Background Jobs)

These run automatically and require no manual intervention:

| Job | Frequency | What it does |
|---|---|---|
| Appointment reminders (24h + 1h) | Every minute | Sends reminder texts before upcoming appointments |
| Birthday reminders | Daily ~9 AM ET | Sends birthday greetings to patients with a birthday today |
| Return date reminders | Daily ~10 AM ET | Sends 30-day and 7-day reminders for recommended return dates |
| Referral follow-ups | Every 5 minutes | Sends follow-up texts for referrals past their configured delay |

All automated messages respect quiet hours and will not double-send.

---

## Switching Back to Cloud (for the dev team)

The local development environment has been configured. To switch back to the cloud Convex deployment, edit `.env.local` and uncomment the cloud lines while commenting out the two local lines. The file has comments indicating which is which.
