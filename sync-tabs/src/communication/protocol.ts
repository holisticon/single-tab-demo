/** The only inter-tab message is the payload sent to the existing primary. */
export interface TabMessage {
  type: 'message';
  value: string;
}

export function isTabMessage(value: unknown): value is TabMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'message' &&
    'value' in value &&
    typeof value.value === 'string'
  );
}
