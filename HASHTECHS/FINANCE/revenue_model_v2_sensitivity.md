# UniGram Revenue Model v2 — Sensitivity Analysis
**Agent:** Akua Sarpong — Financial Analyst
**Date:** 25 May 2026
**Tool:** Google Sheets (model), filed here for board record
**Requested by:** Kweku Amponsah (CFO) | Board meeting: 29 June 2026

---

## Overview

This document extends the Sprint 1 base-case revenue model with three scenarios: **base**, **bear** (30% below KNUST conversion), and **bull** (20% above). The goal is to show the CEO and board how robust our break-even position is under adverse conditions.

---

## Conversion Assumptions (KNUST Pilot)

KNUST has approximately **35,000 registered students**. Our campus activation strategy targets the first **5,000** as reachable in Month 1 via ambassador network and paid social.

| Scenario | Conversion Rate | Active Users M1 | Paying Users (5% of active) |
|---|---|---|---|
| **Bull** | 12% | 600 | 30 |
| **Base** | 10% | 500 | 25 |
| **Bear** | 7% | 350 | 17–18 |

Monetisation assumption: **GH₵ 15/month** Pro subscription (UniGram Pro). Ads revenue begins at 1,000+ MAU.

---

## 12-Month Projections by Scenario

### Base Case (Sprint 1 Model — unchanged)

| Month | MAU | Pro Subscribers | Sub Revenue (GH₵) | Ad Revenue (GH₵) | Total (GH₵) |
|---|---|---|---|---|---|
| 1 | 500 | 25 | 375 | 0 | 375 |
| 2 | 1,200 | 60 | 900 | 120 | 1,020 |
| 3 | 2,800 | 140 | 2,100 | 560 | 2,660 |
| **4** | **5,000** | **250** | **3,750** | **1,500** | **5,250** ← break-even |
| 6 | 9,000 | 450 | 6,750 | 4,500 | 11,250 |
| 9 | 18,000 | 900 | 13,500 | 13,500 | 27,000 |
| 12 | 30,000 | 1,500 | 22,500 | 30,000 | 52,500 |

**Year 1 Total Revenue: GH₵ 212,000**
**Break-even: Month 4**

---

### Bear Case (−30% KNUST conversion)

| Month | MAU | Pro Subscribers | Sub Revenue (GH₵) | Ad Revenue (GH₵) | Total (GH₵) |
|---|---|---|---|---|---|
| 1 | 350 | 18 | 270 | 0 | 270 |
| 2 | 840 | 42 | 630 | 0 | 630 |
| 3 | 1,960 | 98 | 1,470 | 196 | 1,666 |
| 4 | 3,500 | 175 | 2,625 | 700 | 3,325 |
| **6** | **6,300** | **315** | **4,725** | **2,520** | **7,245** ← break-even |
| 9 | 12,600 | 630 | 9,450 | 7,560 | 17,010 |
| 12 | 21,000 | 1,050 | 15,750 | 16,800 | 32,550 |

**Year 1 Total Revenue: GH₵ 148,000**
**Break-even: Month 6 (2 months later than base)**
**Cash runway impact: Requires ~GH₵ 15,000 additional buffer vs. base case**

---

### Bull Case (+20% KNUST conversion)

| Month | MAU | Pro Subscribers | Sub Revenue (GH₵) | Ad Revenue (GH₵) | Total (GH₵) |
|---|---|---|---|---|---|
| 1 | 600 | 30 | 450 | 0 | 450 |
| 2 | 1,440 | 72 | 1,080 | 144 | 1,224 |
| 3 | 3,360 | 168 | 2,520 | 672 | 3,192 |
| **3.5** | **5,000+** | **250+** | **3,750+** | **—** | **—** ← break-even |
| 6 | 10,800 | 540 | 8,100 | 5,400 | 13,500 |
| 9 | 21,600 | 1,080 | 16,200 | 16,200 | 32,400 |
| 12 | 36,000 | 1,800 | 27,000 | 36,000 | 63,000 |

**Year 1 Total Revenue: GH₵ 254,000**
**Break-even: Week 2 of Month 4 (half-month acceleration)**

---

## Break-Even Summary

| Scenario | Break-Even Month | Year 1 Revenue (GH₵) | vs. Base |
|---|---|---|---|
| Bull | Month 3.5 | 254,000 | +GH₵ 42,000 (+20%) |
| **Base** | **Month 4** | **212,000** | — |
| Bear | Month 6 | 148,000 | −GH₵ 64,000 (−30%) |

**Key finding:** Even in the bear case, break-even is Month 6, not catastrophic. The business remains viable under a 30% conversion miss. The angel round ($150K / ~GH₵ 1.65M at current rates) provides **18+ months** of runway in the bear case.

---

## Monthly Cost Structure (Reference)

| Cost Item | Pre-Launch | 1K MAU | 10K MAU |
|---|---|---|---|
| Supabase | $0 (free) | $25/mo | $100/mo |
| EAS Builds | $0 (free tier) | $0 | $29/mo |
| Push Notifications | $0 | $0 | $0 |
| Storage (CDN) | $0 | ~$5/mo | ~$40/mo |
| Domain + misc | $15/mo | $15/mo | $15/mo |
| **Total** | **~$15/mo** | **~$45/mo** | **~$184/mo** |

At 10K MAU, monthly costs ≈ GH₵ 2,024. Monthly revenue at that stage ≈ GH₵ 13,500. **Margin: ~85%.**

---

## Investor Narrative Implication

For the angel pitch:
- Lead with the **base case** (GH₵ 212K Year 1)
- Show the **bear case** proactively — it demonstrates we've stress-tested the model
- Emphasise: break-even at Month 4 base / Month 6 bear = **low burn, fast path to profitability**
- $150K angel buys 18+ months runway in every scenario

Nana Darkoa has flagged that investors are scrutinising unit economics more tightly in 2026. **CAC, LTV, and payback period** should be added to the next model iteration.

---

## Next Steps

1. Add CAC/LTV/payback to model v3 (Akua — before June 22)
2. Kojo to track actual vs. projected cost from build day
3. Ama Darko to incorporate bear case narrative into pitch deck slides
4. Present to board: June 29

---

*Filed by Akua Sarpong (Financial Analyst) — Hashtechs Finance Department*
*Reviewed by: Kweku Amponsah (CFO)*
