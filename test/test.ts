import { ProfaneDetect } from "../dist/index.js";

// Initialize with fast lookup
const detector = new ProfaneDetect({
  safeWords: ["assessment", "grass", "pie", "cream"],
  useFastLookup: true, // Enable fast lookup explicitly
});

// Test cases
const testCases = [
  "hello f*ck", // simple profanity
  "assessment", // safe word
  "ｆｕｃｋ", // fullwidth characters
  "sh!t", // substitution
  "nigga",
  "ja",
  "cat",
  "duck",
  "yippee",
  "nudes",
  "n1des",
  "pie", // whitelisted
  "cream", // whitelisted
  "pie cream", // multiple whitelisted
  "f*ck pie", // mixed content
  "cream f*ck", // mixed content
  "assessment pie cream", // all safe
  "mila",
  "bigtitties",
  "shɪt", // custom character
  "pornhub",
  "reggin", // reversed text
];

console.log("Fast Lookup Detection Tests:");
console.log("---------------------------");

for (const text of testCases) {
  console.log(`\nTesting: "${text}"`);

  // Test individual words first
  const words = text.split(/\s+/);
  console.log("Word-by-word check:");
  for (const word of words) {
    const status = detector.checkWord(word);
    console.log(`  "${word}": ${status.status} (${status.reason})`);
  }

  // Test full detection
  const result = detector.detect(text);
  console.log("\nFull text detection:");
  console.log(`Normalized: "${result.normalized}"`);
  console.log(`Contains profanity: ${result.found}`);
  if (result.found) {
    console.log(`Matched words: ${result.matches.join(", ")}`);
  }
  console.log("Metrics:", result.metrics);
}

console.log("\nWhitelist Tests:");
console.log("----------------");

// Test adding new words to whitelist
detector.addToWhitelist("cookie");
console.log('\nTesting after adding "cookie" to whitelist:');
console.log(detector.checkWord("cookie"));
console.log(detector.detect("cookie f*ck"));

console.log("\nPerformance Test:");
console.log("-----------------");

// Test repeated lookups to verify cache effectiveness
const startTime = performance.now();
for (let i = 0; i < 1000; i++) {
  detector.detect("pie cream assessment");
}
const endTime = performance.now();

console.log(
  `Time to process 1000 lookups: ${(endTime - startTime).toFixed(2)}ms`,
);
console.log(
  `Average per lookup: ${((endTime - startTime) / 1000).toFixed(3)}ms`,
);

// Test cache size
const jsonResult = detector.toJson("test");
console.log("\nCache Information:");
console.log(`Cache Size: ${jsonResult.config.cacheSizeBytes} bytes`);
console.log(`Using Fast Lookup: ${jsonResult.config.usingFastLookup}`);
console.log(`Total Safe Words: ${jsonResult.config.totalSafeWords}`);
console.log(`Total Banned Words: ${jsonResult.config.totalBannedWords}`);
