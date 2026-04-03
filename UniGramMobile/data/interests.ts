export interface Interest {
  id: string;
  label: string;
  emoji: string;
  category: string;
  hashtag: string;
}

export const INTERESTS: Interest[] = [
  // Academics
  { id: 'cs', label: 'Computer Science', emoji: '💻', category: 'Academics', hashtag: '#CS' },
  { id: 'engineering', label: 'Engineering', emoji: '⚙️', category: 'Academics', hashtag: '#Engineering' },
  { id: 'medicine', label: 'Medicine', emoji: '🩺', category: 'Academics', hashtag: '#Medicine' },
  { id: 'law', label: 'Law', emoji: '⚖️', category: 'Academics', hashtag: '#Law' },
  { id: 'business', label: 'Business', emoji: '📊', category: 'Academics', hashtag: '#Business' },
  { id: 'design', label: 'Design', emoji: '🎨', category: 'Academics', hashtag: '#Design' },
  { id: 'research', label: 'Research', emoji: '🔬', category: 'Academics', hashtag: '#Research' },
  { id: 'math', label: 'Mathematics', emoji: '📐', category: 'Academics', hashtag: '#Math' },
  // Tech
  { id: 'ai', label: 'AI & ML', emoji: '🤖', category: 'Tech', hashtag: '#AI' },
  { id: 'startup', label: 'Startups', emoji: '🚀', category: 'Tech', hashtag: '#Startup' },
  { id: 'web3', label: 'Web3 & Crypto', emoji: '⛓️', category: 'Tech', hashtag: '#Web3' },
  { id: 'cybersec', label: 'Cybersecurity', emoji: '🔐', category: 'Tech', hashtag: '#CyberSec' },
  { id: 'gaming', label: 'Gaming', emoji: '🎮', category: 'Tech', hashtag: '#Gaming' },
  // Sports
  { id: 'basketball', label: 'Basketball', emoji: '🏀', category: 'Sports', hashtag: '#Basketball' },
  { id: 'soccer', label: 'Soccer', emoji: '⚽', category: 'Sports', hashtag: '#Soccer' },
  { id: 'fitness', label: 'Fitness', emoji: '💪', category: 'Sports', hashtag: '#Fitness' },
  { id: 'tennis', label: 'Tennis', emoji: '🎾', category: 'Sports', hashtag: '#Tennis' },
  { id: 'swimming', label: 'Swimming', emoji: '🏊', category: 'Sports', hashtag: '#Swimming' },
  { id: 'esports', label: 'Esports', emoji: '🏆', category: 'Sports', hashtag: '#Esports' },
  // Arts & Culture
  { id: 'music', label: 'Music', emoji: '🎵', category: 'Arts', hashtag: '#Music' },
  { id: 'photography', label: 'Photography', emoji: '📸', category: 'Arts', hashtag: '#Photography' },
  { id: 'film', label: 'Film & Cinema', emoji: '🎬', category: 'Arts', hashtag: '#Film' },
  { id: 'art', label: 'Visual Art', emoji: '🖼️', category: 'Arts', hashtag: '#Art' },
  { id: 'writing', label: 'Writing', emoji: '✍️', category: 'Arts', hashtag: '#Writing' },
  { id: 'dance', label: 'Dance', emoji: '💃', category: 'Arts', hashtag: '#Dance' },
  // Lifestyle
  { id: 'food', label: 'Food & Cooking', emoji: '🍜', category: 'Lifestyle', hashtag: '#Food' },
  { id: 'travel', label: 'Travel', emoji: '✈️', category: 'Lifestyle', hashtag: '#Travel' },
  { id: 'fashion', label: 'Fashion', emoji: '👗', category: 'Lifestyle', hashtag: '#Fashion' },
  { id: 'mental', label: 'Mental Wellness', emoji: '🧘', category: 'Lifestyle', hashtag: '#MentalHealth' },
  { id: 'environment', label: 'Sustainability', emoji: '🌱', category: 'Lifestyle', hashtag: '#Sustainability' },
  // Social
  { id: 'politics', label: 'Politics', emoji: '🗳️', category: 'Social', hashtag: '#Politics' },
  { id: 'volunteering', label: 'Volunteering', emoji: '🤝', category: 'Social', hashtag: '#Volunteering' },
  { id: 'entrepreneur', label: 'Entrepreneurship', emoji: '💡', category: 'Social', hashtag: '#Entrepreneur' },
  { id: 'diversity', label: 'Diversity & Inclusion', emoji: '🌈', category: 'Social', hashtag: '#Diversity' },
];

export const INTEREST_CATEGORIES = [...new Set(INTERESTS.map(i => i.category))];
