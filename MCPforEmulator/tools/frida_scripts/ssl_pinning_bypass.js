/**
 * SSL Pinning Bypass Script
 * Bypasses SSL certificate validation in Android apps
 * Usage: frida -U -f com.example.app -l ssl_pinning_bypass.js --no-pause
 */

if (Java.available) {
  Java.perform(function () {
    console.log("[*] Starting SSL pinning bypass");

    try {
      // Bypass TrustManager
      var TrustManager = Java.use("javax.net.ssl.TrustManager");
      var SSLContext = Java.use("javax.net.ssl.SSLContext");

      // Bypass X509TrustManager
      var X509TrustManager = Java.use("javax.net.ssl.X509TrustManager");
      X509TrustManager.checkClientTrusted.implementation = function (chain, authType) {
        console.log("[+] Bypassed checkClientTrusted");
      };
      X509TrustManager.checkServerTrusted.implementation = function (chain, authType) {
        console.log("[+] Bypassed checkServerTrusted");
      };
      X509TrustManager.getAcceptedIssuers.implementation = function () {
        console.log("[+] Bypassed getAcceptedIssuers");
        return [];
      };

      // Bypass OkHttp3
      try {
        var OkHostnameVerifier = Java.use("okhttp3.OkHostnameVerifier");
        console.log("[+] Found OkHttp3, attempting bypass");
        OkHostnameVerifier.verify.implementation = function (hostname, session) {
          console.log("[+] Bypassed OkHttp3 hostname verification for: " + hostname);
          return true;
        };
      } catch (e) {
        console.log("[-] OkHttp3 not found: " + e);
      }

      // Bypass OkHttp2
      try {
        var OkHostnameVerifier = Java.use("okhttp.OkHostnameVerifier");
        console.log("[+] Found OkHttp2, attempting bypass");
        OkHostnameVerifier.verify.implementation = function (hostname, session) {
          console.log("[+] Bypassed OkHttp2 hostname verification for: " + hostname);
          return true;
        };
      } catch (e) {
        console.log("[-] OkHttp2 not found: " + e);
      }

      // Bypass Apache HttpClient
      try {
        var AbstractVerifier = Java.use("org.apache.http.conn.ssl.AbstractVerifier");
        console.log("[+] Found Apache HttpClient, attempting bypass");
        AbstractVerifier.verify.implementation = function (host, ssl) {
          console.log("[+] Bypassed Apache HttpClient verification for: " + host);
          return;
        };
      } catch (e) {
        console.log("[-] Apache HttpClient not found: " + e);
      }

      // Bypass default SSL context
      try {
        var SSLContext = Java.use("javax.net.ssl.SSLContext");
        SSLContext.init.overload(
          "[Ljavax.net.ssl.KeyManager;",
          "[Ljavax.net.ssl.TrustManager;",
          "java.security.SecureRandom",
        ).implementation = function (keyManager, trustManager, secureRandom) {
          console.log("[+] Bypassed SSLContext.init");
          this.init(
            keyManager,
            Java.array("javax.net.ssl.TrustManager", [Java.use("javax.net.ssl.X509TrustManager").$new()]),
            secureRandom,
          );
        };
      } catch (e) {
        console.log("[-] SSLContext bypass failed: " + e);
      }

      console.log("[*] SSL pinning bypass complete");
    } catch (e) {
      console.log("[-] Error during SSL bypass: " + e);
    }
  });
} else {
  console.log("[-] Java runtime not available");
}
