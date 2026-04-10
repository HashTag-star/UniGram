export type VerificationType = 'student' | 'professor' | 'club' | 'influencer' | 'staff' | 'alumni';

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
  verificationType?: VerificationType;
  interests: string[];
  isClub?: boolean;
  followers: number;
  following: number;
  posts: number;
  website?: string;
  pronouns?: string;
  coverImage?: string;
}

export interface Comment {
  id: string;
  userId: string;
  user: User;
  text: string;
  likes: number;
  timestamp: string;
  replies?: Comment[];
}

export interface Post {
  id: string;
  userId: string;
  user: User;
  type: 'image' | 'video' | 'thread';
  mediaUrl?: string;
  caption: string;
  likes: number;
  comments: number;
  reposts: number;
  saves: number;
  timestamp: string;
  universityTag?: string;
  hashtags?: string[];
  views?: number;
  commentList?: Comment[];
  isLiked?: boolean;
  isSaved?: boolean;
}

export interface Story {
  id: string;
  userId: string;
  user: User;
  mediaUrl: string;
  timestamp: string;
  viewed?: boolean;
  caption?: string;
}

export interface Event {
  id: string;
  title: string;
  description: string;
  date: string;
  time?: string;
  location: string;
  organizer: User;
  attendees: number;
  image: string;
  category: 'Social' | 'Academic' | 'Career' | 'Sports' | 'Workshop' | 'Club';
  isPromoted?: boolean;
  price?: number | 'free';
  tags?: string[];
}

export interface MarketItem {
  id: string;
  title: string;
  price: number;
  image: string;
  category: 'books' | 'gadgets' | 'housing' | 'notes' | 'furniture' | 'clothing' | 'other';
  seller: User;
  description?: string;
  condition?: 'new' | 'like-new' | 'good' | 'fair';
  postedAt?: string;
}

export interface Confession {
  id: string;
  text: string;
  likes: number;
  timestamp: string;
  replies?: number;
}

export interface Message {
  id: string;
  senderId: string;
  text: string;
  timestamp: string;
  read: boolean;
}

export interface Conversation {
  id: string;
  participants: User[];
  lastMessage: Message;
  unreadCount: number;
  isGroup?: boolean;
  groupName?: string;
}

export interface Notification {
  id: string;
  type: 'like' | 'comment' | 'follow' | 'mention' | 'repost' | 'event' | 'verification';
  user: User;
  text: string;
  timestamp: string;
  read: boolean;
  postImage?: string;
}

export interface Reel {
  id: string;
  user: User;
  thumbnail: string;
  caption: string;
  likes: number;
  comments: number;
  shares: number;
  timestamp: string;
  song?: string;
  views: number;
}
