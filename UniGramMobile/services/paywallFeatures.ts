/**
 * Single source of truth for what UniGram Pro includes and the copy shown when a
 * given feature triggers the paywall. Add a key here, then call
 * `openPaywall('<key>')` (or `requirePro('<key>', action)`) from any screen.
 */
export type PaywallFeature =
  | 'general'
  | 'analytics'
  | 'ai_insights'
  | 'profile_views'
  | 'story_links'
  | 'explore_priority'
  | 'profile'
  | 'settings'
  | 'feed';

export interface ProFeature {
  key: PaywallFeature;
  icon: string;
  color: string;
  title: string;
  desc: string;
}

/** The marketing list shown on the paywall. */
export const PRO_FEATURE_LIST: ProFeature[] = [
  { key: 'ai_insights', icon: 'bulb-outline', color: '#a855f7', title: 'AI Insights', desc: 'A personalised AI performance report on your content.' },
  { key: 'analytics', icon: 'bar-chart-outline', color: '#6366f1', title: 'Post Analytics', desc: 'Views, reach and engagement on every post.' },
  { key: 'profile_views', icon: 'eye-outline', color: '#0ea5e9', title: 'Profile Views', desc: 'See who is visiting your profile each week.' },
  { key: 'story_links', icon: 'link-outline', color: '#22c55e', title: 'Story Links', desc: 'Add a tappable link to your stories.' },
  { key: 'explore_priority', icon: 'rocket-outline', color: '#f59e0b', title: 'Explore Priority', desc: 'Your posts rank higher in campus Explore feeds.' },
];

export interface PaywallCopy { icon: string; title: string; subtitle: string }

/** Headline per entry point so the paywall always explains *why* it appeared. */
export const PAYWALL_COPY: Record<PaywallFeature, PaywallCopy> = {
  general: { icon: 'flash', title: 'Go further with UniGram Pro', subtitle: 'Creator tools for students who mean business.' },
  profile: { icon: 'flash', title: 'Go further with UniGram Pro', subtitle: 'Analytics, insights and priority reach for your content.' },
  settings: { icon: 'flash', title: 'Upgrade to UniGram Pro', subtitle: 'Unlock every creator tool in one subscription.' },
  feed: { icon: 'flash', title: 'Get more from your campus', subtitle: 'Grow your audience with Pro creator tools.' },
  analytics: { icon: 'bar-chart', title: 'See how your posts perform', subtitle: 'Unlock views, reach and engagement for every post.' },
  ai_insights: { icon: 'bulb', title: 'Get AI-powered insights', subtitle: 'Understand what works and what to post next.' },
  profile_views: { icon: 'eye', title: 'See who views your profile', subtitle: 'Track profile visits week over week.' },
  story_links: { icon: 'link', title: 'Add links to your stories', subtitle: 'Send viewers straight to your project, event or shop.' },
  explore_priority: { icon: 'rocket', title: 'Rank higher on Explore', subtitle: 'Get your posts in front of more students.' },
};
