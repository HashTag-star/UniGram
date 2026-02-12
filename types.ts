
export interface User {
  id: string;
  username: string;
  fullName: string;
  avatar: string;
  university: string;
  major: string;
  year: number;
  bio: string;
  verified: boolean;
  interests: string[];
  isClub?: boolean;
}

export interface Post {
  id: string;
  userId: string;
  user: User;
  type: 'image' | 'video' | 'reel';
  mediaUrl: string;
  caption: string;
  likes: number;
  comments: number;
  timestamp: string;
  universityTag?: string;
  courseTag?: string;
}

export interface Story {
  id: string;
  userId: string;
  user: User;
  mediaUrl: string;
  timestamp: string;
}

export type EventCategory = 'Social' | 'Academic' | 'Career' | 'Sports' | 'Workshop' | 'Club';

export interface Event {
  id: string;
  title: string;
  description: string;
  date: string;
  location: string;
  organizer: User;
  attendees: number;
  image: string;
  category: EventCategory;
  isPromoted?: boolean;
}

export interface StudyGroup {
  id: string;
  name: string;
  courseCode: string;
  members: number;
  description: string;
}

export interface MarketItem {
  id: string;
  title: string;
  price: number;
  image: string;
  category: 'books' | 'gadgets' | 'housing' | 'other';
  seller: User;
}

export interface Confession {
  id: string;
  text: string;
  likes: number;
  timestamp: string;
}

export interface Recommendation {
  id: string;
  type: 'connection' | 'group' | 'event';
  title: string;
  subtitle: string;
  reason: string;
  imageUrl?: string;
}

export enum AppTab {
  FEED = 'feed',
  EXPLORE = 'explore',
  MARKET = 'market',
  EVENTS = 'events',
  COURSES = 'courses',
  PROFILE = 'profile',
  REELS = 'reels',
  CONFESSIONS = 'confessions'
}
