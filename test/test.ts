import { ProfaneDetect } from "../dist/index.js";

const detector = new ProfaneDetect({
  safeWords: ["assessment", "grass"], // example safe words
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
];

console.log("Basic Detection Tests:");
console.log("----------------------");

for (const text of testCases) {
  const result = detector.detect(text);
  console.log(`\nInput: "${text}"`);
  console.log(`Normalized: "${result.normalized}"`);
  console.log(`Contains profanity: ${result.found}`);
  if (result.found) {
    console.log(`Matched words: ${result.matches.join(", ")}`);
    console.log(`Metrics:`, result.metrics);
  }
}

console.log("\nJSON Output Tests:");
console.log("------------------");

// Test JSON output
for (const text of testCases) {
  const jsonResult = detector.toJson(text);
  console.log(`\nInput: "${text}"`);
  console.log(JSON.stringify(jsonResult, null, 2));
}
