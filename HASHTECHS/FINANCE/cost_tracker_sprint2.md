# UniGram — Live Cost Tracker | Sprint 2
**Agent:** Kojo Acheampong — Budget & Cost Controller
**Date opened:** 25 May 2026
**Update cadence:** Weekly (every Monday)

---

## Cost Tracking Status

| Category | Budget Allocated | Actual Spend (Sprint 2) | Variance | Status |
|---|---|---|---|---|
| Supabase | $0 (free tier) | $0 | — | ✅ On budget |
| EAS Builds | $0 (free tier, 30/mo) | $0 | — | ✅ On budget |
| Push Notifications | $0 | $0 | — | ✅ On budget |
| Domain / DNS | $15/mo | $15 | — | ✅ On budget |
| Marketing — KNUST paid ads | GH₵ 5,000 | GH₵ 0 (not yet launched) | — | ⏳ Pre-spend |
| Apple Developer Account | $99/yr | $0 (pending CEO) | — | ⏳ Blocked |
| Google Play Console | $25 one-time | $0 (pending CEO) | — | ⏳ Blocked |
| **Sprint 2 Total** | | **$15 + GH₵ 0** | | |

---

## Cloud Cost Thresholds — Watch Points

### Supabase
| Usage Trigger | Action Required |
|---|---|
| >500 MAU | Upgrade to Pro plan ($25/mo) |
| >5 GB database | Monitor — Pro includes 8 GB |
| >50 GB storage | Review media compression settings |
| Realtime connections >200 concurrent | Evaluate channel subscriptions |

**Current status:** Free tier. No action needed pre-launch.

### EAS (Expo Application Services)
| Plan | Builds/Month | Cost |
|---|---|---|
| Free | 30 builds | $0 |
| Production | Production + unlimited | $99/mo |

**Recommendation:** Stay on free tier through launch. Upgrade only if build frequency exceeds 30/month post-launch.

---

## Burn Rate Projections

| Stage | Monthly Opex (USD) | Monthly Opex (GH₵) | Notes |
|---|---|---|---|
| Pre-launch (now) | ~$15 | ~GH₵ 165 | Domain only |
| At 1K MAU | ~$45 | ~GH₵ 495 | + Supabase Pro |
| At 5K MAU | ~$90 | ~GH₵ 990 | + storage growth |
| At 10K MAU | ~$184 | ~GH₵ 2,024 | + EAS Production |
| At 50K MAU | ~$450 | ~GH₵ 4,950 | + Supabase Team plan |

*Exchange rate used: 1 USD = 11 GH₵ (May 2026 approximate)*

---

## $150K Angel Round — Runway Calculation

| Scenario | Monthly Burn at 10K MAU | Angel Capital (GH₵ equiv.) | Runway |
|---|---|---|---|
| Technical only (no marketing) | GH₵ 2,024 | GH₵ 1,650,000 | **68 months** |
| With GH₵ 5K/mo marketing | GH₵ 7,024 | GH₵ 1,650,000 | **23 months** |
| Full team (future hires) | ~GH₵ 25,000/mo | GH₵ 1,650,000 | **66 months** |

Even with aggressive marketing spend, the $150K angel round provides **nearly 2 years of runway** assuming we're at break-even by Month 4–6. This is a strong position for a seed pitch.

---

## Vendor Contracts — Tracked Items

| Vendor | Contract Type | Monthly Cost | Renewal Date | Owner |
|---|---|---|---|---|
| Supabase | SaaS (free tier) | $0 | N/A | Kofi Asante |
| Expo / EAS | SaaS (free tier) | $0 | N/A | Kwame Darko |
| Apple Developer | Annual license | $99/yr | TBD | CEO (Hashtag) |
| Google Play | One-time | $25 | N/A | CEO (Hashtag) |
| Domain registrar | Annual | ~$15/yr | TBD | CEO (Hashtag) |

---

## Action Items

- [ ] CEO to supply Apple Developer account credentials — cost: $99/yr (required for iOS build)
- [ ] CEO to register Google Play Console account — one-time $25 fee
- [ ] Alert CFO when Supabase usage hits 400 MAU (pre-upgrade warning)
- [ ] Set billing alerts on Supabase dashboard (Dashboard → Settings → Billing)
- [ ] Review storage bucket usage monthly — `post-media` and `message-media` are highest risk

---

*Filed by Kojo Acheampong (Budget & Cost Controller) — Hashtechs Finance Department*
*Next update: 01 June 2026*
