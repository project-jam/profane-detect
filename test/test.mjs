import { ProfaneDetect } from "../dist/index.js";

const detector = new ProfaneDetect();

const testCases = [
  "𝐟𝐮𝐜𝐤",
  "𝑓𝑢𝑐𝑘",
  "𝒇𝒖𝒄𝒌",
  "𝓯𝓾𝓬𝓴",
  "𝔣𝔲𝔠𝔨",
  "𝕗𝕦𝕔𝕜",
  "f.u.c.k",
  "f-u-c-k",
  "f_u_c_k",
  "ｆｕｃｋ",
  "f​u​c​k",
  "grass",
  "pass",
  "mass",
  "class",
  "assignment",
  "assessment",
  "massachusetts",
  "assassin",
  "nigga",
  "nfgga",
  "n𝔧gga",
  "ⓝⓘⓖⓖⓐ",
  "n̷i̷g̷g̷a̷",
  "n⸿gga",
  "fcktard",
  "fυcktard",
  "f*cktard",
  "What the f*ck!",
  "This is f*cking great",
  "Holy sh!t",
  "classification",
  "dckrder",
  "penis",
  "pEnis",
  "pᏂnis",
];

console.log("Profanity Detection Test Results:");
console.log("--------------------------------");

for (const text of testCases) {
  const result = detector.detect(text);
  console.log(`\nInput: "${text}"`);
  console.log(`Normalized: "${detector.normalize(text)}"`);
  console.log(`Contains profanity: ${result.found}`);
  if (result.found) {
    console.log(`Matched words: ${result.matches.join(", ")}`);
  }
}

console.log("\nHomoglyph Mapping Tests:");
console.log("----------------------");
const testChars = [
  "a",
  "α",
  "а",
  "ａ",
  "𝒂",
  "𝓪",
  "𝔞",
  "𝕒",
  "e",
  "е",
  "ε",
  "ｅ",
  "𝒆",
  "𝓮",
  "𝔢",
  "𝕖",
  "i",
  "і",
  "ι",
  "ｉ",
  "𝒊",
  "𝓲",
  "𝔦",
  "𝕚",
  "o",
  "о",
  "ο",
  "ｏ",
  "𝒐",
  "𝓸",
  "𝔬",
  "𝕠",
  "u",
  "υ",
  "ʋ",
  "ｕ",
  "𝒖",
  "𝓾",
  "𝔲",
  "𝕦",
];

for (const char of testChars) {
  console.log(`'${char}' -> '${detector.debugMapping(char)}'`);
}
