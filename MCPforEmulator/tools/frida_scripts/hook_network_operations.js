/**
 * Hook network operations to monitor HTTP requests and responses
 * Usage: frida -U -f com.example.app -l hook_network_operations.js --no-pause
 */

if (Java.available) {
  Java.perform(function () {
    console.log("[*] Starting network operation hooking");

    try {
      // Hook HttpURLConnection
      var HttpURLConnection = Java.use("java.net.HttpURLConnection");
      HttpURLConnection.connect.implementation = function () {
        console.log("[*] HttpURLConnection.connect()");
        console.log("    URL: " + this.getURL().toString());
        this.connect();
      };

      HttpURLConnection.getResponseCode.implementation = function () {
        var code = this.getResponseCode();
        console.log("[*] Response code: " + code);
        return code;
      };

      // Hook OkHttp3
      try {
        var OkHttpClient = Java.use("okhttp3.OkHttpClient");
        var Request = Java.use("okhttp3.Request");

        console.log("[+] Found OkHttp3");
        var Call = Java.use("okhttp3.Call");
        Call.execute.implementation = function () {
          var request = this.request();
          console.log("[*] OkHttp3 Request: " + request.url().toString());
          console.log("    Method: " + request.method());
          console.log("    Headers: " + request.headers().toString());

          var response = this.execute();
          console.log("[*] Response code: " + response.code());

          return response;
        };
      } catch (e) {
        console.log("[-] OkHttp3 not found: " + e);
      }

      // Hook URL.openStream
      var URL = Java.use("java.net.URL");
      URL.openStream.implementation = function () {
        console.log("[*] URL.openStream: " + this.toString());
        return this.openStream();
      };

      // Hook SSL/TLS
      var SSLSocket = Java.use("javax.net.ssl.SSLSocket");
      SSLSocket.startHandshake.implementation = function () {
        console.log("[*] SSL Handshake: " + this.getInetAddress().getHostAddress());
        this.startHandshake();
      };

      console.log("[*] Network operation hooking complete");
    } catch (e) {
      console.log("[-] Error during network hooking: " + e);
    }
  });
} else {
  console.log("[-] Java runtime not available");
}
