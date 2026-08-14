export type IntentType =
  | 'widget_create'
  | 'widget_select'
  | 'widget_delete'
  | 'widget_update'
  | 'theme_set'
  | 'context_set'
  | 'navigate'
  | 'app_set_theme'
  | 'ping';

export interface IntentPacket {
  type: IntentType;
  payload: Record<string, any>;
  source: 'terminal' | 'architect' | 'cli' | 'system';
  timestamp: string;
  id: string;
}

export function createIntent(
  type: IntentType,
  payload: Record<string, any>,
  source: IntentPacket['source'] = 'terminal'
): IntentPacket {
  return {
    type,
    payload,
    source,
    timestamp: new Date().toISOString(),
    id: `intent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  };
}
