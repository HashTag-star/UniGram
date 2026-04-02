import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  Image, StyleSheet, KeyboardAvoidingView, Platform, ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CURRENT_USER, MOCK_CONVERSATIONS } from '../data/mockData';
import { Conversation, Message } from '../data/types';
import { VerifiedBadge } from '../components/VerifiedBadge';

const MOCK_THREAD: Message[] = [
  { id: 'm1', senderId: 'u2', text: 'Hey!! 👋', timestamp: '2:45 PM', read: true },
  { id: 'm2', senderId: 'u1', text: 'Hey Sarah! What\'s up?', timestamp: '2:46 PM', read: true },
  { id: 'm3', senderId: 'u2', text: 'Did you see the hackathon results? 🎉', timestamp: '2:47 PM', read: true },
  { id: 'm4', senderId: 'u2', text: 'Team Apollo won!!', timestamp: '2:47 PM', read: true },
  { id: 'm5', senderId: 'u1', text: 'WAIT no way!! That\'s insane 🔥', timestamp: '2:48 PM', read: true },
  { id: 'm6', senderId: 'u2', text: 'Are you free tonight to celebrate? 😊', timestamp: '2m ago', read: false },
];

const ConversationList: React.FC<{ onPress: (conv: Conversation) => void }> = ({ onPress }) => (
  <View style={styles.container}>
    <View style={styles.listHeader}>
      <Text style={styles.listTitle}>{CURRENT_USER.username}</Text>
      <TouchableOpacity style={styles.composeBtn}>
        <Ionicons name="create-outline" size={22} color="#fff" />
      </TouchableOpacity>
    </View>

    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 80 }}>
      {/* Active friends */}
      <View style={styles.activeFriends}>
        <Text style={styles.sectionLabel}>ACTIVE NOW</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingVertical: 8 }}>
          {MOCK_CONVERSATIONS.map(conv => {
            const user = conv.participants[0];
            return (
              <TouchableOpacity key={conv.id} style={styles.activeItem} onPress={() => onPress(conv)}>
                <View style={styles.activeAvatarWrap}>
                  <Image source={{ uri: user.avatar }} style={styles.activeAvatar} />
                  <View style={styles.onlineDot} />
                </View>
                <Text style={styles.activeUsername} numberOfLines={1}>{user.username}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Conversations */}
      <Text style={[styles.sectionLabel, { paddingHorizontal: 14, marginBottom: 4 }]}>
        MESSAGES <Text style={{ color: '#818cf8' }}>({MOCK_CONVERSATIONS.reduce((a, c) => a + c.unreadCount, 0)} new)</Text>
      </Text>
      {MOCK_CONVERSATIONS.map(conv => {
        const user = conv.participants[0];
        return (
          <TouchableOpacity key={conv.id} style={styles.convItem} onPress={() => onPress(conv)}>
            <View style={styles.convAvatarWrap}>
              <Image source={{ uri: user.avatar }} style={styles.convAvatar} />
              {conv.unreadCount > 0 && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadText}>{conv.unreadCount}</Text>
                </View>
              )}
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <View style={styles.convHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={[styles.convName, conv.unreadCount > 0 && { fontWeight: 'bold' }]}>
                    {conv.isGroup ? conv.groupName : user.fullName}
                  </Text>
                  {user.verified && <VerifiedBadge type={user.verificationType} size="sm" />}
                </View>
                <Text style={styles.convTime}>{conv.lastMessage.timestamp}</Text>
              </View>
              <Text style={[styles.convPreview, conv.unreadCount > 0 && { color: '#fff' }]} numberOfLines={1}>
                {conv.lastMessage.senderId === CURRENT_USER.id ? 'You: ' : ''}{conv.lastMessage.text}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  </View>
);

const ChatView: React.FC<{ conv: Conversation; onBack: () => void }> = ({ conv, onBack }) => {
  const [messages, setMessages] = useState<Message[]>(MOCK_THREAD);
  const [text, setText] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const user = conv.participants[0];

  const send = () => {
    if (!text.trim()) return;
    setMessages(prev => [...prev, {
      id: `m_${Date.now()}`,
      senderId: CURRENT_USER.id,
      text: text.trim(),
      timestamp: 'Just now',
      read: false,
    }]);
    setText('');
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* Header */}
      <View style={styles.chatHeader}>
        <TouchableOpacity onPress={onBack} style={styles.chatBack}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.chatHeaderUser}>
          <View style={{ position: 'relative' }}>
            <Image source={{ uri: user.avatar }} style={styles.chatAvatar} />
            <View style={styles.chatOnlineDot} />
          </View>
          <View style={{ marginLeft: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={styles.chatName}>{user.fullName}</Text>
              {user.verified && <VerifiedBadge type={user.verificationType} size="sm" />}
            </View>
            <Text style={styles.chatStatus}>Active now</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <TouchableOpacity style={styles.chatAction}><Ionicons name="call-outline" size={20} color="rgba(255,255,255,0.6)" /></TouchableOpacity>
          <TouchableOpacity style={styles.chatAction}><Ionicons name="videocam-outline" size={20} color="rgba(255,255,255,0.6)" /></TouchableOpacity>
        </View>
      </View>

      {/* Messages */}
      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 14, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={{ alignItems: 'center', marginBottom: 20 }}>
          <Image source={{ uri: user.avatar }} style={{ width: 64, height: 64, borderRadius: 32 }} />
          <Text style={styles.chatIntroName}>{user.fullName}</Text>
          {user.verified && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <VerifiedBadge type={user.verificationType} size="sm" />
              <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>Verified</Text>
            </View>
          )}
          <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 2 }}>{user.university}</Text>
        </View>

        {messages.map((msg, i) => {
          const isMe = msg.senderId === CURRENT_USER.id;
          return (
            <View key={msg.id} style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowThem]}>
              {!isMe && (
                <Image source={{ uri: user.avatar }} style={styles.msgAvatar} />
              )}
              <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
                <Text style={[styles.bubbleText, isMe && { color: '#fff' }]}>{msg.text}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Input */}
      <View style={styles.inputRow}>
        <TouchableOpacity style={styles.inputIcon}><Ionicons name="image-outline" size={22} color="rgba(255,255,255,0.4)" /></TouchableOpacity>
        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Message..."
            placeholderTextColor="rgba(255,255,255,0.3)"
            returnKeyType="send"
            onSubmitEditing={send}
          />
          <TouchableOpacity><Ionicons name="happy-outline" size={18} color="rgba(255,255,255,0.3)" /></TouchableOpacity>
        </View>
        <TouchableOpacity
          onPress={send}
          style={[styles.sendBtn, text.trim() && styles.sendBtnActive]}
        >
          <Ionicons name="send" size={18} color={text.trim() ? '#fff' : 'rgba(255,255,255,0.2)'} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

export const MessagesScreen: React.FC = () => {
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  if (activeConv) return <ChatView conv={activeConv} onBack={() => setActiveConv(null)} />;
  return <ConversationList onPress={setActiveConv} />;
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  listTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  composeBtn: { padding: 4 },
  sectionLabel: { fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: 'bold', letterSpacing: 1.5, marginBottom: 8 },
  activeFriends: { paddingLeft: 14, marginBottom: 16 },
  activeItem: { alignItems: 'center', gap: 4, width: 56 },
  activeAvatarWrap: { position: 'relative' },
  activeAvatar: { width: 52, height: 52, borderRadius: 26 },
  onlineDot: { position: 'absolute', bottom: 1, right: 1, width: 12, height: 12, borderRadius: 6, backgroundColor: '#22c55e', borderWidth: 2, borderColor: '#000' },
  activeUsername: { fontSize: 10, color: 'rgba(255,255,255,0.5)', textAlign: 'center' },
  convItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10 },
  convAvatarWrap: { position: 'relative' },
  convAvatar: { width: 52, height: 52, borderRadius: 26 },
  unreadBadge: { position: 'absolute', top: -2, right: -2, width: 18, height: 18, borderRadius: 9, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#000' },
  unreadText: { color: '#fff', fontSize: 9, fontWeight: 'bold' },
  convHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  convName: { fontSize: 14, fontWeight: '600', color: '#fff' },
  convTime: { fontSize: 10, color: 'rgba(255,255,255,0.3)' },
  convPreview: { fontSize: 12, color: 'rgba(255,255,255,0.4)' },
  // Chat
  chatHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  chatBack: { padding: 4, marginRight: 6 },
  chatHeaderUser: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  chatAvatar: { width: 36, height: 36, borderRadius: 18 },
  chatOnlineDot: { position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: 5, backgroundColor: '#22c55e', borderWidth: 2, borderColor: '#000' },
  chatName: { fontSize: 14, fontWeight: 'bold', color: '#fff' },
  chatStatus: { fontSize: 11, color: '#22c55e' },
  chatAction: { padding: 8 },
  chatIntroName: { fontSize: 16, fontWeight: 'bold', color: '#fff', marginTop: 8 },
  msgRow: { flexDirection: 'row', marginBottom: 4, maxWidth: '80%' },
  msgRowMe: { alignSelf: 'flex-end' },
  msgRowThem: { alignSelf: 'flex-start', alignItems: 'flex-end', gap: 8 },
  msgAvatar: { width: 24, height: 24, borderRadius: 12 },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9, maxWidth: 280 },
  bubbleMe: { backgroundColor: '#4f46e5', borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: 'rgba(255,255,255,0.1)', borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 20 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  inputIcon: { padding: 4 },
  inputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 24, paddingHorizontal: 14, paddingVertical: 8, gap: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  input: { flex: 1, color: '#fff', fontSize: 14 },
  sendBtn: { padding: 8 },
  sendBtnActive: { backgroundColor: '#4f46e5', borderRadius: 20 },
});
