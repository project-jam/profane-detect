// src/types.ts

export interface ProfaneDetectOptions {
  /**
   * Custom list of banned words. Defaults to built-in word list.
   */
  bannedWords?: string[];
  /**
   * Homoglyph mapping for character normalization.
   */
  homoglyphMapping?: Record<string, string>;
  /**
   * Custom whitelist of safe words.
   */
  safeWords?: string[];
  /**
   * Treat text comparison as case-sensitive.
   * @default false
   */
  caseSensitive?: boolean;
  /**
   * Enable fast lookup cache for better performance.
   * @default true
   */
  useFastLookup?: boolean;
  /**
   * Enable checking reversed text (e.g., "kcuf" → "fuck").
   * @default false
   */
  useReversible?: boolean;
}

export interface WordStatus {
  /**
   * 'safe' = not found in banned list, 'banned' = found in banned list,
   * 'pass' = whitelisted.
   */
  status: "safe" | "banned" | "pass";
  /**
   * Reason for this status (e.g., 'user whitelist').
   */
  reason?: string;
  /**
   * Original word matched (for banned entries).
   */
  originalWord?: string;
}

export interface FastLookup {
  [word: string]: WordStatus;
}

export interface DetectionResult {
  /**
   * Whether any banned words were found.
   */
  found: boolean;
  /**
   * List of matched banned words.
   */
  matches: string[];
  /**
   * The fully normalized input text.
   */
  normalized?: string;
  /**
   * Various metrics about the detection run.
   */
  metrics?: {
    exactMatches: number;
    fuzzyMatches: number;
    totalChecked: number;
    whitelistedSkips: number;
    lookupHits?: number;
  };
}

export interface DetectionEntry {
  /**
   * The original input text.
   */
  input: string;
  /**
   * The detailed detection result.
   */
  result: DetectionResult;
  /**
   * Timestamp info when detection ran.
   */
  timestamp: {
    time: string;
    date: string;
    timezone: string;
  };
  /**
   * Configuration that was in effect.
   */
  config: {
    caseSensitive: boolean;
    totalSafeWords: number;
    totalBannedWords: number;
    totalWhitelisted: number;
    usingFastLookup: boolean;
    usingReversible: boolean;
    cacheSizeBytes?: number;
  };
}
