/** The messages shared between tabs. No browser objects cross this boundary. */
export type TabMessage =
  | { type: 'hello' | 'presence'; senderId: string; isMain: boolean }
  | { type: 'main' | 'bye'; senderId: string }
  | {
      type: 'data';
      senderId: string;
      targetId: string;
      id: string;
      value: string;
    }
  | { type: 'ack'; senderId: string; targetId: string; id: string };

/** TypeScript cannot validate data arriving from another tab at runtime. */
export function isTabMessage(value: unknown): value is TabMessage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const message = value as Record<string, unknown>;

  if (typeof message.senderId !== 'string') {
    return false;
  }

  switch (message.type) {
    case 'hello':
    case 'presence':
      return typeof message.isMain === 'boolean';
    case 'main':
    case 'bye':
      return true;
    case 'data':
      return (
        typeof message.targetId === 'string' &&
        typeof message.id === 'string' &&
        typeof message.value === 'string'
      );
    case 'ack':
      return (
        typeof message.targetId === 'string' && typeof message.id === 'string'
      );
    default:
      return false;
  }
}
