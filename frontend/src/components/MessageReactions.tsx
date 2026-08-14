import { useEffect, useState } from 'react';
import { api } from '../api/client';

type Reaction = '❤️' | '👍' | '😕' | '🚀' | '😡' | '😂' | '🤩';

const REACTIONS: Reaction[] = ['❤️', '👍', '😕', '🚀', '😡', '😂', '🤩'];

// localStorage keys — the cache/fallback only; the backend is the source of truth.
const CACHE_KEY = 'ai-reactions';
const USER_ID_KEY = 'vaia-reaction-user-id';

interface ReactionData {
  counts: Partial<Record<Reaction, number>>;
  user: Reaction | null;
}

interface ReactionsStore {
  [messageId: string]: ReactionData;
}

/**
 * Stable anonymous identity for this device. The backend has no auth, so each
 * client generates one id, keeps it in localStorage, and sends it with every
 * reaction — that's how un-react/switch semantics stay correct server-side.
 */
function getOrCreateUserId(): string {
  try {
    const existing = localStorage.getItem(USER_ID_KEY);
    if (existing) return existing;
    const id =
      (typeof crypto !== 'undefined' && crypto.randomUUID?.()) ||
      `u-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(USER_ID_KEY, id);
    return id;
  } catch {
    return `u-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function loadCache(): ReactionsStore {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function cacheLocally(messageId: string, data: ReactionData): void {
  try {
    const store = loadCache();
    store[messageId] = data;
    localStorage.setItem(CACHE_KEY, JSON.stringify(store));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

/** Mirror of the server toggle, used only for optimistic UI updates. */
function localToggle(data: ReactionData, emoji: Reaction): ReactionData {
  const counts = { ...data.counts };
  if (data.user === emoji) {
    const cur = (counts[emoji] ?? 0) - 1;
    if (cur > 0) counts[emoji] = cur;
    else delete counts[emoji];
    return { counts, user: null };
  }
  if (data.user) {
    const prev = (counts[data.user] ?? 0) - 1;
    if (prev > 0) counts[data.user] = prev;
    else delete counts[data.user];
  }
  counts[emoji] = (counts[emoji] ?? 0) + 1;
  return { counts, user: emoji };
}

interface Props {
  messageId: string;
}

export default function MessageReactions({ messageId }: Props) {
  const userId = getOrCreateUserId();

  // Paint instantly from the local cache, then let the server override it.
  const [data, setData] = useState<ReactionData>(() => {
    const store = loadCache();
    return store[messageId] || { counts: {}, user: null };
  });

  // Fetch the authoritative server state on mount (and whenever the message
  // or identity changes). If the backend is unreachable, keep the cache.
  useEffect(() => {
    let cancelled = false;
    api
      .getReactions(messageId, userId)
      .then((res) => {
        if (cancelled) return;
        const server = res.data?.data;
        if (server) {
          setData({
            counts: server.counts || {},
            user: server.user ?? null,
          });
        }
      })
      .catch(() => {
        // Backend unreachable — the cached state already shown is fine.
      });
    return () => {
      cancelled = true;
    };
  }, [messageId, userId]);

  const handleReact = (emoji: Reaction) => {
    // Optimistic update for instant feedback.
    const optimistic = localToggle(data, emoji);
    setData(optimistic);

    api
      .setReaction(messageId, emoji, userId)
      .then((res) => {
        const server = res.data?.data;
        if (server) {
          // Server is authoritative — use its counts (they may include other
          // users' reactions that landed between our fetch and this click).
          setData({
            counts: server.counts || {},
            user: server.user ?? null,
          });
        }
      })
      .catch(() => {
        // Backend unreachable — keep the optimistic state on this device.
        cacheLocally(messageId, optimistic);
      });
  };

  return (
    <div
      style={{
        display: 'flex',
        gap: 3,
        marginTop: 4,
        paddingLeft: 2,
        flexWrap: 'wrap',
      }}
    >
      {REACTIONS.map((emoji) => {
        const count = data.counts[emoji] ?? 0;
        const active = data.user === emoji;
        return (
          <button
            key={emoji}
            onClick={() => handleReact(emoji)}
            title={`React with ${emoji}`}
            style={{
              background: active ? 'rgba(255,255,255,0.15)' : 'transparent',
              border: '1px solid',
              borderColor: active ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)',
              borderRadius: 0,
              padding: '0 6px',
              cursor: 'pointer',
              fontSize: 13,
              lineHeight: '22px',
              color: active ? '#fff' : '#999',
              transition: 'all 0.15s ease',
              opacity: active || count > 0 ? 1 : 0.55,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = active ? 'rgba(255,255,255,0.15)' : 'transparent';
              e.currentTarget.style.borderColor = active ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)';
            }}
          >
            {emoji}
            {count > 0 && (
              <span style={{ fontSize: 10, marginLeft: 1, opacity: 0.8 }}>{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
