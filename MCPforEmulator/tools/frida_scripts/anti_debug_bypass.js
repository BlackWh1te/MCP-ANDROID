/**
 * Anti-Debugging Detection Bypass
 * Bypasses common anti-debugging techniques in Android apps
 * Usage: frida -U -f com.example.app -l anti_debug_bypass.js --no-pause
 */

if (Java.available) {
  Java.perform(function () {
    console.log("[*] Starting anti-debugging bypass");

    try {
      // Bypass Debug.isDebuggerConnected()
      var Debug = Java.use("android.os.Debug");
      Debug.isDebuggerConnected.implementation = function () {
        console.log("[+] Bypassed Debug.isDebuggerConnected");
        return false;
      };

      // Bypass Debug.waitForDebugger
      Debug.waitForDebugger.implementation = function () {
        console.log("[+] Bypassed Debug.waitForDebugger");
        return;
      };

      // Bypass ApplicationInfo.FLAG_DEBUGGABLE
      try {
        var ApplicationInfo = Java.use("android.content.pm.ApplicationInfo");
        var flagsField = ApplicationInfo.class.getDeclaredField("flags");
        flagsField.setAccessible(true);

        var PackageManager = Java.use("android.content.pm.PackageManager");
        var GET_META_DATA = PackageManager.GET_META_DATA.value;

        var Context = Java.use("android.content.Context");
        var ActivityThread = Java.use("android.app.ActivityThread");
        var currentApplication = ActivityThread.currentApplication();
        var context = currentApplication.getApplicationContext();
        var packageManager = context.getPackageManager();
        var packageName = context.getPackageName();
        var applicationInfo = packageManager.getApplicationInfo(packageName, GET_META_DATA);

        var flags = flagsField.getInt(applicationInfo);
        flagsField.setInt(applicationInfo, flags & ~ApplicationInfo.FLAG_DEBUGGABLE.value);
        console.log("[+] Bypassed ApplicationInfo.FLAG_DEBUGGABLE");
      } catch (e) {
        console.log("[-] ApplicationInfo bypass failed: " + e);
      }

      // Bypass sys.fork() detection
      try {
        var Process = Java.use("android.os.Process");
        Process.myPid.implementation = function () {
          console.log("[+] Bypassed Process.myPid (returning fake PID)");
          return 12345; // Return fake PID
        };
      } catch (e) {
        console.log("[-] Process.myPid bypass failed: " + e);
      }

      // Bypass ptrace detection
      try {
        var libcModule = Process.findModuleByName("libc.so");
        if (libcModule) {
          var ptracePtr = Module.findExportByName("libc.so", "ptrace");
          if (ptracePtr) {
            Interceptor.attach(ptracePtr, {
              onEnter: function (args) {
                console.log("[+] Intercepted ptrace call");
                args[0] = 0; // PTRACE_TRACEME
              },
            });
            console.log("[+] Bypassed ptrace detection");
          }
        }
      } catch (e) {
        console.log("[-] ptrace bypass failed: " + e);
      }

      // Bypass /proc/self/status checks
      try {
        var File = Java.use("java.io.File");
        File.exists.implementation = function () {
          var path = this.getAbsolutePath();
          var statusFiles = ["/proc/self/status", "/proc/self/task", "/proc/self/stat", "/proc/self/maps"];

          for (var i = 0; i < statusFiles.length; i++) {
            if (path.indexOf(statusFiles[i]) !== -1) {
              console.log("[+] Bypassed File.exists for: " + path);
              return false;
            }
          }

          return this.exists();
        };
      } catch (e) {
        console.log("[-] File.exists bypass failed: " + e);
      }

      // Bypass /proc/self/wchan checks
      try {
        var BufferedReader = Java.use("java.io.BufferedReader");
        var FileReader = Java.use("java.io.FileReader");
        var InputStreamReader = Java.use("java.io.InputStreamReader");

        FileReader.$init.overload("java.lang.String").implementation = function (path) {
          if (path.indexOf("/proc/self/wchan") !== -1) {
            console.log("[+] Bypassed FileReader for /proc/self/wchan");
            // Return fake content
            return this.$init("/dev/null");
          }
          return this.$init(path);
        };
      } catch (e) {
        console.log("[-] FileReader bypass failed: " + e);
      }

      // Bypass Timing Attack Detection
      try {
        var System = Java.use("java.lang.System");
        var currentTime = System.currentTimeMillis;
        var lastTime = currentTime();
        var callCount = 0;

        System.nanoTime.implementation = function () {
          var now = currentTime();
          var diff = now - lastTime;

          // Normalize timing to avoid detection
          if (diff < 1000) {
            callCount++;
            if (callCount > 10) {
              // Add random jitter
              var jitter = Math.floor(Math.random() * 1000000);
              return now + jitter;
            }
          } else {
            callCount = 0;
            lastTime = now;
          }

          return now;
        };
      } catch (e) {
        console.log("[-] Timing bypass failed: " + e);
      }

      // Bypass DroidGuard
      try {
        var DroidGuard = Java.use("com.google.android.gms.common.internal.DroidGuard");
        if (DroidGuard) {
          DroidGuard.init.implementation = function (context) {
            console.log("[+] Bypassed DroidGuard.init");
            return;
          };
        }
      } catch (e) {
        console.log("[-] DroidGuard bypass failed: " + e);
      }

      // Bypass SafetyNet
      try {
        var SafetyNet = Java.use("com.google.android.gms.safetynet.SafetyNet");
        if (SafetyNet) {
          var SafetyNetHelper = Java.use("com.google.android.gms.safetynet.SafetyNetHelper");
          SafetyNetHelper.verifyWithRecaptcha.implementation = function (context, siteKey, nonce) {
            console.log("[+] Bypassed SafetyNet verification");
            // Return fake success response
            var SafetyNetResponse = Java.use("com.google.android.gms.safetynet.SafetyNetApi$SafetyNetResponse");
            return SafetyNetResponse.$new();
          };
        }
      } catch (e) {
        console.log("[-] SafetyNet bypass failed: " + e);
      }

      console.log("[*] Anti-debugging bypass complete");
    } catch (e) {
      console.log("[-] Error during anti-debugging bypass: " + e);
    }
  });
} else {
  console.log("[-] Java runtime not available");
}
