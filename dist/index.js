import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
function loadHomoglyphMapping(filePath) {
    const mapping = {};
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
    for (const line of lines) {
        const chars = Array.from(line);
        if (chars.length > 0) {
            const base = chars.find((c) => c.trim()) || chars[0];
            chars.forEach((char) => {
                if (char.trim())
                    mapping[char] = base;
            });
        }
    }
    return mapping;
}
function loadWordList(path) {
    const content = fs.readFileSync(path, "utf-8");
    return JSON.parse(content);
}
const CHAR_MAPPING_PATH = path.join(__dirname, "../raw_data/chars.txt");
const WORDS_PATH = path.join(__dirname, "../raw_data/languages/en.json");
const WHITELIST_PATH = path.join(__dirname, "../raw_data/whitelist.json");
const defaultHomoglyphMapping = loadHomoglyphMapping(CHAR_MAPPING_PATH);
const defaultBannedWords = loadWordList(WORDS_PATH);
const defaultWhitelist = loadWordList(WHITELIST_PATH);
export class ProfaneDetect {
    constructor(options) {
        this.fastLookup = {};
        this.userWhitelist = new Set();
        this.normalizedBannedWords = new Map();
        this.normalizedWhitelist = new Set();
        this.lookupHits = 0;
        this.bannedWords = options?.bannedWords || defaultBannedWords;
        this.homoglyphMapping =
            options?.homoglyphMapping || defaultHomoglyphMapping;
        this.caseSensitive = options?.caseSensitive || false;
        this.useFastLookup = options?.useFastLookup !== false; // Enabled by default
        // Initialize caches
        this.initializeCaches(options?.safeWords);
    }
    initializeCaches(safeWords) {
        // Initialize fast lookup if enabled
        if (this.useFastLookup) {
            // Add default whitelist to fast lookup
            for (const word of defaultWhitelist) {
                const normalized = this.normalize(word);
                this.fastLookup[normalized] = {
                    status: "safe",
                    reason: "default whitelist",
                    originalWord: word,
                };
            }
            // Add banned words to fast lookup
            for (const word of this.bannedWords) {
                const normalized = this.normalize(word);
                this.fastLookup[normalized] = {
                    status: "banned",
                    reason: "banned word",
                    originalWord: word,
                };
            }
        }
        // Add user's custom safe words
        if (safeWords) {
            for (const word of safeWords) {
                const normalized = this.normalize(word);
                this.userWhitelist.add(normalized);
                if (this.useFastLookup) {
                    this.fastLookup[normalized] = {
                        status: "pass",
                        reason: "user whitelist",
                        originalWord: word,
                    };
                }
            }
        }
        // Initialize normalized caches for non-fast-lookup mode
        if (!this.useFastLookup) {
            for (const word of this.bannedWords) {
                const normalized = this.normalize(word);
                this.normalizedBannedWords.set(normalized, word);
            }
            for (const word of defaultWhitelist) {
                this.normalizedWhitelist.add(this.normalize(word));
            }
        }
    }
    normalize(text) {
        let normalized = text
            .normalize("NFD")
            .replace(/[\u0300-\u036F]/g, "") // Remove diacritics
            .replace(/[\u200B-\u200D\uFEFF]/g, "") // Remove invisible characters
            .replace(/[-_.*+!@#$%^&()]/g, ""); // Remove common obfuscation
        if (!this.caseSensitive) {
            normalized = normalized.toLowerCase();
        }
        return Array.from(normalized)
            .map((char) => this.homoglyphMapping[char] || char)
            .join("");
    }
    detect(text) {
        const normalizedText = this.normalize(text);
        const words = normalizedText.split(/\s+/);
        const matches = new Set();
        let whitelistedSkips = 0;
        let lookupHits = 0;
        for (const word of words) {
            if (!word)
                continue;
            if (this.useFastLookup) {
                // Fast lookup path
                const lookupResult = this.fastLookup[word];
                if (lookupResult) {
                    lookupHits++;
                    if (lookupResult.status === "banned") {
                        matches.add(lookupResult.originalWord || word);
                    }
                    else if (lookupResult.status === "safe" ||
                        lookupResult.status === "pass") {
                        whitelistedSkips++;
                        continue;
                    }
                }
                else {
                    // Add to cache for future
                    this.fastLookup[word] = { status: "safe", reason: "passed checks" };
                }
            }
            else {
                // Traditional path
                if (this.normalizedWhitelist.has(word)) {
                    whitelistedSkips++;
                    continue;
                }
                for (const [bannedNormalized, originalBanned] of this
                    .normalizedBannedWords) {
                    if (word === bannedNormalized) {
                        matches.add(originalBanned);
                        break;
                    }
                }
            }
        }
        return {
            found: matches.size > 0,
            matches: Array.from(matches),
            normalized: normalizedText,
            metrics: {
                exactMatches: matches.size,
                fuzzyMatches: 0,
                totalChecked: words.length,
                whitelistedSkips,
                lookupHits: this.useFastLookup ? lookupHits : undefined,
            },
        };
    }
    checkWord(word) {
        if (!this.useFastLookup) {
            throw new Error("Fast lookup is disabled. Enable it in constructor options.");
        }
        const normalized = this.normalize(word);
        // Check user whitelist
        if (this.userWhitelist.has(normalized)) {
            return { status: "pass", reason: "user whitelist" };
        }
        // Check fast lookup cache
        return (this.fastLookup[normalized] || {
            status: "safe",
            reason: "not found in cache",
        });
    }
    addToWhitelist(word) {
        const normalized = this.normalize(word);
        this.userWhitelist.add(normalized);
        if (this.useFastLookup) {
            this.fastLookup[normalized] = {
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
                cacheSizeBytes: this.useFastLookup
                    ? Buffer.from(JSON.stringify(this.fastLookup)).length
                    : undefined,
            },
        };
    }
    debugMapping(char) {
        const normalizedChar = this.caseSensitive ? char : char.toLowerCase();
        return this.homoglyphMapping[normalizedChar] || char;
    }
}
