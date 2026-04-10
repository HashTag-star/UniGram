This is a solid legal roadmap. It covers the essentials from GDPR to Ghana’s own Data Protection Act.
---

ONLY IMPLEMENT WHAT HAVE NOT BEEN DONE ALREADY IN THE SYSTEM
## 🛡️ UniGram Compliance & Legal Governance Protocol

### **1. Core Regulatory Framework**
The agent must ensure all architectural decisions and generated content align with:
* **Ghana Data Protection Act (2012):** Primary jurisdiction.
* **GDPR (EU) & CCPA (US):** For international user data handling.
* **COPPA:** Strict "13+ only" policy to mitigate minor-related legal risks.

### **2. Data Privacy & Handling (The "Zero-Leak" Policy)**
When generating code or database schemas, the agent must:
* **Implement Rights:** Build features for "Right to Access" and "Right to be Forgotten" (Account Deletion).
* **Transparency:** Maintain a dynamic `Privacy Policy` that explicitly lists data collection (emails, school IDs, D-Ms).
* **Security Standards:** Mandate **bcrypt** for password hashing, **JWT** for secure sessions, and **HTTPS-only** configurations.

### **3. Content Moderation & Safety System**
The platform must include a "Trust & Safety" layer:
* **Reporting Workflow:** A backend service to flag/hide content for Hate Speech, Harassment, and NSFW material.
* **Automated Filters:** Use regex or AI-classification to intercept prohibited content before it hits the feed.
* **User Controls:** Implementation of "Block" and "Mute" functions is non-negotiable for launch.

### **4. Intellectual Property (IP) Shield**
To protect UniGram from third-party liability:
* **DMCA Compliance:** Create a dedicated "Copyright Takedown" endpoint/form.
* **User License:** The Terms of Service (TOS) must state: *"Users retain ownership but grant UniGram a non-exclusive license to host and display content."*

### **5. University-Specific Guardrails**
Because UniGram targets campus life, the agent must prioritize:
* **Identity Verification:** Strict `edu.gh` email domain validation to prevent external trolls.
* **Anti-Impersonation:** Logic to prevent users from claiming official university/faculty titles.

---

## 🛠️ Implementation Steps for your Agent

If you want to bake this into your app right now, you should tell your agent to perform these **three specific tasks**:

### **Task A: The "Legal Stack" Generation**
> "Agent, generate a Markdown-based **Privacy Policy**, **Terms of Service**, and **Community Guidelines** for UniGram. Ensure it mentions the Ghana Data Protection Act 2012 and a 13+ age restriction."

### **Task B: Database Schema Audit**
> "Review my current database schema. Ensure no sensitive user data is stored in plain text and verify that we have a `deleted_at` timestamp or a 'Delete Account' trigger to satisfy data deletion laws."

### **Task C: Moderation Logic**
> "Write a backend middleware function for UniGram that checks user-generated text against a list of banned keywords/categories and allows users to 'Report' a post, flagging it in the admin dashboard."

### *** How to go about them step by step**

Agent, create a /legal folder in the frontend. Create three components: PrivacyPolicy.js, TermsOfService.js, and CommunityGuidelines.js. Populate them with the provided text and ensure they are linked in the 'Sign Up' flow so users must 'Accept' them before creating an account.

📜 UniGram Legal Stack: Part 1
The Privacy Policy (Short Version for MVP)
Effective Date: April 9, 2026

1. Data We Collect

Identity Data: Full name, university email address (.edu.gh), and student ID (if used for verification).

Interaction Data: Posts, comments, likes, and messages sent within the app.

Technical Data: IP address, device type, and app usage patterns.

2. How We Use Your Data

To verify your status as a student and maintain a safe campus environment.

To provide the core UniGram social experience.

Note: We do not sell your personal data to third-party advertisers.

3. Your Rights (Ghana Data Protection Act 2012)

Access: You can request a copy of the data we hold about you.

Deletion: You can delete your account at any time, which will trigger the "Right to be Forgotten" protocol.

Correction: You can update your profile information via the app settings.

⚖️ UniGram Legal Stack: Part 2
Terms of Service (TOS)
1. Eligibility
By using UniGram, you represent that you are at least 13 years of age and a verified student or faculty member of a recognized Ghanaian university.

2. Content Ownership

Yours: You own the text and media you post.

Ours: By posting, you grant UniGram a license to host, store, and display that content so your friends can see it.

3. Prohibited Conduct
You agree not to use UniGram for:

Bullying, harassment, or "doxing" of fellow students.

Academic dishonesty (e.g., sharing exam leaks).

Impersonating university officials or faculty.

4. Termination
We reserve the right to suspend or ban accounts that violate these terms or the Community Guidelines without prior notice.

🤝 UniGram Legal Stack: Part 3
Community Guidelines
Respect the Campus: UniGram is for building community, not tearing it down. No hate speech or targeted harassment.

No "Fake News": Do not spread misinformation regarding university strikes, exam dates, or campus emergencies.

Media Safety: Strictly no non-consensual sharing of intimate images (NCII) or illegal content.



## **Phase 2**
"Agent, we are now in the Data Privacy phase. Please perform the following:

Audit Auth: Ensure we are using bcrypt for passwords and HttpOnly cookies for JWTs.

Account Deletion: Create a service that handles full account deletion to comply with the 'Right to be Forgotten.'

API Security: Add a middleware to sanitize all incoming user input to prevent SQL Injection and XSS (Cross-Site Scripting).

Privacy by Design: Ensure that by default, a user's school ID or phone number is not public-facing in any API endpoint."


🔐 Phase 2: The "Zero-Leak" Technical Protocol
To ensure UniGram is compliant with the Ghana Data Protection Act (2012), your agent needs to implement these four specific pillars:

1. The "Right to be Forgotten" (Hard Delete Logic)
Under data law, if a user clicks "Delete Account," you can't just hide their profile; you must actually scrub or anonymize their data.

Agent Instruction: "Implement a deleteUser controller that performs a cascading delete. When a user is removed, ensure their Posts, Comments, and Follower relationships are either deleted or their user_id is set to null (anonymized)."

2. Sensitive Data Encryption
You should never store passwords or sensitive IDs in plain text.

Security Standard: Use bcrypt with a salt round of 10-12.

Agent Instruction: "Ensure the User Schema uses a pre-save hook to hash passwords. Never return the password field in API responses (use .select('-password') in Mongoose or equivalent)."

3. Data Minimization
Only collect what you actually need. If UniGram doesn't need a user's home address to function, don't ask for it.

Rule: If you store Student IDs for verification, encrypt that specific field at rest or delete the image once the "Verified" badge is issued.

4. JWT & Session Security
To prevent "Session Hijacking" (where one student acts as another), you need secure tokens.

Agent Instruction: "Configure JWT (JSON Web Tokens) with an expiration (e.g., 24h) and store them in HttpOnly Cookies on the frontend to prevent XSS attacks."

🏗️ Architecture Visualization
For a university social platform, your data flow should look like this to remain "Legal-Proof":





## **Phase 4**

"Agent, we are moving to Phase 3: Content Moderation. Please implement the following:

Report Schema: Create a  schema for 'Reports' and an API to submit them.

Automated Hiding: Write logic that hides a post from the public feed if it reaches a threshold of 5 unique reports.

Block Feature: Create a 'Block' service. Ensure that if User A blocks User B, the getFeed API automatically filters out User B's content for User A.

Safety Middleware: Add a text-check function to the createPost route that prevents users from posting strictly prohibited terms."

🛡️ Phase 3: The "Campus Guard" Moderation System
Your agent needs to build a system that moves faster than you can manually check. We’ll break this into Automated and Manual layers.

1. The Reporting Workflow (Non-Negotiable)
Every post, comment, and profile must have a "Report" button. This isn't just for UI; it's a legal requirement to show you are "actively monitoring" for harm.

Database Requirement: A Reports table that tracks: reporter_id, reported_content_id, reason (Hate Speech, Harassment, etc.), and status (Pending, Reviewed, Dismissed).

Agent Instruction: "Create a reportContent API endpoint. If a piece of content gets more than [X] reports in an hour, automatically flag it for 'Soft Hide' (hidden from the feed until reviewed)."

2. Automated Keyword Filtering (The First Line of Defense)
Use a "Blacklist" or AI-classification to catch the obvious stuff.

Campus Specifics: Filter for common slurs and phrases associated with academic fraud (e.g., "paying for exam answers").

Agent Instruction: "Implement a middleware function contentFilter that runs before saving any post. Use a library like bad-words or a custom Regex to block prohibited language."

3. The "Block & Mute" Logic
To prevent harassment, users must have the power to control their own experience.

Block: User A cannot see User B’s posts, and vice versa.

Mute: User A doesn't see User B’s posts, but User B doesn't know they are muted (quieter way to handle drama).

📊 Moderation Architecture
This is how the logic should flow when a student interacts with UniGram:



## ** Phase 5 **

"Agent, we are now in Phase 4: Access Control. Please execute:

Age Gate: Update the Sign-Up form to require a Date of Birth. Block any user under 13 years old.

Domain Filter: Write a validator that only permits emails ending in '.edu.gh'.

Verification Service: Create a 'VerificationToken' schema. Implement a 6-digit OTP email flow that must be completed before the user can post content.

Consent Checkbox: Add a mandatory checkbox to the Sign-Up UI: 'I am 13 or older and I agree to the Terms of Service and Privacy Policy.'"

🚪 Phase 4: Access Control & Age Gates
1. The "13+ Policy" Implementation
Even though most university students are 18+, international laws like COPPA are very strict. If a "prodigy" student enters university at 12, you need to handle them differently.

The "Hard Stop": During sign-up, you must have a Date of Birth (DOB) picker. If the math shows they are under 13, the agent must block the account creation.

Agent Instruction: "Add a dateOfBirth field to the User schema. Create a helper function isEligibleAge(dob) that calculates age. If age < 13, return a 403 error: 'You do not meet the minimum age requirement for UniGram.'"



🛠️ Verification Logic Flow
This is how your agent should structure the "Entry" process to ensure you are legally protected:



## **Phase 6**

"Agent, we are now in Phase 5: Intellectual Property. Please execute:

Takedown Form: Create a simple 'Report Copyright Violation' option in the post-reporting menu.

Verification UI: Add a visual 'Verified' badge logic to the frontend for official university and faculty accounts to prevent impersonation.

Copyright Footer: Add a 'Copyright © 2026 UniGram. All Rights Reserved' and a link to the DMCA/Copyright policy in the app footer/settings.

Upload Disclaimer: Add a small note on the 'Create Post' screen: 'By posting, you confirm you have the rights to this content.'"


🎨 Phase 5: Intellectual Property & The DMCA Shield
To protect yourself under the Digital Millennium Copyright Act (DMCA) and similar international IP laws, your agent needs to implement the "Notice and Takedown" system.

1. The IP Ownership Clause
Your agent must ensure the app's UI and Terms clearly state who owns what.

The Rule: The user owns the content, but they give UniGram a "license" to show it.

Agent Instruction: "Update the Terms of Service to include: 'UniGram does not claim ownership of user content. By posting, you grant us a non-exclusive, royalty-free license to host and display your content strictly within the platform.'"

2. The DMCA Takedown Request Flow
If a copyright holder finds their work on UniGram, they need a formal way to tell you to remove it.

The Requirement: A simple form or a dedicated email address (legal@unigram.com) for IP complaints.

Agent Instruction: "Create a '/copyright' page that provides instructions on how to submit a Takedown Notice. It must require the complainant to provide their contact info and proof of ownership."

3. Impersonation & Brand Protection
Students often create "parody" accounts of lecturers or the VC. This can lead to defamation lawsuits.

The Guardrail: A "Verified" checkmark system (managed by you) for official university bodies.

Agent Instruction: "Create an isOfficial boolean in the User schema. Ensure that only accounts with isOfficial: true can use the University's official logo as a profile picture."

🛠️ The "Safe Harbor" Workflow
This is how your agent should handle a copyright claim to keep you legally safe:



## **Pase 7 for later**


"Agent, note for Phase 6: We will eventually implement monetization. Please ensure:

Audit Logs: Any future financial data must be stored in a separate, secure table.

Regional Compliance: All prices must be displayed in GHS by default, with clear VAT/tax breakdowns.

Ad Labeling: Build the Post UI with a conditional 'Sponsored' tag to ensure transparency.

Payment Webhooks: Keep the backend modular so we can plug in the Paystack API when we are ready to go live with payments."

Final Polish for your Agent
We’ve covered:

Legal Stack (Docs)

Data Privacy (Encryption/Deletion)

Moderation (Reporting/Blocking)

Verification (.edu.gh/Age)

IP Shield (Copyright)

Monetization (Future-proofing)


💰 Phase 6: Monetization & Payment Readiness
To prepare UniGram for future revenue (ads, campus marketplace, or "Premium" student features), your agent needs to build with these hooks in place:

1. The "Wallet" or "Transaction" Schema
Even if you aren't charging yet, your database should be ready to track value.

The Logic: A Transactions table that records who paid, how much, and what for (e.g., "Event Ticket," "Promoted Post").

Agent Instruction: "Design a scalable Transaction schema. Include fields for transaction_id, status (pending/success/failed), amount, and currency (default to GHS)."

2. Payment Gateway Integration (Paystack/Flutterwave)
In Ghana, Mobile Money (MoMo) is king. You’ll need to integrate with providers that handle MoMo and local cards.

Legal Requirement: You must show clear pricing and a "Refund Policy" before a user pays.

Agent Instruction: "Prepare a payment.controller that will eventually handle webhooks from Paystack. Ensure all financial logs are immutable (cannot be edited or deleted) for audit purposes."

3. Ad Transparency & Sponsored Content
If you allow students or businesses to "Boost" posts:

The Rule: You must clearly label them as "Sponsored" or "Ad". Hiding ads as organic posts is a violation of consumer protection laws.

Agent Instruction: "Add an isSponsored boolean to the Post model. If true, the frontend must display a 'Sponsored' badge on the post."

🛠️ The Future Payment Flow
This is how your agent will eventually bridge the gap between "Social Vibe" and "Business":

