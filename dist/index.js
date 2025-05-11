import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
function loadHomoglyphMapping(filePath) {
    const mapping = {};
    const lines = fs
        .readFileSync(filePath, "utf-8")
        .split(/\r?\n/)
        .filter(Boolean);
    for (const line of lines) {
        const chars = Array.from(line);
        const base = chars.find((c) => c.trim()) || chars[0];
        for (const c of chars)
            if (c.trim())
                mapping[c] = base;
    }
    return mapping;
}
function loadWordList(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}
const CHAR_MAPPING_PATH = path.join(__dirname, "../raw_data/chars.txt");
const WORDS_PATH = path.join(__dirname, "../raw_data/languages/en.json");
const WHITELIST_PATH = path.join(__dirname, "../raw_data/whitelist.json");
const defaultHomoglyphMapping = loadHomoglyphMapping(CHAR_MAPPING_PATH);
const defaultBannedWords = loadWordList(WORDS_PATH);
const defaultWhitelist = loadWordList(WHITELIST_PATH);
// Leetspeak digit-to-letter mapping
const digitMap = {
    "0": "o",
    "1": "i",
    "3": "e",
    "4": "a",
    "5": "s",
    "7": "t",
};
export class ProfaneDetect {
    constructor(options) {
        this.fastLookup = {};
        this.userWhitelist = new Set();
        this.normalizedBannedWords = new Map();
        this.normalizedWhitelist = new Set();
        this.bannedWords = options?.bannedWords || defaultBannedWords;
        this.homoglyphMapping =
            options?.homoglyphMapping || defaultHomoglyphMapping;
        this.caseSensitive = options?.caseSensitive || false;
        this.useFastLookup = options?.useFastLookup !== false;
        this.initializeCaches(options?.safeWords);
    }
    initializeCaches(safeWords) {
        // Always populate normalizedBannedWords and normalizedWhitelist
        for (const w of this.bannedWords) {
            this.normalizedBannedWords.set(this.normalize(w), w);
        }
        for (const w of defaultWhitelist) {
            this.normalizedWhitelist.add(this.normalize(w));
        }
        if (this.useFastLookup) {
            // Populate fastLookup for default whitelist
            for (const w of defaultWhitelist) {
                this.fastLookup[this.normalize(w)] = {
                    status: "safe", // Default whitelist words are initially considered "safe"
                    reason: "default whitelist",
                    originalWord: w,
                };
            }
            // Populate fastLookup for banned words
            for (const w of this.bannedWords) {
                this.fastLookup[this.normalize(w)] = {
                    status: "banned",
                    reason: "banned word",
                    originalWord: w,
                };
            }
        }
        // Process user-provided safe words
        for (const w of safeWords || []) {
            const n = this.normalize(w);
            this.userWhitelist.add(n); // Add to userWhitelist set
            if (this.useFastLookup) {
                // If using fast lookup, override with "pass" status
                this.fastLookup[n] = {
                    status: "pass",
                    reason: "user whitelist",
                    originalWord: w,
                };
            }
        }
    }
    normalize(text) {
        let currentText = text;
        // 1. Initial préparation: case normalization, NFD, remove diacritics & zero-width chars
        if (!this.caseSensitive) {
            currentText = currentText.toLowerCase();
        }
        currentText = currentText
            .normalize("NFD")
            .replace(/[\u0300-\u036F]/g, "");
        currentText = currentText.replace(/[\u200B-\u200D\uFEFF]/g, "");
        // 2. Character-by-character processing
        let resultChars = [];
        for (const char of Array.from(currentText)) {
            let c = char; // Start with the character from the prepared string
            // Apply homoglyph mapping first
            // If !this.caseSensitive, c is already lowercase.
            // If this.caseSensitive, c is in its original case for homoglyph lookup.
            c = this.homoglyphMapping[c] || c;
            // Then, apply leetspeak digit-to-letter mapping to the result of homoglyph
            // digitMap expects keys like '0', '1', etc.
            if (digitMap[c]) {
                c = digitMap[c];
            }
            // 3. Filter to keep only actual letters (a-z, A-Z)
            // This ensures that after all transformations, only alphabetic characters remain.
            if (/[a-zA-Z]/.test(c)) {
                resultChars.push(c);
            }
        }
        return resultChars.join("");
    }
    detect(text) {
        const normalizedText = this.normalize(text);
        const words = normalizedText.split(/[^a-zA-Z0-9]+/).filter(Boolean);
        const detectedProfaneWords = new Set();
        let whitelistedSkips = 0;
        let lookupHits = 0;
        for (const currentWord of words) {
            let wordStatus;
            let isBannedBySubstring = false;
            let bestMatchOriginalBannedWord = "";
            let longestNormalizedBannedLength = 0;
            if (this.useFastLookup) {
                lookupHits++;
                const cachedEntry = this.fastLookup[currentWord];
                if (cachedEntry) {
                    wordStatus = cachedEntry;
                    if (cachedEntry.status === "banned") {
                        // If cached as banned, use this info directly
                        detectedProfaneWords.add(cachedEntry.originalWord || currentWord);
                        continue; // Move to the next word
                    }
                    else if (cachedEntry.status === "pass" || cachedEntry.status === "safe") {
                        whitelistedSkips++;
                        continue; // Word is whitelisted/safe by cache, move to the next word
                    }
                }
            }
            // If not resolved by cache, or cache not used:
            // 1. Check against whitelists (exact match for currentWord)
            if (this.userWhitelist.has(currentWord) || this.normalizedWhitelist.has(currentWord)) {
                whitelistedSkips++;
                if (this.useFastLookup && !wordStatus) { // Update cache only if not already handled
                    this.fastLookup[currentWord] = {
                        status: this.userWhitelist.has(currentWord) ? "pass" : "safe",
                        reason: this.userWhitelist.has(currentWord) ? "user whitelist" : "default whitelist",
                        originalWord: currentWord,
                    };
                }
                continue; // Word is whitelisted, skip to next word
            }
            // 2. Check for banned substrings if not whitelisted
            // Find the longest matching normalized banned word
            for (const [normalizedBanned, originalBanned,] of this.normalizedBannedWords) {
                if (currentWord.includes(normalizedBanned)) {
                    if (normalizedBanned.length > longestNormalizedBannedLength) {
                        longestNormalizedBannedLength = normalizedBanned.length;
                        bestMatchOriginalBannedWord = originalBanned;
                        isBannedBySubstring = true;
                    }
                }
                const reversedCurrentWord = currentWord.split("").reverse().join("");
                if (reversedCurrentWord.includes(normalizedBanned)) {
                    if (normalizedBanned.length > longestNormalizedBannedLength) {
                        longestNormalizedBannedLength = normalizedBanned.length;
                        bestMatchOriginalBannedWord = originalBanned;
                        isBannedBySubstring = true;
                    }
                }
            }
            if (isBannedBySubstring) {
                detectedProfaneWords.add(bestMatchOriginalBannedWord);
                if (this.useFastLookup && !wordStatus) { // Update cache if not already handled
                    this.fastLookup[currentWord] = {
                        status: "banned",
                        reason: "contains banned substring",
                        originalWord: bestMatchOriginalBannedWord,
                    };
                }
            }
            else if (this.useFastLookup && !wordStatus) { // Word is not whitelisted, not banned by substring
                this.fastLookup[currentWord] = {
                    status: "safe",
                    reason: "passed checks",
                };
            }
        }
        return {
            found: detectedProfaneWords.size > 0,
            matches: Array.from(detectedProfaneWords),
            normalized: normalizedText,
            metrics: {
                exactMatches: detectedProfaneWords.size,
                fuzzyMatches: 0,
                totalChecked: words.length,
                whitelistedSkips,
                lookupHits: this.useFastLookup ? lookupHits : undefined,
            },
        };
    }
    checkWord(word) {
        if (!this.useFastLookup)
            throw new Error("Fast lookup is disabled.");
        const n = this.normalize(word);
        if (this.userWhitelist.has(n))
            return { status: "pass", reason: "user whitelist" };
        return (this.fastLookup[n] || { status: "safe", reason: "not found in cache" });
    }
    addToWhitelist(word) {
        const n = this.normalize(word);
        this.userWhitelist.add(n);
        if (this.useFastLookup) {
            this.fastLookup[n] = {
                status: "pass",
                reason: "user added",
                originalWord: word,
            };
        }
    }
    toJson(text) {
        const result = this.detect(text);
        const now = new Date();
        return {
            input: text,
            result,
            timestamp: {
                time: now.toLocaleTimeString(),
                date: now.toLocaleDateString(),
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            },
            config: {
                caseSensitive: this.caseSensitive,
                totalSafeWords: this.userWhitelist.size,
                totalBannedWords: this.bannedWords.length,
                totalWhitelisted: defaultWhitelist.length,
                usingFastLookup: this.useFastLookup,
                usingReversible: true,
                cacheSizeBytes: this.useFastLookup
                    ? Buffer.from(JSON.stringify(this.fastLookup)).length
                    : undefined,
            },
        };
    }
    debugMapping(char) {
        const key = this.caseSensitive ? char : char.toLowerCase();
        return this.homoglyphMapping[key] || char;
    }
}
