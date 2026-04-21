let RTC: typeof import('react-native-webrtc');

try {
  RTC = require('react-native-webrtc');
} catch {
  const noop = () => {};
  const stub: any = new Proxy({}, { get: () => stub, apply: () => stub, construct: () => stub });
  RTC = {
    RTCPeerConnection: stub,
    RTCIceCandidate: stub,
    RTCSessionDescription: stub,
    mediaDevices: { getUserMedia: () => Promise.reject(new Error('WebRTC not available')) } as any,
    MediaStream: stub,
    RTCView: stub,
  } as any;
}

export const {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  mediaDevices,
  MediaStream,
  RTCView,
} = RTC;
