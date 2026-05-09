/**
 * Frida Script Helper Library
 * Common helper functions for Frida scripting
 * Usage: Include this script at the beginning of your script
 */

var Helpers = {
  // Memory operations
  memory: {
    readBytes: function (address, size) {
      try {
        return Memory.readByteArray(address, size);
      } catch (e) {
        console.log("[-] Failed to read memory at " + address + ": " + e);
        return null;
      }
    },

    readString: function (address, size) {
      try {
        return Memory.readUtf8String(ptr(address), size);
      } catch (e) {
        console.log("[-] Failed to read string at " + address + ": " + e);
        return null;
      }
    },

    writeBytes: function (address, data) {
      try {
        Memory.writeByteArray(ptr(address), data);
        return true;
      } catch (e) {
        console.log("[-] Failed to write memory at " + address + ": " + e);
        return false;
      }
    },

    scanPattern: function (address, size, pattern, maxResults) {
      try {
        var matches = [];
        var count = 0;

        Memory.scan(ptr(address), size, pattern, {
          onMatch: function (addr, size) {
            if (maxResults && count >= maxResults) {
              return "stop";
            }
            matches.push({ address: addr, size: size });
            count++;
          },
          onComplete: function () {},
        });

        return matches;
      } catch (e) {
        console.log("[-] Failed to scan memory: " + e);
        return [];
      }
    },

    hexdump: function (address, size) {
      try {
        return hexdump(ptr(address), { length: size });
      } catch (e) {
        console.log("[-] Failed to hexdump memory: " + e);
        return "";
      }
    },
  },

  // Module operations
  module: {
    findModule: function (name) {
      try {
        var module = Process.findModuleByName(name);
        if (module) {
          console.log("[+] Found module: " + name + " at " + module.base);
          return module;
        } else {
          console.log("[-] Module not found: " + name);
          return null;
        }
      } catch (e) {
        console.log("[-] Error finding module: " + e);
        return null;
      }
    },

    listModules: function () {
      try {
        return Process.enumerateModules();
      } catch (e) {
        console.log("[-] Error listing modules: " + e);
        return [];
      }
    },

    getExports: function (moduleName) {
      try {
        return Module.enumerateExportsSync(moduleName);
      } catch (e) {
        console.log("[-] Error getting exports: " + e);
        return [];
      }
    },

    getSymbols: function (moduleName) {
      try {
        return Module.enumerateSymbolsSync(moduleName);
      } catch (e) {
        console.log("[-] Error getting symbols: " + e);
        return [];
      }
    },
  },

  // Java operations
  java: {
    useClass: function (className) {
      if (!Java.available) {
        console.log("[-] Java runtime not available");
        return null;
      }

      try {
        return Java.use(className);
      } catch (e) {
        console.log("[-] Failed to load class " + className + ": " + e);
        return null;
      }
    },

    hookMethod: function (className, methodName, implementation) {
      if (!Java.available) {
        console.log("[-] Java runtime not available");
        return false;
      }

      try {
        var clazz = Java.use(className);

        if (clazz[methodName]) {
          clazz[methodName].overloads.forEach(function (overload) {
            overload.implementation = implementation;
          });
          console.log("[+] Hooked: " + className + "." + methodName);
          return true;
        } else {
          console.log("[-] Method not found: " + methodName);
          return false;
        }
      } catch (e) {
        console.log("[-] Failed to hook " + className + "." + methodName + ": " + e);
        return false;
      }
    },

    callMethod: function (className, methodName, args) {
      if (!Java.available) {
        console.log("[-] Java runtime not available");
        return null;
      }

      try {
        var clazz = Java.use(className);
        return clazz[methodName].apply(null, args);
      } catch (e) {
        console.log("[-] Failed to call " + className + "." + methodName + ": " + e);
        return null;
      }
    },

    listMethods: function (className) {
      if (!Java.available) {
        console.log("[-] Java runtime not available");
        return [];
      }

      try {
        var clazz = Java.use(className);
        return Object.keys(clazz.class.getDeclaredMethods());
      } catch (e) {
        console.log("[-] Failed to list methods: " + e);
        return [];
      }
    },
  },

  // Interceptor operations
  interceptor: {
    attach: function (target, callbacks) {
      try {
        Interceptor.attach(target, callbacks);
        console.log("[+] Attached to: " + target);
        return true;
      } catch (e) {
        console.log("[-] Failed to attach to " + target + ": " + e);
        return false;
      }
    },

    attachNative: function (moduleName, functionName, callbacks) {
      try {
        var address = Module.findExportByName(moduleName, functionName);
        if (address) {
          return this.attach(address, callbacks);
        } else {
          console.log("[-] Function not found: " + moduleName + "::" + functionName);
          return false;
        }
      } catch (e) {
        console.log("[-] Failed to attach native function: " + e);
        return false;
      }
    },

    replace: function (target, replacement) {
      try {
        Interceptor.replace(target, new NativeCallback(replacement, "void", []));
        console.log("[+] Replaced function at: " + target);
        return true;
      } catch (e) {
        console.log("[-] Failed to replace function: " + e);
        return false;
      }
    },
  },

  // Process operations
  process: {
    getCurrentThread: function () {
      try {
        return Process.getCurrentThread();
      } catch (e) {
        console.log("[-] Failed to get current thread: " + e);
        return null;
      }
    },

    enumerateThreads: function () {
      try {
        return Process.enumerateThreads();
      } catch (e) {
        console.log("[-] Failed to enumerate threads: " + e);
        return [];
      }
    },

    getPid: function () {
      try {
        return Process.id;
      } catch (e) {
        console.log("[-] Failed to get PID: " + e);
        return null;
      }
    },
  },

  // String operations
  string: {
    bytesToHex: function (bytes) {
      if (Array.isArray(bytes)) {
        return Array.from(bytes)
          .map(function (byte) {
            return ("0" + byte.toString(16)).substr(-2);
          })
          .join("");
      } else {
        return bytes;
      }
    },

    hexToBytes: function (hex) {
      var bytes = [];
      for (var i = 0; i < hex.length; i += 2) {
        bytes.push(parseInt(hex.substr(i, 2), 16));
      }
      return bytes;
    },

    isPrintable: function (str) {
      if (!str || str.length === 0) {
        return false;
      }

      var printableCount = 0;
      for (var i = 0; i < str.length; i++) {
        var code = str.charCodeAt(i);
        if ((code >= 32 && code <= 126) || code === 9 || code === 10 || code === 13) {
          printableCount++;
        }
      }

      return printableCount / str.length > 0.8;
    },
  },

  // File operations
  file: {
    read: function (path) {
      try {
        var File = Java.use("java.io.File");
        var FileReader = Java.use("java.io.FileReader");
        var BufferedReader = Java.use("java.io.BufferedReader");
        var InputStreamReader = Java.use("java.io.InputStreamReader");

        var reader = new BufferedReader(new InputStreamReader(new FileReader(path)));
        var line = "";
        var content = "";

        while ((line = reader.readLine()) != null) {
          content += line + "\n";
        }
        reader.close();

        return content;
      } catch (e) {
        console.log("[-] Failed to read file: " + path);
        return null;
      }
    },

    write: function (path, content) {
      try {
        var File = Java.use("java.io.File");
        var FileWriter = Java.use("java.io.FileWriter");

        var writer = new FileWriter(path);
        writer.write(content);
        writer.close();

        console.log("[+] Written to file: " + path);
        return true;
      } catch (e) {
        console.log("[-] Failed to write file: " + path);
        return false;
      }
    },

    exists: function (path) {
      try {
        var File = Java.use("java.io.File");
        return File(path).exists();
      } catch (e) {
        console.log("[-] Failed to check file existence: " + path);
        return false;
      }
    },
  },

  // Logging operations
  log: {
    info: function (message) {
      console.log("[INFO] " + message);
    },

    warn: function (message) {
      console.log("[WARN] " + message);
    },

    error: function (message) {
      console.log("[ERROR] " + message);
    },

    debug: function (message) {
      console.log("[DEBUG] " + message);
    },

    success: function (message) {
      console.log("[SUCCESS] " + message);
    },
  },
};

console.log("[*] Frida helpers library loaded");
