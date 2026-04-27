# UniGram — Strategy, Vision & Execution Plan

---

## PART 1: THE CONVERSATION — What We Figured Out

### The Problem

UniGram is a social media platform for university students. The core challenge is differentiation — how do you build something students *want* to come back to, not just another platform they forget about?

### The Feeling — What UniGram Sells

Most platforms sell a feeling:

- **Instagram** → aspiration ("look at the life I'm living")

- **Twitter/X** → relevance ("I know what's happening right now")
- **LinkedIn** → achievement ("look how far I've come")
- **TikTok** → escape ("just one more video")

**UniGram sells two feelings layered together:**

#### 1. Belonging

*"These are my people."*

University is one of the most universally intense shared experiences humans go through — the stress, the broke moments, the 3am deadlines, the friendships, the heartbreaks, the confusion about the future. Students live that experience on platforms that were never built for them.

When a student opens UniGram, they should feel immediately understood by people going through exactly what they're going through.

#### 2. Momentum

*"We're all going somewhere."*

Students are in a unique in-between — not kids, not fully adults. Everything feels possible but nothing is certain. Their future is being shaped right now and they know it.

UniGram should make a student feel like *being a student is the most exciting thing they could possibly be right now.* Not just seeing people's lives — seeing people **building** their lives in real time. And it makes you want to build too.

**Together, the sell is:**
> *"The internet, but it gets you."*
> *"Built for the experience only students understand."*

UniGram isn't for everyone — and that exclusivity is the point.

---

## PART 2: THE CHICKEN-AND-EGG PROBLEM — How to Execute

### The Unfair Advantage

Universities already have communities. You don't need to build the network from scratch. It already exists in WhatsApp groups, Discord servers, Facebook groups, notice boards. Your job isn't to create the community — it's to **give it a better home.**

### Stage-by-Stage Execution

#### Stage 1 — Launch to ONE University (KNUST First)

Don't launch to everyone. Go deep, not wide.

- Target: **KNUST** (you're there, you understand the culture, you have direct access)
- Goal: **500 very active users** at one school who genuinely love the platform
- That energy becomes your proof of concept and marketing material for every other school

#### Stage 2 — Find Your Campus Connectors

Every university has people who are naturally plugged in. Student leaders, popular figures, department reps, the person who runs the class WhatsApp group. You don't need influencers — you need **connectors**.

- Identify 10–20 of these people at KNUST
- Give them early access — make them feel like **co-founders** of something
- When they post, their existing social pull brings their circles in organically

#### Stage 3 — Solve an Immediate Pain Point on Day One

The platform needs to be **useful before it's social.** If someone downloads UniGram and there's no content, they leave and never come back.

On launch day, UniGram should already have something valuable sitting there:

- Exam timetables
- Course information
- Campus event listings

A student who joins alone still finds a reason to stay while the social layer fills up.

#### Stage 4 — Create a Reason to Invite

Word of mouth only works if there's a pull. Students should feel like they're missing out by not being on UniGram — whether that's a conversation happening, an event being planned, or content only visible to students of their university.

**The overall strategy:**
> Go small. Go deep. Go real. Then expand.

---

## PART 3: THE ALGORITHM — Encoding the Feeling into Code

The algorithm doesn't create the feeling directly. It creates the **conditions** for the feeling to happen consistently.

### Translating Feelings into Signals

**Belonging** shows up when:

- A user comments and gets a reply
- Someone from their university engages with their post
- They see content that mirrors their exact situation

**Momentum** shows up when:

- They see peers doing impressive things
- They see progress, not just highlight reels
- They leave the app feeling motivated, not empty

### The North Star Metric

Most algorithms optimize for **time on app.** UniGram should optimize for:
> **Meaningful engagement per session, not time per session.**

A user who spends 10 minutes and leaves feeling inspired is more valuable than a user who spends 2 hours feeling empty.

### The Post Score Formula

```the math
PostScore = (RelevanceScore × 0.35)
          + (ResonanceScore × 0.30)
          + (RecencyScore  × 0.20)
          + (MomentumBoost × 0.15)
```

#### Relevance Score

```javascript
function getRelevanceScore(post, viewer) {
  let score = 0;
  if (post.university_id === viewer.university_id) score += 50;
  if (post.department === viewer.department)        score += 20;
  if (post.year_group === viewer.year_group)         score += 15;
  if (viewer.following.includes(post.author_id))    score += 15;
  return score / 100;
}
```

#### Resonance Score

```javascript
function getResonanceScore(post) {
  const weights = { likes: 1, comments: 3, saves: 4, shares: 5, replies_received: 6 };
  const raw =
    post.likes * weights.likes +
    post.comments * weights.comments +
    post.saves * weights.saves +
    post.shares * weights.shares +
    post.replies_received * weights.replies_received;
  return raw / Math.max(post.impressions, 1);
}
```

#### Recency Score (Weighted Decay)

```javascript
function getRecencyScore(post) {
  const ageInHours = (Date.now() - new Date(post.created_at)) / 3600000;
  return Math.exp(-0.05 * ageInHours); // drops fast after 24hrs
}
```

#### Momentum Boost (UniGram's Special Sauce)

```javascript
function getMomentumBoost(post) {
  const momentumKeywords = [
    'internship', 'project', 'graduated', 'accepted',
    'finished', 'launched', 'proud', 'achievement', 'offer'
  ];
  const hasMomentumSignal = momentumKeywords.some(w =>
    post.content.toLowerCase().includes(w)
  );
  const saveLikeRatio = post.saves / Math.max(post.likes, 1);
  const highSaveRatio = saveLikeRatio > 0.3;

  if (hasMomentumSignal && highSaveRatio) return 1.0;
  if (hasMomentumSignal || highSaveRatio) return 0.5;
  return 0;
}
```

### Feed Assembly — The Session Arc

Scoring posts individually isn't enough. The **shape of the feed** matters.

```javascript
function assembleFeed(rankedPosts) {
  const feed = [];
  const seenAuthors = new Set();
  const seenTopics = {};

  for (const post of rankedPosts) {
    if (seenAuthors.has(post.author_id)) continue;
    if ((seenTopics[post.category] || 0) >= 2) continue;

    feed.push(post);
    seenAuthors.add(post.author_id);
    seenTopics[post.category] = (seenTopics[post.category] || 0) + 1;

    if (feed.length % 5 === 0)
      Object.keys(seenTopics).forEach(k => seenTopics[k] = 0);
  }

  // Inject momentum posts at positions 3 and 8
  injectMomentumPosts(feed, [2, 7]);
  return feed;
}
```

**Session arc rule:** Open with something familiar and warm → build toward something inspiring → never end on heavy or stressful content.

### Signal Collection (Database)

```sql
CREATE TABLE interactions (
  id          UUID PRIMARY KEY,
  user_id     UUID REFERENCES users(id),
  post_id     UUID REFERENCES posts(id),
  type        VARCHAR(20), -- 'like', 'comment', 'share', 'dwell'
  duration_ms INTEGER,     -- for dwell time tracking
  created_at  TIMESTAMP DEFAULT NOW()
);
```

### Interaction Weights

| Signal | Weight |
|--------|--------|
| Impression | Low |
| Like | Low |
| Comment | Medium |
| Save / Bookmark | Medium-High |
| Share | High |
| Comment replied to | High |
| Follow after seeing post | Very High |

### The Feedback Loop

After each session, update the user's preference vector:

```javascript
async function updateUserPreferences(userId, sessionInteractions) {
  const prefs = await getUserPrefs(userId);
  for (const interaction of sessionInteractions) {
    const weight = getInteractionWeight(interaction.type);
    const post = await getPost(interaction.post_id);
    prefs.affinities[post.category] =
      (prefs.affinities[post.category] || 0) + weight;
  }
  await saveUserPrefs(userId, prefs);
}
```

### Cold Start (New Users)

When a new user joins with no data:

1. **University first** — show what their campus is talking about
2. **Trending across all universities** second
3. **Personalization** kicks in after enough signals are collected

### Tech Stack Mapping

| Layer | Tool |
|-------|------|
| Database | Supabase (PostgreSQL) |
| Backend | Node.js — runs scoring engine |
| Cache | Redis — cache ranked feeds (TTL: 10–15 mins) |
| Frontend | React — tracks dwell time, sends interaction batches |

### Build Order (Don't Build Everything at Once)

1. Signal collection — log every interaction from day one
2. Basic scoring — relevance + recency only
3. Resonance scoring — once interaction data exists
4. Feed assembly rules
5. Momentum detection
6. Feedback loop and personalization

---

## PART 4: CLAUDE CODE EXECUTION PLAN

This section gives you exact prompts to paste into Claude Code in your terminal, in the right order.

---

### PHASE 1 — Database & Signal Collection

**Prompt 1.1 — Create the core schema**

```
Create the Supabase PostgreSQL schema for UniGram's feed algorithm.

I need the following tables:
- users (id, university_id, department, year_group, created_at)
- universities (id, name, country, domain)
- posts (id, author_id, university_id, department, year_group, content, category, created_at)
- interactions (id, user_id, post_id, type, duration_ms, created_at)
- user_preferences (id, user_id, affinities JSONB, university_affinities JSONB, updated_at)

Add appropriate indexes for feed query performance.
Generate the SQL migration file.
```

**Prompt 1.2 — Interaction tracking endpoint**

```
Build a Node.js Express endpoint POST /api/interactions that:
- Accepts a batch array of interactions from the client
- Each interaction has: user_id, post_id, type ('like'|'comment'|'share'|'save'|'dwell'), duration_ms (optional)
- Validates input
- Bulk inserts into the interactions table in Supabase
- Returns 200 on success

Use the existing Supabase client setup.
```

**Prompt 1.3 — Frontend dwell time tracker**

```
Build a React custom hook called usePostTracker that:
- Accepts a post_id and user_id
- Uses IntersectionObserver to detect when a post enters and exits the viewport
- Tracks time spent viewing (dwell time in ms)
- Fires a 'dwell' interaction to a local batch queue when the post exits viewport
- The batch queue sends all interactions to POST /api/interactions every 30 seconds or when 10 interactions accumulate
- Cleans up observers on unmount
```

---

### PHASE 2 — Scoring Engine

**Prompt 2.1 — Post scoring module**

```
Build a Node.js module at src/algorithm/scorer.js that exports these functions:

1. getRelevanceScore(post, viewer) — scores based on:
   - Same university: +50 points
   - Same department: +20 points
   - Same year group: +15 points
   - Viewer follows author: +15 points
   - Returns normalized 0-1 score

2. getResonanceScore(post) — weighted engagement score:
   - likes × 1, comments × 3, saves × 4, shares × 5, replies_received × 6
   - Divided by post impressions to normalize for reach

3. getRecencyScore(post) — exponential decay:
   - Uses formula: Math.exp(-0.05 * ageInHours)
   - Drops fast after 24hrs, slower after 48hrs

4. getMomentumBoost(post) — returns 0, 0.5, or 1.0:
   - Checks content for momentum keywords: 'internship', 'project', 'graduated', 'accepted', 'finished', 'launched', 'proud', 'achievement', 'offer'
   - Also checks if save/like ratio > 0.3
   - Both signals = 1.0, one signal = 0.5, none = 0

5. scorePost(post, viewer) — combines all:
   - Formula: (relevance × 0.35) + (resonance × 0.30) + (recency × 0.20) + (momentum × 0.15)
   - Returns final score

Write unit tests for each function.
```

**Prompt 2.2 — Feed assembly**

```
Build a Node.js module at src/algorithm/feedAssembler.js that exports assembleFeed(rankedPosts, userId):

Rules:
- No back-to-back posts from the same author
- Max 2 posts of the same category before rotating
- Reset category counter every 5 posts
- Inject the highest-scoring momentum post (getMomentumBoost > 0.5) at positions index 2 and 7 in the final feed (if available)
- Return the assembled array

Also export a function rankAndAssemble(posts, viewer) that:
- Scores each post using scorePost from scorer.js
- Sorts by score descending
- Passes through assembleFeed
- Returns final feed array
```

**Prompt 2.3 — Feed API endpoint**

```
Build a Node.js Express endpoint GET /api/feed that:

1. Authenticates the user from the JWT token
2. Fetches the viewer's profile (university_id, department, year_group, following list) from Supabase
3. Checks Redis cache with key `feed:{userId}` — return cached feed if exists (TTL 10 minutes)
4. If no cache: fetches the last 200 posts from Supabase (from the last 72 hours)
5. Runs rankAndAssemble(posts, viewer) from feedAssembler.js
6. Takes the top 30 posts
7. Caches result in Redis with 10 minute TTL
8. Returns the ranked feed

Add Redis client setup using ioredis.
Handle cold start: if user has no preference data, weight university match at 70% instead of 35%.
```

---

### PHASE 3 — Feedback Loop

**Prompt 3.1 — Preference updater**

```
Build a Node.js module at src/algorithm/preferenceUpdater.js that exports:

updateUserPreferences(userId, sessionInteractions):
- Loads current user_preferences from Supabase for this user
- For each interaction, gets the post's category and university_id
- Updates affinities JSONB: increments the category key by the interaction weight
- Interaction weights: like=1, comment=3, save=4, share=5, dwell (>10s)=2
- Updates university_affinities if the post university differs from user's university
- Saves updated preferences back to Supabase
- Invalidates the Redis feed cache for this user (delete key feed:{userId})

Also export a function getInteractionWeight(type, duration_ms) that returns the appropriate weight.
```

**Prompt 3.2 — Cron job for preference updates**

```
Set up a node-cron job in src/jobs/updatePreferences.js that runs every 15 minutes:

1. Fetches all interactions from the last 15 minutes that haven't been processed (add a processed boolean column to interactions table)
2. Groups them by user_id
3. Calls updateUserPreferences for each user
4. Marks processed interactions as processed=true

Register this cron job in the main server file.
```

---

### PHASE 4 — Cold Start & University Launch

**Prompt 4.1 — University trending feed**

```
Build a Node.js endpoint GET /api/feed/university/:universityId/trending that:

- Fetches the top 20 posts from the last 48 hours filtered by university_id
- Ranks them by: (comments × 3 + shares × 5 + saves × 4) / hours_since_posted
- No personalization — pure university-level trending
- Cache with Redis key `trending:{universityId}` with 5 minute TTL
- This is the default feed shown to new users before personalization kicks in
```

**Prompt 4.2 — New user onboarding flow**

```
Build a React onboarding component that appears after signup:

Step 1: Select your university (use the universities table, searchable dropdown)
Step 2: Select your department and year group
Step 3: "What are you interested in?" — show 6 category cards the user can pick from:
  - Academic discussions
  - Campus life
  - Career & opportunities  
  - Creative work
  - Sports & recreation
  - Entertainment

On completion:
- Save university_id, department, year_group to the users table
- Initialize user_preferences with selected category affinities set to 10 (head start)
- Redirect to the main feed

Make it feel welcoming and fast — 3 steps max.
```

---

### PHASE 5 — Belonging Signal Amplification

**Prompt 5.1 — First connection moment**

```
Build a Supabase database function and trigger called detect_new_connection that fires when a new row is inserted into interactions with type = 'comment':

If the commenter and post author:
- Are from the same university AND
- Have never interacted before (no prior rows in interactions between these two user_ids)

Then insert a row into a new table called connection_moments:
  (id, user_a_id, user_b_id, post_id, university_id, created_at)

Then build a Node.js endpoint GET /api/feed/moments that returns the 5 most recent connection_moments for a university, formatted as: 
"{name_a} and {name_b} just connected over a post"

This powers a subtle "community connecting" indicator in the UI.
```

**Prompt 5.2 — Belonging feed indicator in React**

```
Build a React component called CommunityPulse that:
- Fetches from GET /api/feed/moments every 2 minutes
- Shows a small, non-intrusive banner at the top of the feed like:
  "👥 Sarah and Kwame just connected over a post • 3 others connected today"
- Animates in smoothly, auto-dismisses after 5 seconds
- Don't show it more than once per session
- Style it to feel warm and human, not like a notification

This reinforces the belonging feeling without being gamified.
```

---

## SUMMARY — The Vision in One Paragraph

UniGram is not trying to be the biggest social platform. It's trying to be the most *resonant* one for students. Every technical decision — the scoring weights, the session arc, the belonging signals, the momentum boost — flows from two feelings: **belonging** and **momentum**. Students should open UniGram and feel like these are their people, and something is happening. Build for depth first at KNUST. Let the quality of the experience do the marketing.

---

*Document generated from strategy session — UniGram, April 2026*
