
import React, { useState } from 'react';
import { BookOpen, Users, MessageSquare, Search, ChevronRight, Plus, Pin, TrendingUp, Bell } from 'lucide-react';
import { CourseThread, StudyGroup } from '../types';
import { MOCK_COURSES, MOCK_STUDY_GROUPS, MOCK_USERS } from '../constants';

const colorMap: Record<string, string> = {
  indigo: 'from-indigo-600 to-indigo-800 border-indigo-500/30',
  purple: 'from-purple-600 to-purple-800 border-purple-500/30',
  green: 'from-green-600 to-green-800 border-green-500/30',
  yellow: 'from-yellow-600 to-yellow-800 border-yellow-500/30',
  pink: 'from-pink-600 to-pink-800 border-pink-500/30',
  orange: 'from-orange-600 to-orange-800 border-orange-500/30',
};

const bgMap: Record<string, string> = {
  indigo: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  green: 'bg-green-500/10 text-green-400 border-green-500/20',
  yellow: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  pink: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
  orange: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
};

type Tab = 'my-courses' | 'all-courses' | 'study-groups';

interface CoursesCommunityProps {
  courses: CourseThread[];
  studyGroups: StudyGroup[];
}

const PINNED_POSTS = [
  { id: 'pp1', courseCode: 'CS229', text: 'Midterm review session Friday 3-5pm at Gates B03 🎯', author: MOCK_USERS[2], pinned: true },
  { id: 'pp2', courseCode: 'CS106B', text: 'Assignment 4 due next Monday — don\'t forget the extra credit!', author: MOCK_USERS[1], pinned: true },
];

export const CoursesCommunity: React.FC<CoursesCommunityProps> = ({ courses, studyGroups }) => {
  const [activeTab, setActiveTab] = useState<Tab>('my-courses');
  const [search, setSearch] = useState('');
  const [joinedCourses, setJoinedCourses] = useState<Set<string>>(new Set(courses.filter(c => c.isJoined).map(c => c.id)));
  const [joinedGroups, setJoinedGroups] = useState<Set<string>>(new Set(studyGroups.filter(g => g.isJoined).map(g => g.id)));
  const [activeCourse, setActiveCourse] = useState<CourseThread | null>(null);

  const filteredCourses = courses.filter(c =>
    c.courseName.toLowerCase().includes(search.toLowerCase()) ||
    c.courseCode.toLowerCase().includes(search.toLowerCase()) ||
    c.department.toLowerCase().includes(search.toLowerCase())
  );

  const myCourses = filteredCourses.filter(c => joinedCourses.has(c.id));

  if (activeCourse) {
    return (
      <div className="max-w-xl mx-auto pb-24">
        {/* Course header */}
        <div className={`bg-gradient-to-br ${colorMap[activeCourse.color]} border-b p-5 relative overflow-hidden`}>
          <button
            onClick={() => setActiveCourse(null)}
            className="text-white/70 hover:text-white text-sm mb-4 flex items-center gap-1 transition-colors"
          >
            ← Back
          </button>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-white/70 text-xs font-semibold uppercase tracking-wider">{activeCourse.courseCode}</p>
              <h2 className="text-xl font-bold text-white mt-1">{activeCourse.courseName}</h2>
              <p className="text-white/60 text-xs mt-1">{activeCourse.department} • {activeCourse.professor}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-1 bg-black/20 rounded-full px-2 py-1">
                <Users className="w-3 h-3 text-white/70" />
                <span className="text-white/70 text-xs">{activeCourse.members}</span>
              </div>
              <button className="bg-black/20 hover:bg-black/30 rounded-full p-1.5 transition-colors">
                <Bell className="w-4 h-4 text-white/70" />
              </button>
            </div>
          </div>
        </div>

        {/* Pinned posts */}
        {PINNED_POSTS.filter(p => p.courseCode === activeCourse.courseCode).map(post => (
          <div key={post.id} className="mx-4 mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Pin className="w-3.5 h-3.5 text-yellow-400" />
              <span className="text-yellow-400 text-xs font-semibold">Pinned</span>
            </div>
            <div className="flex items-center gap-2">
              <img src={post.author.avatar} className="w-7 h-7 rounded-full object-cover" />
              <div>
                <span className="text-xs font-bold">{post.author.username}</span>
                <p className="text-xs text-white/70 mt-0.5">{post.text}</p>
              </div>
            </div>
          </div>
        ))}

        {/* Discussion feed mock */}
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-white/40 uppercase tracking-wider">Discussion</p>
            <span className="text-xs text-indigo-400">{activeCourse.posts} posts</span>
          </div>
          {[
            { text: 'Can someone explain the backpropagation section from lecture 8? Really struggling with the chain rule part.', user: MOCK_USERS[0], time: '15m ago', likes: 8, replies: 4 },
            { text: 'Office hours moved to Thursday this week for midterm review. Prof Chen confirmed.', user: MOCK_USERS[2], time: '1h ago', likes: 34, replies: 12 },
            { text: 'My notes from last week\'s lecture are on Google Drive — link in my bio!', user: MOCK_USERS[4], time: '3h ago', likes: 67, replies: 3 },
          ].map((item, i) => (
            <div key={i} className="p-3 bg-white/3 border border-white/8 rounded-2xl">
              <div className="flex items-center gap-2 mb-2">
                <img src={item.user.avatar} className="w-8 h-8 rounded-full object-cover" />
                <div>
                  <span className="text-sm font-bold">{item.user.username}</span>
                  <p className="text-[10px] text-white/40">{item.time}</p>
                </div>
              </div>
              <p className="text-sm text-white/80 leading-relaxed">{item.text}</p>
              <div className="flex items-center gap-4 mt-2 pt-2 border-t border-white/5">
                <button className="flex items-center gap-1 text-white/40 hover:text-white/70 transition-colors text-xs">
                  ❤️ {item.likes}
                </button>
                <button className="flex items-center gap-1 text-white/40 hover:text-white/70 transition-colors text-xs">
                  💬 {item.replies} replies
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Add post input */}
        <div className="fixed bottom-16 left-0 right-0 px-4 pb-3 bg-gradient-to-t from-black">
          <div className="flex items-center gap-2 bg-[#111] border border-white/10 rounded-full px-4 py-2.5">
            <img src="https://picsum.photos/seed/alex/200" className="w-6 h-6 rounded-full object-cover" />
            <input placeholder="Ask a question or share an update..." className="flex-1 bg-transparent text-sm focus:outline-none text-white/50" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto pb-24">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-indigo-400" />
          Courses
        </h2>
        <p className="text-white/40 text-xs mt-0.5">Connect with your classmates</p>
      </div>

      {/* Search */}
      <div className="px-4 mb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search courses..."
            className="w-full bg-white/5 border border-white/10 rounded-full py-2 pl-9 pr-3 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex px-4 gap-2 mb-4 border-b border-white/10 pb-0">
        {([
          { id: 'my-courses', label: 'My Courses' },
          { id: 'all-courses', label: 'Browse All' },
          { id: 'study-groups', label: 'Study Groups' },
        ] as { id: Tab; label: string }[]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-2 text-xs font-semibold transition-all border-b-2 -mb-[2px] whitespace-nowrap ${activeTab === tab.id ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-white/50 hover:text-white'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'my-courses' && (
        <div className="px-4 space-y-3">
          {myCourses.length === 0 ? (
            <div className="text-center py-12 text-white/30">
              <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-20" />
              <p>No courses joined yet</p>
              <button onClick={() => setActiveTab('all-courses')} className="text-indigo-400 text-sm mt-2 hover:underline">Browse courses</button>
            </div>
          ) : (
            myCourses.map(course => (
              <button
                key={course.id}
                onClick={() => setActiveCourse(course)}
                className="w-full flex items-center gap-3 p-3.5 bg-white/3 border border-white/8 hover:border-white/20 rounded-2xl transition-all text-left group"
              >
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${colorMap[course.color].split(' ')[0]} ${colorMap[course.color].split(' ')[1]} flex items-center justify-center flex-shrink-0`}>
                  <BookOpen className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${bgMap[course.color]}`}>{course.courseCode}</span>
                  </div>
                  <p className="font-bold text-sm mt-0.5 truncate">{course.courseName}</p>
                  <p className="text-[10px] text-white/40">{course.members} members • {course.posts} posts</p>
                </div>
                <ChevronRight className="w-4 h-4 text-white/30 group-hover:text-white/60 transition-colors" />
              </button>
            ))
          )}
        </div>
      )}

      {activeTab === 'all-courses' && (
        <div className="px-4 space-y-2">
          {filteredCourses.map(course => (
            <div key={course.id} className="flex items-center gap-3 p-3 bg-white/3 border border-white/8 rounded-2xl">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colorMap[course.color].split(' ')[0]} ${colorMap[course.color].split(' ')[1]} flex items-center justify-center flex-shrink-0`}>
                <BookOpen className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-sm">{course.courseCode}</span>
                  <span className={`text-[9px] border px-1 rounded ${bgMap[course.color]}`}>{course.department}</span>
                </div>
                <p className="text-xs text-white/60 truncate">{course.courseName}</p>
                <p className="text-[10px] text-white/30">{course.members} members</p>
              </div>
              <button
                onClick={() => setJoinedCourses(prev => {
                  const next = new Set(prev);
                  if (next.has(course.id)) next.delete(course.id); else next.add(course.id);
                  return next;
                })}
                className={`text-xs font-bold px-3 py-1.5 rounded-full transition-all ${joinedCourses.has(course.id) ? 'bg-white/10 text-white/60 hover:bg-red-500/20 hover:text-red-400' : 'bg-indigo-600 text-white hover:bg-indigo-500'}`}
              >
                {joinedCourses.has(course.id) ? 'Joined' : '+ Join'}
              </button>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'study-groups' && (
        <div className="px-4 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-white/40">Connect with classmates for group study</p>
            <button className="flex items-center gap-1 text-indigo-400 text-xs hover:text-indigo-300 transition-colors">
              <Plus className="w-3 h-3" /> Create
            </button>
          </div>
          {studyGroups.map(group => (
            <div key={group.id} className="p-4 bg-white/3 border border-white/8 rounded-2xl">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm">{group.name}</span>
                    <span className="text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-1.5 py-0.5 rounded">{group.courseCode}</span>
                  </div>
                  <p className="text-xs text-white/50 mt-1">{group.description}</p>
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-white/40">
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {group.members} members</span>
                    {group.nextMeeting && <span className="flex items-center gap-1 text-green-400">📅 {group.nextMeeting}</span>}
                  </div>
                </div>
                <button
                  onClick={() => setJoinedGroups(prev => {
                    const next = new Set(prev);
                    if (next.has(group.id)) next.delete(group.id); else next.add(group.id);
                    return next;
                  })}
                  className={`text-xs font-bold px-3 py-1.5 rounded-full transition-all flex-shrink-0 ${joinedGroups.has(group.id) ? 'bg-white/10 text-white/60' : 'bg-indigo-600 text-white hover:bg-indigo-500'}`}
                >
                  {joinedGroups.has(group.id) ? 'Joined ✓' : 'Join'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
