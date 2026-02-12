
import { User, Post, Story, Event, MarketItem, Confession, StudyGroup } from './types';

export const CURRENT_USER: User = {
  id: 'u1',
  username: 'alex_codes',
  fullName: 'Alex Johnson',
  avatar: 'https://picsum.photos/seed/alex/200',
  university: 'Stanford University',
  major: 'Computer Science',
  year: 2026,
  bio: 'Building the future, one commit at a time. 💻✨',
  verified: true,
  interests: ['Coding', 'AI', 'Basketball', 'Jazz']
};

export const MOCK_USERS: User[] = [
  {
    id: 'u2',
    username: 'sarah_bio',
    fullName: 'Sarah Miller',
    avatar: 'https://picsum.photos/seed/sarah/200',
    university: 'Stanford University',
    major: 'Biology',
    year: 2025,
    bio: 'Plant mom & aspiring doctor 🌿',
    verified: true,
    interests: ['Botany', 'Medicine', 'Hiking']
  },
  {
    id: 'u3',
    username: 'stanford_cs_club',
    fullName: 'Stanford CS Society',
    avatar: 'https://picsum.photos/seed/club/200',
    university: 'Stanford University',
    major: 'Club',
    year: 2024,
    bio: 'Official Stanford CS Club account. Stay updated with tech events! 🚀',
    verified: true,
    isClub: true,
    interests: ['Technology', 'Programming', 'Networking']
  }
];

export const MOCK_POSTS: Post[] = [
  {
    id: 'p1',
    userId: 'u2',
    user: MOCK_USERS[0],
    type: 'image',
    mediaUrl: 'https://picsum.photos/seed/post1/600/600',
    caption: 'Late night study sessions at the main library. Finals are coming! 📚☕️ #StanfordLife',
    likes: 124,
    comments: 18,
    timestamp: '2h ago',
    universityTag: 'Stanford University'
  },
  {
    id: 'p2',
    userId: 'u3',
    user: MOCK_USERS[1],
    type: 'image',
    mediaUrl: 'https://picsum.photos/seed/post2/600/600',
    caption: 'Hackathon winners announced! Congrats to Team Apollo for their amazing AI health app. 🏆✨',
    likes: 450,
    comments: 32,
    timestamp: '5h ago',
    universityTag: 'Stanford University'
  }
];

export const MOCK_STORIES: Story[] = [
  { id: 's1', userId: 'u1', user: CURRENT_USER, mediaUrl: 'https://picsum.photos/seed/s1/400/700', timestamp: '1h ago' },
  { id: 's2', userId: 'u2', user: MOCK_USERS[0], mediaUrl: 'https://picsum.photos/seed/s2/400/700', timestamp: '3h ago' },
  { id: 's3', userId: 'u3', user: MOCK_USERS[1], mediaUrl: 'https://picsum.photos/seed/s3/400/700', timestamp: '5h ago' }
];

export const MOCK_EVENTS: Event[] = [
  {
    id: 'e1',
    title: 'Spring Tech Symposium',
    description: 'A deep dive into Web3 and AI architectures.',
    date: 'Oct 15, 2024',
    location: 'Gates Computer Science Building',
    organizer: MOCK_USERS[1],
    attendees: 156,
    image: 'https://picsum.photos/seed/e1/600/300',
    category: 'Academic',
    isPromoted: true
  },
  {
    id: 'e2',
    title: 'Campus Musical Night',
    description: 'Featuring the university jazz band and local artists.',
    date: 'Oct 20, 2024',
    location: 'Memorial Auditorium',
    organizer: MOCK_USERS[0],
    attendees: 340,
    image: 'https://picsum.photos/seed/e2/600/300',
    category: 'Social'
  },
  {
    id: 'e3',
    title: 'Career Fair: FinTech',
    description: 'Meet top recruiters from leading fintech companies.',
    date: 'Oct 22, 2024',
    location: 'Student Union Hall',
    organizer: MOCK_USERS[1],
    attendees: 89,
    image: 'https://picsum.photos/seed/e3/600/300',
    category: 'Career'
  }
];

export const MOCK_STUDY_GROUPS: StudyGroup[] = [
  { id: 'g1', name: 'Algorithm Masters', courseCode: 'CS106B', members: 12, description: 'Practice for technical interviews.' },
  { id: 'g2', name: 'Bio Med Study Circle', courseCode: 'BIO200', members: 8, description: 'Weekly review of lab sessions.' }
];

export const MOCK_MARKET: MarketItem[] = [
  {
    id: 'm1',
    title: 'Cracking the Coding Interview - 6th Ed',
    price: 25,
    image: 'https://picsum.photos/seed/m1/400/400',
    category: 'books',
    seller: CURRENT_USER
  },
  {
    id: 'm2',
    title: 'Dell 27" 4K Monitor',
    price: 180,
    image: 'https://picsum.photos/seed/m2/400/400',
    category: 'gadgets',
    seller: MOCK_USERS[0]
  }
];

export const MOCK_CONFESSIONS: Confession[] = [
  { id: 'c1', text: "I still don't know where the psychology building is and I've been here for 3 years.", likes: 89, timestamp: '1h ago' },
  { id: 'c2', text: "The coffee at the library is actually better than the one at the student union, change my mind.", likes: 45, timestamp: '4h ago' }
];
