# Supabase contact form setup

The contact form uses Supabase Auth, a private Supabase Storage bucket, and a private Postgres table. Website visitors receive an anonymous Supabase session; row-level security restricts writes and uploads to that session's own folder. Visitor reads and public file URLs are disabled. After saving a submission, the `email-contact-submission` Edge Function emails its enquiry details and any uploaded files to `shivapandey232000@gmail.com`.

## Project details

The free `DwarkaManagement` project is already created in the `Shiplane` organization in the Mumbai region (`ap-south-1`). Its URL and public publishable key are configured locally in `public/supabase-config.js`.

## Finish the project setup

1. In **Authentication → Providers**, enable **Anonymous Sign-ins**. Add the live website origin to the Auth URL configuration if Supabase requests it.
2. Run `supabase/setup.sql` in **SQL Editor**. It creates the private bucket, contact table, upload restrictions, and row-level security policies. The bucket remains private; do not enable public access.
3. The public publishable key is already in `public/supabase-config.js`. It is designed for browser use with RLS. Never put a `service_role` or secret key in website code.

## Review and deploy

The Supabase dashboard is the staff-only place to review enquiry rows and files. Website visitors cannot list or download stored files. The project stays within the Free plan only while usage remains within its quotas; free projects may pause after inactivity. Supabase recommends CAPTCHA to reduce abuse of anonymous sign-ins; configure this before collecting real identity documents. Apply a retention schedule with your compliance adviser and delete documents when they are no longer needed.

After adding the project URL and publishable key, deploy the website with `firebase deploy --only hosting`. Do not deploy the old Firebase Functions code for this form. Before collecting real identity documents, add a CAPTCHA/abuse check and confirm the organization's privacy, identity-document, retention, and electronic-approval requirements.

## Email delivery setup

1. Create or sign in to a Resend account using `shivapandey232000@gmail.com` and create an API key. Do not paste the key into the website or this repository.
2. In Supabase **Edge Functions → Secrets**, add `RESEND_API_KEY` with that key, then deploy `supabase/functions/email-contact-submission/index.ts` as `email-contact-submission`.
3. Run the updated `supabase/setup.sql` in SQL Editor to add the email delivery status fields.
4. The function uses Resend's `onboarding@resend.dev` sender by default. That test sender can only send to the email address associated with the Resend account. For normal production use, verify a domain you control in Resend, then set `RESEND_FROM_EMAIL` to an address on that verified domain.
5. Submit a clearly labeled dummy enquiry and verify the email, details, attachments, and signature. Do not test with real customer identity documents.

The email includes the user's name, email, phone, company, message, consent, approval wording, timestamp, and reference. Legal documents and front/back ID images are attachments; a drawn signature is attached, while a typed signature is included as text. These copies are sent through the email provider and retained according to the mail providers' policies. The table tracks pending/sent/failed delivery without making submissions or stored files publicly readable.
