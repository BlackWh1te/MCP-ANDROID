/**
 * Search for memory patterns in a process
 * Usage: frida -U -p <pid> -l memory_pattern_search.js
 */

console.log("[*] Starting memory pattern search");

// Define patterns to search for
var patterns = [
  {
    name: "String: Hello",
    pattern: "48 65 6c 6c 6f 00", // "Hello\0"
  },
  {
    name: "Integer: 12345",
    pattern: "39 30 00 00", // 12345 in little-endian
  },
  {
    name: "Float: 3.14",
    pattern: "?? ?? ?? ??", // Wildcard pattern
  },
];

// Search each pattern
patterns.forEach(function (patternInfo) {
  console.log("[*] Searching for: " + patternInfo.name);

  try {
    var matches = [];
    var maxMatches = 100; // Limit results

    Process.enumerateRanges("r--", {
      onMatch: function (range) {
        Memory.scan(range.base, range.size, patternInfo.pattern, {
          onMatch: function (address, size) {
            if (matches.length < maxMatches) {
              matches.push({
                address: address,
                size: size,
                range: range.base,
              });
            }
          },
          onComplete: function () {},
        });
      },
      onComplete: function () {
        console.log("[+] Found " + matches.length + " matches for " + patternInfo.name);
        matches.forEach(function (match) {
          console.log("    Address: " + match.address + " in range " + match.range);
        });
      },
    });
  } catch (e) {
    console.log("[-] Error searching for " + patternInfo.name + ": " + e);
  }
});

console.log("[*] Memory pattern search complete");
