/**
 * Hook all native methods in a specific library
 * Usage: frida -U -f com.example.app -l hook_native_methods.js --no-pause
 *
 * Configuration: Modify libName variable below to target specific library
 */

// Configuration
var libName = "libnative-lib.so"; // Change this to your target library
var maxHooks = 1000; // Limit number of hooks to prevent performance issues

if (Java.available) {
  Java.perform(function () {
    console.log("[*] Starting native method hooking");

    try {
      // Find the module
      var module = Process.findModuleByName(libName);
      if (!module) {
        console.log("[-] Module not found: " + libName);
        console.log("[*] Available modules:");
        Process.enumerateModules().forEach(function (mod) {
          console.log("    - " + mod.name);
        });
        return;
      }

      console.log("[+] Found module: " + libName + " at " + module.base);
      console.log("[+] Module size: " + module.size + " bytes");

      // Enumerate all exports
      var exports = Module.enumerateExportsSync(libName);
      console.log("[+] Found " + exports.length + " exports");

      var hookCount = 0;
      var errorCount = 0;

      // Hook all functions
      exports.forEach(function (exp) {
        if (exp.type === "function" && hookCount < maxHooks) {
          try {
            Interceptor.attach(exp.address, {
              onEnter: function (args) {
                console.log("[*] " + libName + "::" + exp.name);
                // Log first 4 arguments
                for (var i = 0; i < Math.min(4, args.length); i++) {
                  console.log("    arg[" + i + "]: " + args[i]);
                }
              },
              onLeave: function (retval) {
                console.log("    Return: " + retval);
              },
            });
            hookCount++;
          } catch (e) {
            errorCount++;
            console.log("[-] Failed to hook " + exp.name + ": " + e);
          }
        }
      });

      console.log("[*] Native method hooking complete");
      console.log("[+] Successfully hooked: " + hookCount + " functions");
      console.log("[-] Failed to hook: " + errorCount + " functions");

      if (hookCount === 0) {
        console.log("[!] No functions were hooked. Check library name.");
      }
    } catch (e) {
      console.log("[-] Error during native method hooking: " + e);
      console.log("[-] Stack trace: " + e.stack);
    }
  });
} else {
  console.log("[-] Java runtime not available");
  console.log("[*] This script requires Java runtime (attach to a Java process)");
}
