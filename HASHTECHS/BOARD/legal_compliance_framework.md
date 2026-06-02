# UNIGRAM LEGAL COMPLIANCE FRAMEWORK
## Authored by Akosua Frimpong, Chief Legal Counsel
## Hashtechs Advisory Board

---

**Document Reference:** HAB/LCF/2026
**Date:** 25 May 2026
**Author:** Akosua Frimpong, Chief Legal Counsel, Hashtechs Advisory Board
**Classification:** Confidential — CEO Distribution Only

---

## PREFATORY NOTE

This framework is not a substitute for qualified legal advice. It is a practical compliance guide prepared to equip the CEO of Hashtechs with the knowledge needed to navigate the key legal obligations that apply to UniGram before and after launch. Every item in this document is actionable. I recommend that the CEO work through this framework section by section and seek independent legal counsel — particularly a Ghanaian data protection specialist — for any items requiring formal legal instruments.

*— Akosua Frimpong*

---

## SECTION 1: GHANA DATA PROTECTION ACT 2023

### Overview

Ghana enacted the Data Protection Act, 2023 (referred to here as "DPA 2023") to modernise the country's data protection regime in alignment with international standards, including the EU's General Data Protection Regulation (GDPR) and the African Union Convention on Cyber Security and Personal Data Protection (the Malabo Convention). UniGram, as a platform that collects and processes the personal data of Ghanaian residents, is a Data Controller under this Act and carries binding legal obligations.

### Key Obligations for UniGram

**1.1 Registration with the Data Protection Commission (DPC)**
UniGram must register as a Data Controller with the Data Protection Commission of Ghana before processing any personal data. This is a legal requirement, not discretionary. The registration process involves submitting details of the data you collect, how you process it, where it is stored, and for how long. Failure to register exposes Hashtechs to regulatory fines and enforcement action.

**Action:** Register at dpc.gov.gh before the app's public launch.

**1.2 Lawful Basis for Processing**
Every category of personal data that UniGram collects must have a documented lawful basis. For a social app, the primary basis will be **consent** (the user's explicit, informed agreement at sign-up) and **contract performance** (data needed to deliver the service the user signed up for). Data collected beyond those categories — analytics, behavioural tracking, advertising signals — requires separate consent and must be disclosed.

**1.3 Data Minimisation**
UniGram must not collect data it does not need. If a university email address is sufficient to verify a student, requiring national ID numbers or home addresses would be disproportionate and unlawful. Every data field in the app's sign-up and profile flows should be reviewed against the question: "Do we genuinely need this to deliver the service?"

**1.4 Data Subject Rights**
Users have the right to:
- Access their personal data (Right of Access)
- Correct inaccurate data (Right to Rectification)
- Delete their data (Right to Erasure — "right to be forgotten")
- Object to processing for direct marketing
- Data portability (receive their data in a machine-readable format)

UniGram must build mechanisms — within the app or via an accessible process — to honour these requests within 30 days.

**1.5 Data Breach Notification**
In the event of a data breach that poses a risk to users' rights and freedoms, UniGram must notify the Data Protection Commission without undue delay and, where the breach is high-risk, notify affected users directly. A breach response plan must be documented before launch.

**1.6 Data Retention**
Personal data must not be retained longer than necessary. Inactive accounts (e.g., no login in 12 months) should be subject to a documented deletion or archiving policy. This policy must be stated in the Privacy Policy.

*— Akosua Frimpong*

---

## SECTION 2: APP STORE AND GOOGLE PLAY POLICY REQUIREMENTS

### 2.1 Apple App Store — Key Requirements for Social Apps

Apple's App Store Review Guidelines (Section 1.2 — User Generated Content; Section 5.1 — Privacy) impose the following on apps like UniGram:

- **Privacy Nutrition Labels:** UniGram must accurately complete Apple's privacy questionnaire during app submission, disclosing every category of data collected and its purpose (analytics, personalisation, third-party advertising, etc.). Inaccurate labels are grounds for rejection or removal.
- **User-Generated Content Moderation:** Apps with UGC must include a mechanism for users to report offensive content, a process to review and act on those reports, and the ability to block other users. Apple will reject apps that lack these features.
- **Privacy Policy URL:** A publicly accessible privacy policy URL must be submitted with the app listing. This URL must work and the policy must be genuinely compliant.
- **Data Deletion:** As of 2024, Apple requires that apps with user accounts must offer an in-app account deletion mechanism. This is not optional. UniGram must include a "Delete My Account" flow that removes the user's data from Supabase (not just marks it inactive).
- **Age Rating:** UniGram should be rated 12+ or 17+ depending on content moderation capabilities. Given the university demographic (18+), a 17+ rating with appropriate content descriptors is recommended to avoid overly restrictive parental controls.

### 2.2 Google Play — Key Requirements for Social Apps

Google Play's Developer Policy Center and its Data Safety section impose:

- **Data Safety Form:** Google requires completion of a Data Safety section disclosing what data is collected, whether it is shared with third parties, whether it is encrypted in transit, and whether users can request deletion. This information is displayed on the app's Play Store listing.
- **Prominent Disclosure:** Any data collection that users might not expect must be disclosed prominently before collection — not buried in a privacy policy.
- **Sensitive Permissions:** If UniGram requests location, camera, microphone, or contacts access, each must be justified. Requesting permissions at app startup without explanation is a rejection trigger.
- **Account Deletion:** Since December 2023, Google Play mandates that apps with account creation must offer users the ability to delete their account and associated data, either in-app or via a readily accessible web URL.
- **User-Generated Content Policy:** Google requires that apps with UGC have a published content policy and an effective reporting and moderation system.

*— Akosua Frimpong*

---

## SECTION 3: PRIVACY POLICY — REQUIRED CONTENT CHECKLIST

A Privacy Policy for UniGram must address all of the following to satisfy both the DPA 2023 and app store requirements. The following is a drafting checklist:

- [ ] **Identity of the Data Controller** — Full legal name of Hashtechs, registered address, and contact email (a dedicated privacy@hashtechs.com address is recommended)
- [ ] **What data is collected** — Exhaustive list: name, email, university, profile photo, posts, messages, device identifiers, IP address, usage analytics
- [ ] **Why data is collected** — Purpose for each category (account creation, app functionality, analytics, etc.)
- [ ] **Legal basis for processing** — Consent, contract, legitimate interest (per DPA 2023)
- [ ] **How data is stored and secured** — Supabase (specify region — see Section 6), encryption in transit (TLS), encryption at rest
- [ ] **Data sharing** — Who else receives the data: Supabase (infrastructure provider), any analytics tools (e.g., Expo analytics, Sentry), any future advertising partners
- [ ] **Retention periods** — How long each data category is kept
- [ ] **User rights** — How to exercise access, rectification, erasure, portability rights; contact method; response time (30 days)
- [ ] **Cookies and tracking** — Whether the app uses any tracking technologies
- [ ] **Data transfers outside Ghana** — If Supabase stores data outside Ghana, this must be disclosed and justified
- [ ] **Children and minors** — Statement that the app is for users 18 and above; what happens if a minor is discovered to have an account
- [ ] **Changes to the policy** — How users will be notified of updates
- [ ] **Contact information** — A real email address for privacy queries
- [ ] **Effective date** — The date the policy came into force
- [ ] **Governing law** — Laws of Ghana

*— Akosua Frimpong*

---

## SECTION 4: AGE VERIFICATION AND MINOR PROTECTION

### The University Context

UniGram's intended user base is university students. In Ghana, university admission typically requires completion of WASSCE or equivalent, placing the minimum entry age at approximately 17–18 years. However, some students — particularly in private universities or accelerated programmes — may be younger. The law does not automatically protect a platform simply because its intended audience is adults.

### Requirements

**4.1 Stated Age Minimum**
The Terms of Service and Privacy Policy must explicitly state that UniGram is available only to users aged 18 and above. The app's sign-up flow must include an age gate — a date-of-birth field or a checkbox confirming the user is 18 or older.

**4.2 University Email Verification**
Requiring a valid university email address (.edu.gh or institutional equivalents) as part of registration serves a dual purpose: it verifies university affiliation and serves as a practical proxy for minimum age. This is recommended as a Phase 1 feature.

**4.3 Handling Discovered Minors**
If a user is found or reported to be under 18, UniGram's policy must require immediate account suspension, data deletion within 30 days, and no retention of the minor's personal information beyond what is necessary for the deletion process.

**4.4 Children's Online Safety**
While Ghana does not yet have a standalone children's online safety statute equivalent to the UK's Age Appropriate Design Code (AADC), the DPA 2023 and general principles of data minimisation and consent require heightened protection for minors. Compliance with the spirit of these protections is both legally prudent and brand-protective.

*— Akosua Frimpong*

---

## SECTION 5: TERMS OF SERVICE — KEY CLAUSES

UniGram's Terms of Service (ToS) must include the following provisions as a minimum:

**5.1 Acceptance Mechanism**
Terms must be actively accepted — a checkbox at sign-up, not merely a "by using this app you agree" notice. Passive acceptance is increasingly unenforceable.

**5.2 User Eligibility**
Statement that the service is for users aged 18+, enrolled at an accredited university or tertiary institution. Users who misrepresent their eligibility bear responsibility for resulting harms.

**5.3 User Content Licence**
When a user posts content (photos, text, videos) on UniGram, they retain ownership but grant Hashtechs a non-exclusive, royalty-free licence to display, distribute, and reproduce that content on the platform and in promotional materials. This licence must be limited in scope — not a blanket transfer of IP.

**5.4 Prohibited Conduct**
Explicit list of forbidden behaviours: harassment, impersonation, sharing of non-consensual intimate images, academic dishonesty facilitation, spam, hate speech, incitement to violence. Each category should link to the Community Guidelines.

**5.5 Content Moderation and Removal**
Hashtechs reserves the right to remove content that violates the Community Guidelines or Terms of Service, with or without prior notice. Users may appeal removals via a stated process.

**5.6 Account Suspension and Termination**
Circumstances under which accounts may be suspended or terminated. Process for appeal. What happens to user data upon termination (retention/deletion timeline).

**5.7 Limitation of Liability**
Hashtechs is not liable for user-generated content, for interactions between users, or for any loss arising from use of the platform, to the maximum extent permitted by Ghanaian law.

**5.8 Governing Law and Dispute Resolution**
The ToS are governed by the laws of Ghana. Disputes will be resolved in Ghanaian courts (or by arbitration — to be decided by the CEO with legal counsel).

**5.9 Changes to Terms**
Hashtechs reserves the right to amend the ToS with reasonable notice to users (14–30 days for material changes). Continued use constitutes acceptance.

*— Akosua Frimpong*

---

## SECTION 6: DATA RESIDENCY RECOMMENDATIONS (SUPABASE)

### Context

UniGram uses Supabase as its backend infrastructure. Supabase is hosted on AWS and offers multiple regional deployments. Data residency — where, physically, user data is stored — is a compliance consideration under the DPA 2023 and a reputational consideration for users who may expect their data to be treated with Ghanaian law in mind.

### Recommendations

**6.1 Preferred Region: EU West (Ireland) or EU Central (Frankfurt)**
As of 2026, Supabase does not offer a dedicated Africa-region deployment. The closest compliant options are EU-based regions. The EU (Ireland or Frankfurt) is recommended over US-based regions for the following reasons:
- EU data centres operate under GDPR, one of the world's most rigorous data protection frameworks, which provides a higher standard of protection than US regimes
- Cross-border data transfers from Ghana to EU under DPA 2023 are more readily justifiable under an adequacy-equivalent framework
- EU regions provide lower latency for West African users than US East or US West regions

**6.2 Disclose the Transfer**
The Privacy Policy must explicitly state that user data is stored with Supabase on AWS servers located in [specified region]. This is a legal requirement under DPA 2023's cross-border transfer provisions.

**6.3 Execute a Data Processing Agreement (DPA) with Supabase**
Supabase provides a standard DPA for enterprise and qualifying customers. This agreement formalises the data processor relationship, confirms Supabase's GDPR compliance obligations, and provides Hashtechs with a documented basis for the cross-border data transfer. This must be executed before launch.

**6.4 Future Planning**
As AWS and other cloud providers continue to expand into Africa (AWS Cape Town launched in 2020), a future migration to an Africa-based region — should one become available in West Africa — is advisable. This would eliminate cross-border transfer concerns entirely and improve latency for Ghanaian users.

*— Akosua Frimpong*

---

## SECTION 7: FIVE IMMEDIATE LEGAL ACTION ITEMS FOR THE CEO

These five actions are non-negotiable pre-launch requirements. None of them can be deferred past 30 June 2026.

---

**Action 1: Register with the Data Protection Commission of Ghana**
Visit dpc.gov.gh and complete the Data Controller registration process. The fee is nominal. The legal exposure for non-registration is not.

**Deadline:** 10 June 2026
**Responsible:** CEO
**Cost:** Low (registration fees only)

---

**Action 2: Publish a Compliant Privacy Policy and Terms of Service**
Draft and publish both documents using this framework as a foundation. Engage a Ghanaian data protection attorney for a one-hour review before publishing. The documents must be accessible via a public URL (not hidden inside the app) and linked from both app store listings.

**Deadline:** 20 June 2026
**Responsible:** CEO + Legal Counsel (external)
**Cost:** Low-Medium (attorney review fee)

---

**Action 3: Execute a Data Processing Agreement with Supabase**
Log into your Supabase account, navigate to the organisation settings, and request or download the available DPA. Sign it and retain a copy in the company's legal files.

**Deadline:** 15 June 2026
**Responsible:** CEO
**Cost:** Zero (included in Supabase service terms)

---

**Action 4: Incorporate Hashtechs as a Private Limited Company**
Engage a Ghanaian company secretary or solicitor to register Hashtechs Limited under the Companies Act, 2019 (Act 992) with the Registrar General's Department. The company needs a registered address, at least one director, and a stated share structure.

**Deadline:** 25 June 2026
**Responsible:** CEO
**Cost:** Medium (incorporation fees + professional fees)

---

**Action 5: File for Trademark Protection on "UniGram"**
Submit a trademark application for the UniGram name and logo with the Ghana Intellectual Property Office (GhIPO) under Nice Classification 42 (Software as a Service / Social Networking). This does not need to be completed before launch, but the application must be filed before launch to establish priority — if a competitor registers the name first, the company loses it.

**Deadline:** 30 June 2026
**Responsible:** CEO + IP Attorney
**Cost:** Medium (GhIPO filing fees + attorney)

---

## CLOSING NOTE

Legal compliance for a social app in 2026 is not an afterthought — it is the price of admission. App stores will reject or remove non-compliant apps. Regulators will penalise unregistered data controllers. Users, increasingly data-literate, will distrust platforms that cannot answer basic questions about their data. UniGram has the opportunity to launch not just as a useful product, but as a trustworthy one. That trust, once established, is itself a competitive advantage that no competitor can easily copy.

I am available to review draft legal documents and provide guidance to the CEO as these action items are executed.

*— Akosua Frimpong*
*Chief Legal Counsel, Hashtechs Advisory Board*
*25 May 2026*

---

*Document Reference: HAB/LCF/2026 | Version 1.0*
*This document is provided for informational and planning purposes. It does not constitute formal legal advice and does not create a solicitor-client relationship. Independent legal counsel should be engaged for the execution of formal legal instruments.*
