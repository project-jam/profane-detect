export interface ProfaneDetectOptions {
    bannedWords?: string[];
    homoglyphMapping?: Record<string, string>;
    safeWords?: string[];
    caseSensitive?: boolean;
}
export interface DetectionResult {
    found: boolean;
    matches: string[];
    normalized?: string;
    metrics?: {
        exactMatches: number;
        fuzzyMatches: number;
        totalChecked: number;
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
    };
}
