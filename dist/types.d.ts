export interface ProfaneDetectOptions {
    bannedWords?: string[];
    homoglyphMapping?: Record<string, string>;
    safeWords?: string[];
    caseSensitive?: boolean;
    /**
     * Enable fast lookup cache for better performance
     * @default true
     */
    useFastLookup?: boolean;
}
export interface WordStatus {
    status: "safe" | "banned" | "pass";
    reason?: string;
    originalWord?: string;
}
export interface FastLookup {
    [word: string]: WordStatus;
}
export interface DetectionResult {
    found: boolean;
    matches: string[];
    normalized?: string;
    metrics?: {
        exactMatches: number;
        fuzzyMatches: number;
        totalChecked: number;
        whitelistedSkips: number;
        lookupHits?: number;
    };
}
export interface DetectionEntry {
    input: string;
    result: DetectionResult;
    timestamp: {
        time: string;
        date: string;
        timezone: string;
    };
    config: {
        caseSensitive: boolean;
        totalSafeWords: number;
        totalBannedWords: number;
        totalWhitelisted: number;
        usingFastLookup: boolean;
        cacheSizeBytes?: number;
    };
}
