import { useState, useEffect, useRef, useCallback } from "react";

interface Suggestion {
  category: "tech-stack" | "architecture" | "feature" | "implementation" | "pitfall";
  title: string;
  content: string;
}

interface UseSuggestionOptions {
  /** Delay in ms before fetching suggestions after hover starts (default: 800) */
  debounceMs?: number;
  /** Minimum hover duration before fetching (default: 500) */
  hoverMinMs?: number;
}

interface UseSuggestionReturn {
  suggestions: Suggestion[];
  isLoading: boolean;
  error: string | null;
  /** Call when hover starts */
  onHoverStart: () => void;
  /** Call when hover ends */
  onHoverEnd: () => void;
  /** Manually trigger a suggestion fetch */
  fetchSuggestions: () => Promise<void>;
  /** Clear current suggestions */
  clearSuggestions: () => void;
}

/**
 * Hook that fetches blueprint-level suggestions from the LLM.
 * Automatically debounces so rapid mouse movements don't spam the API.
 */
export function useBlueprintSuggestions(
  goal: string,
  purpose?: string,
  targetOS?: string,
  options?: UseSuggestionOptions
): UseSuggestionReturn {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoveringRef = useRef(false);
  const isFetchingRef = useRef(false);

  const { debounceMs = 800, hoverMinMs = 500 } = options ?? {};

  const clearTimers = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    hoverTimerRef.current = null;
    debounceTimerRef.current = null;
  }, []);

  const fetchSuggestions = useCallback(async () => {
    if (!goal || isFetchingRef.current) return;

    isFetchingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/blueprint/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: goal.trim(),
          purpose: purpose?.trim() || undefined,
          targetOS,
        }),
      });

      if (!res.ok) throw new Error(`Request failed (${res.status})`);

      const data = await res.json();
      setSuggestions(data.suggestions || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, [goal, purpose, targetOS]);

  const onHoverStart = useCallback(() => {
    isHoveringRef.current = true;

    // Wait a minimum hover duration before scheduling the fetch
    hoverTimerRef.current = setTimeout(() => {
      if (!isHoveringRef.current) return;

      // Debounce: only fetch if the user stays hovered for the debounce period
      debounceTimerRef.current = setTimeout(() => {
        if (isHoveringRef.current) {
          fetchSuggestions();
        }
      }, debounceMs);
    }, hoverMinMs);
  }, [fetchSuggestions, debounceMs, hoverMinMs]);

  const onHoverEnd = useCallback(() => {
    isHoveringRef.current = false;
    clearTimers();
  }, [clearTimers]);

  const clearSuggestions = useCallback(() => {
    setSuggestions([]);
    setError(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  return {
    suggestions,
    isLoading,
    error,
    onHoverStart,
    onHoverEnd,
    fetchSuggestions,
    clearSuggestions,
  };
}

/**
 * Hook that fetches node-specific implementation suggestions.
 */
export function useNodeSuggestion(
  nodeType: string,
  nodeLabel: string,
  nodeDescription: string,
  language: string | undefined,
  goal: string,
  purpose?: string,
  targetOS?: string
) {
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const isFetchingRef = useRef(false);

  const fetchSuggestion = useCallback(async () => {
    if (!goal || isFetchingRef.current || !nodeType) return;

    isFetchingRef.current = true;
    setIsLoading(true);

    try {
      const res = await fetch("/api/blueprint/suggest-node", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeType,
          nodeLabel,
          nodeDescription,
          language,
          goal,
          purpose,
          targetOS,
        }),
      });

      if (!res.ok) throw new Error(`Request failed (${res.status})`);

      const data = await res.json();
      const text = data.suggestions?.join("\n") || "No suggestions available.";
      setSuggestion(text);
    } catch {
      setSuggestion("Could not get suggestions. Check connection.");
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, [nodeType, nodeLabel, nodeDescription, language, goal, purpose, targetOS]);

  return { suggestion, isLoading, fetchSuggestion };
}
