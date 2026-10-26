import AsyncStorage from '@react-native-async-storage/async-storage';

const seenThisSession = new Set<string>();
const key = (userId: string) => `ssaida.help.backlog.v1:${userId}`;

export async function hasSeenBacklogHelp(userId: string) {
  if (seenThisSession.has(userId)) return true;
  try {
    return (await AsyncStorage.getItem(key(userId))) === 'seen';
  } catch {
    // Help storage must never prevent use of the study list.
    return false;
  }
}

export async function markBacklogHelpSeen(userId: string) {
  seenThisSession.add(userId);
  try {
    await AsyncStorage.setItem(key(userId), 'seen');
  } catch {
    // Avoid repeating the automatic prompt in this session even if disk storage fails.
  }
}
