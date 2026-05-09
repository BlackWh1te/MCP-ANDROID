/**
 * Hook file operations to monitor file access
 * Usage: frida -U -f com.example.app -l hook_file_operations.js --no-pause
 */

if (Java.available) {
  Java.perform(function () {
    console.log("[*] Starting file operation hooking");

    try {
      // Hook File class
      var File = Java.use("java.io.File");

      File.exists.implementation = function () {
        var path = this.getAbsolutePath();
        console.log("[*] File.exists: " + path);
        return this.exists();
      };

      File.canRead.implementation = function () {
        var path = this.getAbsolutePath();
        console.log("[*] File.canRead: " + path);
        return this.canRead();
      };

      File.canWrite.implementation = function () {
        var path = this.getAbsolutePath();
        console.log("[*] File.canWrite: " + path);
        return this.canWrite();
      };

      // Hook FileInputStream
      var FileInputStream = Java.use("java.io.FileInputStream");
      FileInputStream.$init.overload("java.io.File").implementation = function (file) {
        var path = file.getAbsolutePath();
        console.log("[*] FileInputStream: " + path);
        return this.$init(file);
      };

      // Hook FileOutputStream
      var FileOutputStream = Java.use("java.io.FileOutputStream");
      FileOutputStream.$init.overload("java.io.File").implementation = function (file) {
        var path = file.getAbsolutePath();
        console.log("[*] FileOutputStream: " + path);
        return this.$init(file);
      };

      // Hook SharedPreferences
      try {
        var SharedPreferences = Java.use("android.content.SharedPreferences");
        var Editor = Java.use("android.content.SharedPreferences$Editor");

        Editor.putString.implementation = function (key, value) {
          console.log("[*] SharedPreferences.putString: " + key + " = " + value);
          return this.putString(key, value);
        };

        Editor.putInt.implementation = function (key, value) {
          console.log("[*] SharedPreferences.putInt: " + key + " = " + value);
          return this.putInt(key, value);
        };

        Editor.putBoolean.implementation = function (key, value) {
          console.log("[*] SharedPreferences.putBoolean: " + key + " = " + value);
          return this.putBoolean(key, value);
        };
      } catch (e) {
        console.log("[-] SharedPreferences hooking failed: " + e);
      }

      // Hook Environment.getExternalStorageDirectory
      try {
        var Environment = Java.use("android.os.Environment");
        Environment.getExternalStorageDirectory.implementation = function () {
          console.log("[*] getExternalStorageDirectory called");
          return this.getExternalStorageDirectory();
        };
      } catch (e) {
        console.log("[-] Environment hooking failed: " + e);
      }

      console.log("[*] File operation hooking complete");
    } catch (e) {
      console.log("[-] Error during file hooking: " + e);
    }
  });
} else {
  console.log("[-] Java runtime not available");
}
