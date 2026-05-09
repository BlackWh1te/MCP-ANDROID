/**
 * Hook Java methods in a specific class
 * Usage: frida -U -f com.example.app -l hook_java_methods.js --no-pause
 *
 * Configuration: Modify targetClass and targetMethods below
 */

// Configuration
var targetClass = "com.example.TargetClass"; // Change this to your target class
var targetMethods = ["sensitiveMethod", "encryptData", "validateUser"]; // Add methods you want to hook

if (Java.available) {
  Java.perform(function () {
    console.log("[*] Starting Java method hooking");

    try {
      var clazz = Java.use(targetClass);
      console.log("[+] Found class: " + targetClass);

      var hookCount = 0;
      var errorCount = 0;

      targetMethods.forEach(function (methodName) {
        try {
          if (clazz[methodName]) {
            var overloadCount = clazz[methodName].overloads.length;
            console.log("[*] Hooking method: " + methodName + " (" + overloadCount + " overloads)");

            clazz[methodName].overloads.forEach(function (overload) {
              overload.implementation = function () {
                console.log("[*] " + targetClass + "." + methodName);
                console.log("    Args: " + JSON.stringify(Array.from(arguments)));

                // Call original method
                var retval = this[methodName].apply(this, arguments);

                console.log("    Return: " + retval);
                return retval;
              };
              hookCount++;
            });
            console.log("[+] Hooked: " + methodName);
          } else {
            console.log("[-] Method not found: " + methodName);
            errorCount++;
          }
        } catch (e) {
          console.log("[-] Failed to hook " + methodName + ": " + e);
          errorCount++;
        }
      });

      console.log("[*] Java method hooking complete");
      console.log("[+] Successfully hooked: " + hookCount + " method overloads");
      console.log("[-] Failed to hook: " + errorCount + " " + targetMethods.length + " methods");

      if (hookCount === 0) {
        console.log("[!] No methods were hooked. Check class name and method names.");
        console.log("[*] Available methods in " + targetClass + ":");
        Object.keys(clazz.class.getDeclaredMethods()).forEach(function (method) {
          console.log("    - " + method);
        });
      }
    } catch (e) {
      console.log("[-] Error during Java method hooking: " + e);
      console.log("[-] Stack trace: " + e.stack);
      console.log("[*] Make sure the class exists and is loaded in the process");
    }
  });
} else {
  console.log("[-] Java runtime not available");
  console.log("[*] This script requires Java runtime (attach to a Java process)");
}
