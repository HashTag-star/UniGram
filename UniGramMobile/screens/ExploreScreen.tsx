import React, { useState } from 'react';
import {
  View, Text, TextInput, ScrollView, Image, TouchableOpacity,
  FlatList, StyleSheet, Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MOCK_USERS, MOCK_POSTS, TRENDING_HASHTAGS } from '../data/mockData';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { User } from '../data/types';

const { width } = Dimensions.get('window');
const COL = (width - 3) / 3;

interface Props {
  onUserPress?: (user: User) => void;
}

export const ExploreScreen: React.FC<Props> = ({ onUserPress }) => {
  const [query, setQuery] = useState('');
  const searching = query.length > 0;

  const filteredUsers = MOCK_USERS.filter(u =>
    u.username.toLowerCase().includes(query.toLowerCase()) ||
    u.fullName.toLowerCase().includes(query.toLowerCase())
  );

  const filteredTags = TRENDING_HASHTAGS.filter(t =>
    t.tag.toLowerCase().includes(query.toLowerCase())
  );

  const gridImages = [1,2,3,4,5,6,7,8,9,10,11,12].map(i => `https://picsum.photos/seed/explore${i}/300/300`);

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color="rgba(255,255,255,0.4)" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search UniGram..."
          placeholderTextColor="rgba(255,255,255,0.3)"
          value={query}
          onChangeText={setQuery}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Ionicons name="close" size={16} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 80 }}>
        {searching ? (
          <>
            {/* People */}
            {filteredUsers.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>PEOPLE</Text>
                {filteredUsers.map(user => (
                  <TouchableOpacity key={user.id} style={styles.userRow} onPress={() => onUserPress?.(user)}>
                    <Image source={{ uri: user.avatar }} style={styles.userAvatar} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={styles.userName}>{user.username}</Text>
                        {user.verified && <VerifiedBadge type={user.verificationType} />}
                      </View>
                      <Text style={styles.userMeta}>{user.fullName} · {user.followers.toLocaleString()} followers</Text>
                    </View>
                    <TouchableOpacity style={styles.followBtn}>
                      <Text style={styles.followBtnText}>Follow</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {/* Hashtags */}
            {filteredTags.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>HASHTAGS</Text>
                {filteredTags.map(({ tag, posts }) => (
                  <TouchableOpacity key={tag} style={styles.tagRow}>
                    <View style={styles.tagIcon}>
                      <Ionicons name="pricetag" size={18} color="rgba(255,255,255,0.4)" />
                    </View>
                    <View>
                      <Text style={styles.tagText}>{tag}</Text>
                      <Text style={styles.tagMeta}>{posts} posts</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        ) : (
          <>
            {/* Suggested users */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>SUGGESTED FOR YOU</Text>
              {MOCK_USERS.slice(2, 5).map(user => (
                <TouchableOpacity key={user.id} style={styles.userRow} onPress={() => onUserPress?.(user)}>
                  <Image source={{ uri: user.avatar }} style={styles.userAvatar} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={styles.userName}>{user.username}</Text>
                      {user.verified && <VerifiedBadge type={user.verificationType} />}
                    </View>
                    <Text style={styles.userMeta}>{user.major} · {user.followers.toLocaleString()} followers</Text>
                  </View>
                  <TouchableOpacity style={styles.followBtn}>
                    <Text style={styles.followBtnText}>Follow</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </View>

            {/* Trending */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>TRENDING AT STANFORD</Text>
              {TRENDING_HASHTAGS.slice(0, 6).map(({ tag, posts }, i) => (
                <TouchableOpacity key={tag} style={styles.trendRow}>
                  <Text style={styles.trendNum}>{i + 1}</Text>
                  <View style={styles.hashIcon}>
                    <Ionicons name="pricetag-outline" size={16} color="#818cf8" />
                  </View>
                  <View>
                    <Text style={styles.trendTag}>{tag}</Text>
                    <Text style={styles.trendMeta}>{posts} posts</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            {/* Grid */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>EXPLORE</Text>
              <View style={styles.grid}>
                {gridImages.map((uri, i) => (
                  <TouchableOpacity key={i} style={[styles.gridItem, { width: COL, height: COL }]}>
                    <Image source={{ uri }} style={{ width: '100%', height: '100%' }} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 20,
    marginHorizontal: 14, marginVertical: 10, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  searchInput: { flex: 1, color: '#fff', fontSize: 14 },
  section: { marginBottom: 24, paddingHorizontal: 14 },
  sectionTitle: { fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: 'bold', letterSpacing: 1.5, marginBottom: 12 },
  userRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  userAvatar: { width: 44, height: 44, borderRadius: 22 },
  userName: { fontSize: 13, fontWeight: 'bold', color: '#fff' },
  userMeta: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 1 },
  followBtn: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5 },
  followBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  tagIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center' },
  tagText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  tagMeta: { color: 'rgba(255,255,255,0.4)', fontSize: 11 },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  trendNum: { color: 'rgba(255,255,255,0.2)', fontSize: 12, fontWeight: 'bold', width: 16, textAlign: 'right' },
  hashIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(99,102,241,0.1)', alignItems: 'center', justifyContent: 'center' },
  trendTag: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  trendMeta: { color: 'rgba(255,255,255,0.35)', fontSize: 11 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 1 },
  gridItem: { overflow: 'hidden' },
});
