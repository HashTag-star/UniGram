# Hashtechs — All-Hands Company Update
**From:** Hashtag, CEO & Founder
**Via:** Claude, General Manager
**Date:** 25 May 2026
**To:** All Agents — Tech · HR · Finance · Marketing · Advisory Board

---

## A message from the CEO

Team,

We started this month with an idea and a codebase. We're ending it with a company.

Hashtechs is now operational. Every department is staffed, every agent has a domain, and the work being produced is already at a standard I'm proud of. UniGram is closer to launch than it has ever been — and that's because of the effort that has gone into every report, every migration fix, every brand document, and every financial model filed this sprint.

This update is a snapshot of where we stand. Read it, own your part in it, and bring the same energy into June.

— **Hashtag**
CEO & Founder, Hashtechs

---

## Sprint 1 — What We Accomplished

### Tech Department
Led by **Ama Mensah**, the engineering team completed a full audit and bug-fix sprint across the UniGram codebase.

**9 application bugs fixed**, including:
- Critical null-profile crash that allowed unauthenticated users into the main shell (App.tsx)
- Google OAuth null crash in Expo Go
- Async `forEach` anti-pattern replaced with `Promise.allSettled()` in the posts service
- Date-of-birth overflow bug (Feb 31 → March 3) corrected
- Email validation hardening on Login and Signup screens

**3 database migration bugs resolved** by **Kofi Asante**:
- Premature `GRANT EXECUTE` on functions not yet created (`002`)
- Missing `GRANT EXECUTE` on `delete_current_user()` (`007`)
- Critical: removed `is_suspended` column reference in migration `036` — this would have bricked every profile UPDATE after deployment

**6 UI/UX accessibility fixes** by **Abena Owusu**:
- Accessibility labels on all action buttons in FeedPost
- Hardcoded colours replaced with ThemeContext tokens across 4 screens
- Emoji removed from button text (Android OEM rendering issue)

**EAS build config corrected** by **Kwame Darko**:
- `serviceAccountKeyPath` was pointing to Firebase config instead of the Play Store service account — fixed before it caused a failed submission

**9-item App Store submission checklist** filed. UniGram is ready to build once credentials are in place.

---

### HR Department
Led by **Efua Boateng**, HR stood up the full people operations layer for Hashtechs in Sprint 1:

- **Employee Handbook** published — values, working norms, agent rules of engagement
- **Job Descriptions** written for all 4 current roles and future hires
- **7-day Onboarding Programme** designed for incoming agents
- **Team Health Report** filed — Sprint 1 morale: Strong. No burnout signals. Recommend maintaining current pace into Sprint 2.

---

### Finance Department
Led by **Kweku Amponsah**, Finance built the full financial foundation:

- **Revenue Model** completed — GH₵ 212,000 Year 1 projection; break-even at Month 4
- **Cost Breakdown** modelled at 3 scale points (pre-launch, 1K users, 10K users)
- **Funding Strategy** filed — $150K angel round target; $500K seed roadmap
- **2026 Financial Roadmap** published — monthly cashflow, burn rate, and investment milestones through December

---

### Marketing Department
Led by **Nana Ama Asante**, Marketing built the brand and go-to-market foundation:

- **GTM Strategy** filed — 6-phase Ghana launch plan, GH₵ 28,000 budget allocation
- **Campus Launch Playbook** written — KNUST pilot programme with ambassador kit
- **Brand Guidelines** published — voice defined as bold, collegiate, Pan-African
- **Content Calendar** live for June–July 2026 — 8 weeks, 1M+ reach target across Instagram and TikTok

---

### Advisory Board
The Board convened for its inaugural meeting and passed 5 resolutions:

1. Approved UniGram as Hashtechs' flagship product for 2026
2. Mandated Ghana Data Protection Act compliance before any public launch
3. Approved the $150K angel funding target and investor outreach strategy
4. Endorsed KNUST as the pilot university
5. Directed all departments to have launch-ready output by end of June 2026

**Legal**: **Akosua Frimpong** filed the full compliance framework — Ghana DPA obligations, App Store policy checklist, and Privacy Policy requirements with deadlines.
**Strategy**: **Dr. Kwabena Osei** filed the Strategic Plan 2026 with 3 phases and a 6-risk register.
**Finance**: **Nana Darkoa** endorsed the revenue model and flagged seed funding timing as a key risk to monitor.
**Market**: **Ebo Hammond** validated KNUST as the right pilot market and flagged Ashesi and UG as next targets.

---

## Where We Stand — Company Scorecard

| Area | Status |
|---|---|
| Total active agents | 18 |
| Documents filed (Sprint 1) | 20 |
| App bugs fixed | 9 |
| Migration bugs fixed | 3 |
| UI/UX issues resolved | 6 |
| Departments operational | 5 |
| UniGram codebase | Build-ready (pending credentials) |
| Brand & GTM | Ready |
| Financial model | Complete |
| Legal framework | Filed |

---

## What's Blocked — CEO Action Required

The following items are **waiting on Hashtag** before Tech can ship:

| Item | Owner | Priority |
|---|---|---|
| Create `.env` file with real Supabase anon key | CEO | 🔴 Critical |
| Add `google-services.json` for Android FCM | CEO | 🔴 Critical |
| Enter real Apple credentials into `eas.json` | CEO | 🔴 Critical |
| Run Migration 003 HNSW index manually (3-step SQL) | CEO / Kofi | 🔴 Critical |
| Replace `YOUR_SERVICE_ROLE_KEY` in migrations 015 & 016 | CEO / Kofi | 🔴 Critical |
| Create `message-media` storage bucket in Supabase | CEO / Kofi | 🟠 High |
| Create App Store Connect listing | CEO | 🟠 High |
| Create Google Play Console listing | CEO | 🟠 High |

Tech is ready. The moment credentials are supplied, Kwame can trigger the production build.

---

## Sprint 2 Priorities (June 2026)

**Tech**: Production build → App Store submission → TestFlight beta
**HR**: Begin hiring plan for Customer Success (planned Q3)
**Finance**: Begin investor outreach, prepare pitch deck financials
**Marketing**: Launch KNUST ambassador recruitment, begin social posting
**Board**: Review launch readiness at June 29 board meeting

---

## Company-Wide Reminder

> *"Every agent signs their work. Agents do not wait to be told. Output is always a written document, code change, or plan — not just analysis."*
>
> — Hashtechs Agent Rules of Engagement

Sprint 1 proved we can build a real company at speed. Sprint 2 is where we ship.

Let's go.

---

*Issued by Claude (General Manager) on behalf of Hashtag (CEO)*
*Hashtechs · 25 May 2026*
*Filed at: `HASHTECHS/company_update_may_2026.md`*
