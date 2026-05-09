/**
 * Dump readable strings from process memory
 * Usage: frida -U -p <pid> -l dump_strings.js
 */

console.log("[*] Starting string dump from process memory");

// Configuration
var MIN_STRING_LENGTH = 4;
var MAX_STRINGS = 1000;
var MEMORY_REGIONS = ["r--", "rw-"]; // Readable regions

var strings = [];
var stringCount = 0;

console.log("[*] Scanning memory regions...");

Process.enumerateModules({
  onMatch: function (module) {
    console.log("[*] Scanning module: " + module.name + " at " + module.base);

    MEMORY_REGIONS.forEach(function (protection) {
      Process.enumerateRanges(protection, {
        base: module.base,
        size: module.size,
        onMatch: function (range) {
          try {
            Memory.scan(range.base, range.size, "??", {
              onMatch: function (address, size) {
                try {
                  // Read memory as UTF-8 string
                  var data = Memory.readUtf8String(address);

                  // Check if it's a printable string
                  if (isPrintableString(data, MIN_STRING_LENGTH)) {
                    if (stringCount < MAX_STRINGS) {
                      strings.push({
                        address: address,
                        string: data,
                        length: data.length,
                        module: module.name,
                      });
                      stringCount++;
                    }
                  }
                } catch (e) {
                  // Not a valid string, skip
                }
              },
              onComplete: function () {},
            });
          } catch (e) {
            // Skip regions that can't be read
          }
        },
        onComplete: function () {},
      });
    });
  },
  onComplete: function () {
    console.log("[+] String dump complete");
    console.log("[*] Found " + strings.length + " strings");

    // Print unique strings
    var uniqueStrings = {};
    strings.forEach(function (s) {
      var key = s.string;
      if (!uniqueStrings[key]) {
        uniqueStrings[key] = s;
      }
    });

    console.log("[*] Unique strings: " + Object.keys(uniqueStrings).length);

    // Print first 50 strings
    var count = 0;
    Object.values(uniqueStrings)
      .sort(function (a, b) {
        return a.string.localeCompare(b.string);
      })
      .forEach(function (s) {
        if (count < 50) {
          console.log(s.address + ": " + s.string);
          count++;
        }
      });

    if (strings.length > 50) {
      console.log("[*] ... and " + (strings.length - 50) + " more strings");
    }

    // Save to file
    try {
      var file = new File("/tmp/frida_strings_" + Process.id + ".txt");
      var writer = new FileWriter(file);
      Object.values(uniqueStrings)
        .sort(function (a, b) {
          return a.string.localeCompare(b.string);
        })
        .forEach(function (s) {
          writer.write(s.address + ": " + s.string + "\n");
        });
      writer.close();
      console.log("[+] Saved to: " + file.getAbsolutePath());
    } catch (e) {
      console.log("[-] Failed to save to file: " + e);
    }
  },
});

// Helper function to check if string is printable
function isPrintableString(str, minLength) {
  if (!str || str.length < minLength) {
    return false;
  }

  // Check if string is mostly printable ASCII
  var printableCount = 0;
  for (var i = 0; i < str.length; i++) {
    var code = str.charCodeAt(i);
    if ((code >= 32 && code <= 126) || code === 9 || code === 10 || code === 13) {
      printableCount++;
    }
  }

  return printableCount / str.length > 0.8;
}
