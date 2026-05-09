/**
 * Hook encryption operations to monitor cryptographic functions
 * Usage: frida -U -f com.example.app -l hook_encryption.js --no-pause
 */

if (Java.available) {
  Java.perform(function () {
    console.log("[*] Starting encryption operation hooking");

    try {
      // Hook Cipher class
      var Cipher = Java.use("javax.crypto.Cipher");

      Cipher.doFinal.overload("[B").implementation = function (input) {
        console.log("[*] Cipher.doFinal(byte[])");
        console.log("    Algorithm: " + this.getAlgorithm());
        console.log("    Input length: " + input.length);
        var result = this.doFinal(input);
        console.log("    Output length: " + result.length);
        return result;
      };

      Cipher.doFinal.overload().implementation = function () {
        console.log("[*] Cipher.doFinal()");
        console.log("    Algorithm: " + this.getAlgorithm());
        var result = this.doFinal();
        return result;
      };

      // Hook MessageDigest
      var MessageDigest = Java.use("java.security.MessageDigest");

      MessageDigest.digest.overload("[B").implementation = function (input) {
        console.log("[*] MessageDigest.digest(byte[])");
        console.log("    Algorithm: " + this.getAlgorithm());
        console.log("    Input length: " + input.length);
        var result = this.digest(input);
        console.log("    Output: " + bytesToHex(result));
        return result;
      };

      // Hook Mac (Message Authentication Code)
      var Mac = Java.use("javax.crypto.Mac");

      Mac.doFinal.overload("[B").implementation = function (input) {
        console.log("[*] Mac.doFinal(byte[])");
        console.log("    Algorithm: " + this.getAlgorithm());
        console.log("    Input length: " + input.length);
        var result = this.doFinal(input);
        console.log("    Output length: " + result.length);
        return result;
      };

      // Hook SecretKeySpec
      var SecretKeySpec = Java.use("javax.crypto.spec.SecretKeySpec");

      SecretKeySpec.$init.implementation = function (key, algorithm) {
        console.log("[*] SecretKeySpec created");
        console.log("    Algorithm: " + algorithm);
        console.log("    Key length: " + key.length);
        console.log("    Key (first 8 bytes): " + bytesToHex(Array.from(key).slice(0, 8)));
        return this.$init(key, algorithm);
      };

      // Hook KeyGenerator
      try {
        var KeyGenerator = Java.use("javax.crypto.KeyGenerator");

        KeyGenerator.init.overload("int").implementation = function (keysize) {
          console.log("[*] KeyGenerator.init(keysize)");
          console.log("    Algorithm: " + this.getAlgorithm());
          console.log("    Key size: " + keysize);
          return this.init(keysize);
        };

        KeyGenerator.generateKey.implementation = function () {
          console.log("[*] KeyGenerator.generateKey");
          var key = this.generateKey();
          console.log("    Key format: " + key.getFormat());
          console.log("    Key algorithm: " + key.getAlgorithm());
          return key;
        };
      } catch (e) {
        console.log("[-] KeyGenerator hooking failed: " + e);
      }

      // Hook Signature
      try {
        var Signature = Java.use("java.security.Signature");

        Signature.update.overload("[B").implementation = function (data) {
          console.log("[*] Signature.update(byte[])");
          console.log("    Algorithm: " + this.getAlgorithm());
          console.log("    Data length: " + data.length);
          return this.update(data);
        };

        Signature.sign.implementation = function () {
          console.log("[*] Signature.sign");
          console.log("    Algorithm: " + this.getAlgorithm());
          var result = this.sign();
          console.log("    Signature length: " + result.length);
          return result;
        };

        Signature.verify.implementation = function (signature) {
          console.log("[*] Signature.verify");
          console.log("    Algorithm: " + this.getAlgorithm());
          console.log("    Signature length: " + signature.length);
          var result = this.verify(signature);
          console.log("    Valid: " + result);
          return result;
        };
      } catch (e) {
        console.log("[-] Signature hooking failed: " + e);
      }

      console.log("[*] Encryption operation hooking complete");
    } catch (e) {
      console.log("[-] Error during encryption hooking: " + e);
    }
  });

  // Helper function to convert bytes to hex
  function bytesToHex(bytes) {
    return Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }
} else {
  console.log("[-] Java runtime not available");
}
