# UniGram Operating Cost Breakdown
**Prepared by:** Kojo Acheampong — Budget & Cost Controller, Hashtechs Finance Department
**Date:** May 2026
**Classification:** Internal Financial Document

---

## Overview

This document provides a granular breakdown of all costs required to operate UniGram and maintain the Hashtechs business entity through three distinct scale phases: Launch (0–1,000 MAU), Growth (1,000–10,000 MAU), and Scale (10,000+ MAU). All USD costs are converted at GH₵ 15 = $1 USD for GH₵ equivalents. Cost discipline in the early months is the single most powerful lever to reach break-even ahead of schedule.

---

## 1. Infrastructure Costs

### 1.1 Supabase (Database, Auth, Storage, Realtime)

Supabase is the backbone of UniGram's backend — handling authentication, the PostgreSQL database, storage for media, and real-time feeds.

| Plan         | Monthly Cost (USD) | GH₵ Equivalent | Applicable Phase          |
|--------------|--------------------|-----------------|---------------------------|
| Free Tier    | $0                 | GH₵ 0           | Pre-launch & M1–M2        |
| Pro Plan     | $25/month          | GH₵ 375/month   | M3–M8 (Growth)            |
| Team Plan    | $599/month         | GH₵ 8,985/month | M9+ (Scale, 10K+ users)   |

**Notes:**
- Free tier supports up to 50,000 MAU with 500MB database and 1GB file storage — adequate for the first 1–2 months.
- Pro plan is the critical upgrade: 8GB database, 100GB storage, daily backups, and email support. Mandatory before hitting 2,000 active users.
- Team plan is required at scale for SOC 2 compliance reports, advanced logging, and dedicated support — not needed until the platform exceeds ~10,000 consistent MAU.
- **Phase consideration:** Budget for the Supabase Pro upgrade at Month 3 even if technically still on Free — planning ahead prevents a scramble when the limit is hit mid-growth.

### 1.2 Expo Application Services — EAS (Build & Submit)

EAS handles CI/CD for React Native/Expo apps, including cloud builds, OTA (over-the-air) updates, and app store submissions.

| Plan               | Monthly Cost (USD) | GH₵ Equivalent | Notes                                |
|--------------------|---------------------|-----------------|--------------------------------------|
| Free Tier          | $0                  | GH₵ 0           | Limited builds/month; dev use only   |
| Production Plan    | $99/month           | GH₵ 1,485/month | Unlimited builds, priority queue      |

**Recommendation:** Stay on Free tier through Month 2. Upgrade to Production at Month 3 when push frequency and OTA update cadence will demand it. The Production plan pays for itself immediately by eliminating build queue delays that impact user experience.

### 1.3 Apple Developer Account

| Item                     | Cost (USD) | GH₵ Equivalent | Frequency   |
|--------------------------|------------|-----------------|-------------|
| Apple Developer Program  | $99/year   | GH₵ 1,485/year  | Annual      |

Required for TestFlight distribution and App Store publication. This is a fixed, non-negotiable cost. Renew each November to avoid certificate expiry that would break iOS builds.

### 1.4 Google Play Developer Account

| Item                          | Cost (USD) | GH₵ Equivalent | Frequency   |
|-------------------------------|------------|-----------------|-------------|
| Google Play Developer Console | $25        | GH₵ 375         | One-time    |

One-time registration fee. No recurring charges from Google for the Play console itself.

### 1.5 Domain & Hosting

| Item                        | Cost (USD)     | GH₵ Equivalent  | Notes                        |
|-----------------------------|----------------|------------------|------------------------------|
| .com domain (unigram.app)   | ~$15/year      | ~GH₵ 225/year   | Via Namecheap or Cloudflare  |
| Landing page hosting (Vercel)| Free–$20/year | GH₵ 0–300/year  | Free tier sufficient early   |
| Custom email (Google Workspace)| $6/user/mo  | GH₵ 90/user/mo  | Start with 2 accounts = $12/mo |
| **Total Domain/Hosting**    | ~$50/year      | ~GH₵ 750/year   |                              |

---

## 2. Push Notifications

### Expo Push Notification Service

| Volume           | Cost      | Notes                                        |
|------------------|-----------|----------------------------------------------|
| Up to 1M/month   | Free      | Adequate through M9–M10 at current projections|
| 1M–10M/month     | $0.0001 each | Approximately $0 at current scale           |

Push notifications remain free for the foreseeable future under Expo's pricing. Cost only becomes material at 1M+ notifications per month, which requires approximately 33,000 daily active users sending 30 notifications each — well beyond Year 1. **Budget: GH₵ 0 for Year 1.**

---

## 3. AI / Groq API Costs

UniGram uses Groq-powered edge functions for features such as smart feed ranking, auto-content moderation, and AI-assisted post suggestions.

| Usage Tier          | Estimated Monthly Calls | Cost at Groq Pricing (~$0.27/1M tokens) | GH₵ Equivalent |
|---------------------|------------------------|------------------------------------------|-----------------|
| Launch (0–1K users) | ~50,000 tokens/month   | ~$0.01                                   | ~GH₵ 0.15      |
| Growth (1K–10K)     | ~500,000 tokens/month  | ~$0.14                                   | ~GH₵ 2         |
| Scale (10K+)        | ~5,000,000 tokens/month| ~$1.35                                   | ~GH₵ 20        |

Groq's speed and pricing are highly favourable. Even at scale, AI inference costs remain negligible. **Budget: GH₵ 25/month at scale as a conservative buffer.**

---

## 4. Human Capital Costs

Currently, Hashtechs operates lean. The core team (Hashtag as CEO, supported by the founding team) is bootstrapped with deferred/equity compensation in the pre-seed phase. However, the following should be budgeted from Month 4 onwards if angel funding is secured:

| Role                    | Est. Monthly Cost (GH₵) | Notes                              |
|-------------------------|-------------------------|------------------------------------|
| Part-time Campus Intern (per university) | GH₵ 400 | Community growth ambassador  |
| Freelance Designer (retainer) | GH₵ 800      | UI updates, marketing assets       |
| Customer Support (part-time) | GH₵ 600       | From Month 5 when user base grows  |

Budget these conservatively. Core engineering remains in-house (Hashtag + founding engineers) to avoid cash burn before revenue cover.

---

## 5. Miscellaneous & Operational Costs

| Item                        | Monthly Cost (GH₵) | Notes                                  |
|-----------------------------|---------------------|----------------------------------------|
| Data/Airtime for testing    | GH₵ 100            | Real device testing on Ghanaian networks|
| Marketing/social media ads  | GH₵ 200–500        | Primarily Meta (Facebook/Instagram) ads |
| Legal & compliance (amortised)| GH₵ 100           | Business registration, terms of service |
| Contingency (5% buffer)     | GH₵ 150–500        | Unexpected costs                        |

---

## 6. Total Monthly Cost by Scale Phase

### Phase 1: Launch (Month 1–2) | 0–1,000 MAU

| Cost Item              | Monthly (GH₵) |
|------------------------|---------------|
| Supabase Free          | 0             |
| EAS Free               | 0             |
| Apple Developer (amort)| 124           |
| Google Play (one-time M1)| 375 (M1 only)|
| Domain/Hosting (amort) | 83            |
| Push Notifications     | 0             |
| Groq API               | 1             |
| Google Workspace       | 180           |
| Marketing              | 300           |
| Miscellaneous          | 200           |
| **Total M1**           | **GH₵ 1,263 + GH₵ 375 one-time = GH₵ 1,638** |
| **Total M2**           | **~GH₵ 1,263** |

### Phase 2: Growth (Month 3–8) | 1,000–10,000 MAU

| Cost Item              | Monthly (GH₵) |
|------------------------|---------------|
| Supabase Pro           | 375           |
| EAS Production         | 1,485         |
| Apple Developer (amort)| 124           |
| Domain/Hosting (amort) | 83            |
| Push Notifications     | 0             |
| Groq API               | 5             |
| Google Workspace       | 180           |
| Marketing              | 800           |
| Campus Interns (x2)    | 800           |
| Freelance Design       | 800           |
| Miscellaneous/buffer   | 350           |
| **Total**              | **~GH₵ 5,002/month** |

### Phase 3: Scale (Month 9–12+) | 10,000+ MAU

| Cost Item              | Monthly (GH₵) |
|------------------------|---------------|
| Supabase Team          | 8,985         |
| EAS Production         | 1,485         |
| Apple Developer (amort)| 124           |
| Domain/Hosting (amort) | 83            |
| Push Notifications     | 0             |
| Groq API               | 25            |
| Google Workspace       | 270           |
| Marketing              | 2,000         |
| Campus Interns (x4)    | 1,600         |
| Freelance Design       | 800           |
| Customer Support       | 600           |
| Miscellaneous/buffer   | 600           |
| **Total**              | **~GH₵ 16,572/month** |

---

## 7. Cost Per User Summary

| Phase          | Monthly Cost (GH₵) | MAU    | Cost Per User (GH₵) | Cost Per User (USD) |
|----------------|---------------------|--------|----------------------|----------------------|
| Launch (M1–M2) | ~GH₵ 1,500          | 500    | GH₵ 3.00            | $0.20               |
| Growth (M3–M8) | ~GH₵ 5,000          | 5,000  | GH₵ 1.00            | $0.07               |
| Scale (M9–M12) | ~GH₵ 16,572         | 13,000 | GH₵ 1.27            | $0.08               |

The Supabase Team plan causes a cost-per-user spike at scale entry. This is a known "staircase" effect in SaaS infrastructure and is expected — it resolves quickly as the user base grows beyond 10K. The controller recommends negotiating the Supabase Team plan early if a discounted annual commitment is available.

---

## 8. Cost Reduction Levers

1. **Delay Supabase Team plan** by optimising queries and caching aggressively — potentially worth 3 extra months on Pro.
2. **Use Cloudflare R2** for media storage instead of Supabase Storage at scale — approximately 60–80% cheaper for object storage.
3. **Batch Groq API calls** to minimise token usage per session.
4. **Negotiate EAS Production annually** — EAS offers annual billing discounts.
5. **Campus ambassadors on revenue share** rather than flat retainer — aligns incentives with advertiser acquisition.

---

*— Kojo Acheampong, Budget & Cost Controller*
*Hashtechs Finance Department | May 2026*
