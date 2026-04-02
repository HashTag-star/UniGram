
export type VerificationType = 'student' | 'professor' | 'club' | 'influencer' | 'staff';

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
  highlights?: Highlight[];
}

export interface Comment {
  id: string;
  userId: string;
  user: User;
  text: string;
  likes: number;
  timestamp: string;
  isLiked?: boolean;
  replies?: Comment[];
}

export interface Post {
  id: string;
  userId: string;
  user: User;
  type: 'image' | 'video' | 'reel' | 'thread';
  mediaUrl?: string;
  mediaUrls?: string[];
  caption: string;
  likes: number;
  comments: number;
  reposts: number;
  saves: number;
  timestamp: string;
  universityTag?: string;
  courseTag?: string;
  isLiked?: boolean;
  isSaved?: boolean;
  isReposted?: boolean;
  quotedPost?: Post;
  commentList?: Comment[];
  hashtags?: string[];
  views?: number;
  aspectRatio?: '1:1' | '4:5' | '16:9';
}

export interface Story {
  id: string;
  userId: string;
  user: User;
  mediaUrl: string;
  timestamp: string;
  viewed?: boolean;
  duration?: number;
  type?: 'image' | 'video';
  caption?: string;
}

export interface Highlight {
  id: string;
  title: string;
  coverImage: string;
  stories: Story[];
}

export type EventCategory = 'Social' | 'Academic' | 'Career' | 'Sports' | 'Workshop' | 'Club';

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
  category: EventCategory;
  isPromoted?: boolean;
  isRSVPd?: boolean;
  price?: number | 'free';
  maxAttendees?: number;
  tags?: string[];
}

export interface StudyGroup {
  id: string;
  name: string;
  courseCode: string;
  members: number;
  description: string;
  avatar?: string;
  isJoined?: boolean;
  nextMeeting?: string;
}

export type MarketCategory = 'books' | 'gadgets' | 'housing' | 'notes' | 'furniture' | 'clothing' | 'other';

export interface MarketItem {
  id: string;
  title: string;
  price: number;
  image: string;
  images?: string[];
  category: MarketCategory;
  seller: User;
  description?: string;
  condition?: 'new' | 'like-new' | 'good' | 'fair';
  postedAt?: string;
  isSaved?: boolean;
}

export interface Confession {
  id: string;
  text: string;
  likes: number;
  timestamp: string;
  isLiked?: boolean;
  replies?: number;
  tags?: string[];
}

export interface Recommendation {
  id: string;
  type: 'connection' | 'group' | 'event';
  title: string;
  subtitle: string;
  reason: string;
  imageUrl?: string;
}

export interface Message {
  id: string;
  senderId: string;
  text: string;
  timestamp: string;
  read: boolean;
  type?: 'text' | 'image' | 'post';
  imageUrl?: string;
}

export interface Conversation {
  id: string;
  participants: User[];
  lastMessage: Message;
  unreadCount: number;
  isGroup?: boolean;
  groupName?: string;
  groupAvatar?: string;
}

export type NotificationType = 'like' | 'comment' | 'follow' | 'mention' | 'repost' | 'event' | 'verification' | 'dm';

export interface Notification {
  id: string;
  type: NotificationType;
  user: User;
  text: string;
  timestamp: string;
  read: boolean;
  postImage?: string;
  postId?: string;
}

export interface VerificationRequest {
  id: string;
  userId: string;
  type: VerificationType;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;
  documents: string[];
  reason: string;
}

export interface CourseThread {
  id: string;
  courseCode: string;
  courseName: string;
  posts: number;
  members: number;
  isJoined: boolean;
  department: string;
  professor?: string;
  color: string;
}

export interface Reel {
  id: string;
  user: User;
  videoUrl: string;
  thumbnail: string;
  caption: string;
  likes: number;
  comments: number;
  shares: number;
  timestamp: string;
  isLiked?: boolean;
  isSaved?: boolean;
  song?: string;
  duration?: number;
  views: number;
}

export enum AppTab {
  FEED = 'feed',
  EXPLORE = 'explore',
  MARKET = 'market',
  EVENTS = 'events',
  COURSES = 'courses',
  PROFILE = 'profile',
  REELS = 'reels',
  CONFESSIONS = 'confessions',
  MESSAGES = 'messages',
}
