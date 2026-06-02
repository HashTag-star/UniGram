# Hashtechs — Skills Gap Analysis
**Agent:** Fiifi Quaye — Training & Development Lead
**Date:** 25 May 2026
**Scope:** Sprint 1 output review vs. department mandates
**Requested by:** Efua Boateng (CPO)

---

## Executive Summary

Hashtechs has 19 active agents across 5 departments. Sprint 1 demonstrated strong execution in Tech, Finance, and Marketing. However, three critical capability gaps exist that pose delivery risk before and immediately after launch. This analysis ranks them by urgency and proposes resolution paths.

---

## Methodology

Cross-referenced each department's mandate (as defined in `COMPANY.md`) against actual Sprint 1 outputs. Flagged gaps where a mandate area has zero coverage or where a single agent is carrying a domain that requires more capacity.

---

## Gap 1 — Customer Success: CRITICAL 🔴

**What's missing:** There is no Customer Success function. Zero agents own user onboarding quality, retention signals, community moderation escalation, or NPS.

**Why it matters now:** UniGram launches to KNUST students in weeks. Within 48 hours of launch, the first user complaints, confusion reports, and moderation escalations will arrive. There is no one to catch them.

**Current workaround:** AI moderation (Groq Edge Functions) handles automated content flagging. The Admin Dashboard lets Hashtag manually manage reports. This is not scalable past 500 users.

**Resolution:**
- Yaw Asiedu's Customer Success Head JD (filed today) should go live immediately — this is a Q3 hire but the search starts now
- Claude (GM) will handle CS escalations as a stopgap until hire is made
- Tech should expose the Admin Dashboard reporting tools to the GM for interim use

**Estimated capability gap closure:** Q3 2026 (hire) — too long for launch. Recommend a part-time CS contractor from KNUST student body as bridge.

---

## Gap 2 — Data & Analytics: HIGH 🟠

**What's missing:** No agent owns product analytics, user behaviour tracking, A/B testing, or data infrastructure. We are building a social platform and have no way to measure what's working.

**Why it matters now:** Without analytics, we cannot answer: Which features drive D7 retention? Where are users dropping off in onboarding? What content type generates the most engagement?

**Current workaround:** Supabase provides basic query-level data. Kofi can write manual SQL queries. This is Kofi's job, not an analytics function.

**Resolution:**
- Add a basic analytics layer before launch: Expo's built-in usage stats + Supabase row-count queries as a minimum
- Head of Data & Analytics is a planned post-launch hire — consider pulling the timeline forward to post-KNUST-pilot (Month 2)
- Kwabena Mensah (Marketing) should set up Meta Pixel and Google Analytics for the web landing page as an interim signal

**Estimated capability gap closure:** Month 2 post-launch (interim tools), Q4 2026 (full hire)

---

## Gap 3 — Legal & Compliance Execution: HIGH 🟠

**What's missing:** Akosua Frimpong (Board Legal Counsel) is an advisor, not an operator. The day-to-day compliance *execution* — Privacy Policy drafting, DPA registration paperwork, COPPA enforcement review, Terms of Service sign-off — has no dedicated owner.

**Why it matters now:** The Ghana DPA mandates registration before collecting personal data at scale. The App Store requires a published Privacy Policy URL before submission. Both are blocking the launch.

**Current workaround:** Akosua provides guidance. Claude (GM) is coordinating. But neither is moving the paperwork forward.

**Resolution:**
- Akosua to produce a drafted Privacy Policy this sprint (using her legal expertise + Claude's drafting support)
- Legal & Compliance Officer is a planned post-launch hire — this is the right call, but DPA registration must happen BEFORE launch regardless
- Claude (GM) will draft the Privacy Policy and Terms of Service as a stopgap for Akosua's review

**Estimated capability gap closure:** Privacy Policy + ToS by June 15. DPA registration by June 22 (subject to CEO signature).

---

## Gap 4 — Partnerships: MEDIUM 🟡

**What's missing:** No Partnerships Manager. University partnership agreements, brand sponsorships for events, and the ambassador programme all need a dedicated owner.

**Current workaround:** Kofi Darko (Brand & Growth) is covering ambassador recruitment as a side mandate. Ebo Hammond (Board) is providing strategic GTM guidance.

**Resolution:** Planned Q3 hire. Kofi Darko can hold the function until then. No immediate action required — but flag for Yaw's hiring pipeline.

---

## Gap 5 — Finance Operations Bandwidth: LOW-MEDIUM 🟡

**What's missing:** The Finance team has strong strategic coverage (CFO, Analyst, Strategist, Cost Controller) but no day-to-day accounting operations coverage. Abena Amoah was just hired to fill this — but she is the only person in execution-mode finance.

**Resolution:** Monitor. If Kojo's cost tracker and Abena's expense log prove insufficient at scale, consider a second junior finance hire post-launch.

---

## Skills Inventory — Current vs. Required

| Capability | Current Coverage | Adequacy | Gap Owner |
|---|---|---|---|
| Mobile app development | Ama, Kofi, Abena O, Kwame | ✅ Strong | — |
| Backend / DB | Kofi Asante | ✅ Adequate | — |
| Financial modelling | Akua, Kweku | ✅ Strong | — |
| Cost control | Kojo, Abena Amoah | ✅ Adequate | — |
| Investor relations | Ama Darko | ⚠️ Single point | Backup needed |
| Brand & content | Adaeze, Kofi D, Nana Ama | ✅ Strong | — |
| SEO / ASO | Kwabena | ⚠️ Single point | — |
| Customer success | ❌ None | 🔴 Critical gap | Hire Q3 |
| Product analytics | ❌ None | 🟠 High gap | Hire Q4 |
| Legal execution | Akosua (advisory) | 🟠 High gap | Hire post-launch |
| Partnerships | Kofi D (partial) | 🟡 Medium gap | Hire Q3 |
| People ops | Efua, Yaw, Adwoa, Fiifi | ✅ Strong | — |

---

## Recommendations

1. **Immediate (this sprint):** Claude (GM) drafts Privacy Policy + ToS for Akosua's review. Customer Success interim plan documented.
2. **Before launch:** KNUST student CS contractor identified and briefed.
3. **Month 2 post-launch:** Analytics tooling (Mixpanel or Amplitude free tier) integrated.
4. **Q3 2026:** Customer Success Head + Partnerships Manager hired (Yaw has JD for CS ready).
5. **Q4 2026:** Head of Data & Analytics hired.

---

*Filed by Fiifi Quaye (Training & Development Lead) — Hashtechs HR Department*
*Reviewed by: Efua Boateng (CPO)*
