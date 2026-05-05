const STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

/**
 * Returns the ICE server list for RTCPeerConnection.
 * TURN credentials are read from EXPO_PUBLIC_TURN_* env vars — add them to .env
 * to enable relay (required on campus/mobile networks with strict NAT/firewalls).
 */
export function getIceServers(): object[] {
  const turnUrl = process.env.EXPO_PUBLIC_TURN_URL;
  const turnsUrl = process.env.EXPO_PUBLIC_TURNS_URL;
  const username = process.env.EXPO_PUBLIC_TURN_USERNAME;
  const credential = process.env.EXPO_PUBLIC_TURN_CREDENTIAL;

  if (!turnUrl || !username || !credential) return STUN_SERVERS;

  const turnServers: object[] = [
    { urls: turnUrl, username, credential },
  ];
  if (turnsUrl) {
    turnServers.push({ urls: turnsUrl, username, credential });
  }

  return [...STUN_SERVERS, ...turnServers];
}
