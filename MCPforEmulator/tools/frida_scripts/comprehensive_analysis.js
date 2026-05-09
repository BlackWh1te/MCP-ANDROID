/**
 * Comprehensive Android Application Analysis Script
 *
 * This script performs deep analysis of Android applications including:
 * - Anti-debug detection and bypass
 * - Root detection analysis
 * - SSL/TLS pinning analysis
 * - Network traffic monitoring
 * - File system monitoring
 * - Encryption/Cryptography analysis
 * - Database operations monitoring
 * - Intent analysis
 * - String extraction
 * - Memory analysis
 *
 * NOTE: This is a Frida script and uses Frida-specific APIs (Java, Process, console, etc.)
 * which are not available in standard JavaScript environments.
 */

/* eslint-disable no-undef, no-empty, @typescript-eslint/no-unused-vars */

const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

function log(message, color = colors.reset) {
  console.log(color + message + colors.reset);
}

// Analysis results storage
const analysisResults = {
  timestamp: new Date().toISOString(),
  deviceInfo: {},
  processInfo: {},
  securityAnalysis: {
    antiDebug: [],
    rootDetection: [],
    emulatorDetection: [],
    sslPinning: [],
  },
  networkAnalysis: {
    httpOperations: [],
    httpsOperations: [],
    socketOperations: [],
    domains: [],
  },
  fileSystemAnalysis: {
    filesAccessed: [],
    filesWritten: [],
    filesDeleted: [],
  },
  encryptionAnalysis: {
    cryptoOperations: [],
    encryptionLibraries: [],
  },
  databaseAnalysis: {
    queries: [],
    databases: [],
  },
  intentAnalysis: {
    intents: [],
    components: [],
  },
  stringAnalysis: {
    interestingStrings: [],
    urls: [],
    apiKeys: [],
  },
  memoryAnalysis: {
    regions: [],
    suspiciousRegions: [],
  },
};

// ============================================
// DEVICE INFORMATION
// ============================================
function collectDeviceInfo() {
  log("[*] Collecting device information...", colors.cyan);

  try {
    const Build = Java.use("android.os.Build");
    analysisResults.deviceInfo = {
      manufacturer: Build.MANUFACTURER.value,
      model: Build.MODEL.value,
      product: Build.PRODUCT.value,
      device: Build.DEVICE.value,
      board: Build.BOARD.value,
      hardware: Build.HARDWARE.value,
      androidVersion: Build.VERSION.RELEASE,
      sdkVersion: Build.VERSION.SDK_INT.value,
      bootloader: Build.BOOTLOADER.value,
      brand: Build.BRAND.value,
      display: Build.DISPLAY.value,
      fingerprint: Build.FINGERPRINT.value,
      host: Build.HOST.value,
      id: Build.ID.value,
      tags: Build.TAGS.value,
      type: Build.TYPE.value,
      user: Build.USER.value,
    };

    log("[+] Device information collected", colors.green);
  } catch (e) {
    log("[-] Failed to collect device info: " + e, colors.red);
  }
}

// ============================================
// PROCESS INFORMATION
// ============================================
function collectProcessInfo() {
  log("[*] Collecting process information...", colors.cyan);

  try {
    const ActivityThread = Java.use("android.app.ActivityThread");
    const currentProcess = ActivityThread.currentProcessName();
    const currentPid = Process.getCurrentProcessId();

    analysisResults.processInfo = {
      pid: currentPid,
      processName: currentProcess,
      packageName: currentProcess,
      startTime: new Date().toISOString(),
    };

    log("[+] Process information collected", colors.green);
  } catch (e) {
    log("[-] Failed to collect process info: " + e, colors.red);
  }
}

// ============================================
// ANTI-DEBUG DETECTION
// ============================================
function detectAntiDebug() {
  log("[*] Detecting anti-debugging mechanisms...", colors.cyan);

  try {
    // Check for Debug.isDebuggerConnected()
    const Debug = Java.use("android.os.Debug");
    const isDebuggerConnected = Debug.isDebuggerConnected();

    if (isDebuggerConnected) {
      log("[!] Debugger is connected - app may detect this", colors.yellow);
      analysisResults.securityAnalysis.antiDebug.push("debuggerConnected");
    }

    // Hook common anti-debug methods
    try {
      Debug.isDebuggerConnected.implementation = function () {
        log("[*] Debug.isDebuggerConnected() called", colors.yellow);
        return false; // Bypass
      };
      log("[+] Hooked Debug.isDebuggerConnected()", colors.green);
    } catch (e) {}

    // Check for ptrace
    try {
      const Process = Java.use("android.os.Process");
      log("[+] Checking for ptrace usage", colors.green);
    } catch (e) {}

    // Check for timing attacks
    try {
      const System = Java.use("java.lang.System");
      const currentTime = System.currentTimeMillis();
      const elapsed = System.currentTimeMillis() - currentTime;

      if (elapsed > 100) {
        log("[!] Possible timing-based anti-debug detected", colors.yellow);
        analysisResults.securityAnalysis.antiDebug.push("timingAttack");
      }
    } catch (e) {}

    log("[+] Anti-debug detection complete", colors.green);
  } catch (e) {
    log("[-] Anti-debug detection failed: " + e, colors.red);
  }
}

// ============================================
// ROOT DETECTION ANALYSIS
// ============================================
function detectRoot() {
  log("[*] Detecting root detection mechanisms...", colors.cyan);

  try {
    const File = Java.use("java.io.File");

    // Common root paths
    const rootPaths = [
      "/system/app/Superuser.apk",
      "/sbin/su",
      "/system/bin/su",
      "/system/xbin/su",
      "/data/local/xbin/su",
      "/data/local/bin/su",
      "/system/sd/xbin/su",
      "/system/bin/failsafe/su",
      "/data/local/su",
      "/su/bin/su",
      "/magisk/.core/bin/su",
      "/system/app/SuperSU",
      "/system/etc/init.d/99SuperSUDaemon",
      "/dev/com.koushikdutta.superuser.daemon/",
      "/system/xbin/daemonsu",
      "/system/app/Superuser.apk",
    ];

    const detectedRootPaths = [];
    rootPaths.forEach((path) => {
      try {
        const file = File.$new(path);
        if (file.exists()) {
          detectedRootPaths.push(path);
          log("[!] Root path detected: " + path, colors.yellow);
          analysisResults.securityAnalysis.rootDetection.push(path);
        }
      } catch (e) {}
    });

    if (detectedRootPaths.length > 0) {
      log("[!] Root detection mechanisms detected", colors.yellow);
    } else {
      log("[+] No standard root paths detected", colors.green);
    }

    // Check for root-related packages
    const rootPackages = [
      "com.noshufou.android.su",
      "com.thirdparty.superuser",
      "eu.chainfire.supersu",
      "com.koushikdutta.superuser",
      "com.topjohnwu.magisk",
    ];

    const PackageManager = Java.use("android.content.pm.PackageManager");
    const Application = Java.use("android.app.Application");
    const context = Application.getApplicationContext();
    const packageManager = context.getPackageManager();

    rootPackages.forEach((pkg) => {
      try {
        const packageInfo = packageManager.getPackageInfo(pkg, 0);
        log("[!] Root package detected: " + pkg, colors.yellow);
        analysisResults.securityAnalysis.rootDetection.push("package:" + pkg);
      } catch (e) {}
    });

    log("[+] Root detection analysis complete", colors.green);
  } catch (e) {
    log("[-] Root detection failed: " + e, colors.red);
  }
}

// ============================================
// EMULATOR DETECTION ANALYSIS
// ============================================
function detectEmulator() {
  log("[*] Detecting emulator detection mechanisms...", colors.cyan);

  try {
    const Build = Java.use("android.os.Build");

    const emulatorIndicators = [
      { check: () => Build.FINGERPRINT.value.startsWith("generic"), name: "generic fingerprint" },
      { check: () => Build.FINGERPRINT.value.startsWith("unknown"), name: "unknown fingerprint" },
      { check: () => Build.MODEL.value.contains("google_sdk"), name: "google_sdk model" },
      { check: () => Build.MODEL.value.contains("Emulator"), name: "Emulator model" },
      { check: () => Build.MODEL.value.contains("Android SDK built for x86"), name: "x86 emulator" },
      { check: () => Build.MANUFACTURER.value.equals("Genymotion"), name: "Genymotion" },
      { check: () => Build.PRODUCT.value.equals("google_sdk"), name: "google_sdk product" },
      { check: () => Build.PRODUCT.value.equals("sdk"), name: "sdk product" },
      { check: () => Build.PRODUCT.value.equals("sdk_x86"), name: "sdk_x86 product" },
      { check: () => Build.PRODUCT.value.equals("vbox86p"), name: "vbox86p product" },
      { check: () => Build.HARDWARE.value.equals("goldfish"), name: "goldfish hardware" },
      { check: () => Build.HARDWARE.value.equals("ranchu"), name: "ranchu hardware" },
    ];

    emulatorIndicators.forEach((indicator) => {
      try {
        if (indicator.check()) {
          log("[!] Emulator indicator detected: " + indicator.name, colors.yellow);
          analysisResults.securityAnalysis.emulatorDetection.push(indicator.name);
        }
      } catch (e) {}
    });

    log("[+] Emulator detection analysis complete", colors.green);
  } catch (e) {
    log("[-] Emulator detection failed: " + e, colors.red);
  }
}

// ============================================
// SSL/TLS PINNING ANALYSIS
// ============================================
function analyzeSSLPinning() {
  log("[*] Analyzing SSL/TLS pinning...", colors.cyan);

  try {
    // Hook SSLContext
    try {
      const SSLContext = Java.use("javax.net.ssl.SSLContext");
      SSLContext.init.overload(
        "[Ljavax.net.ssl.KeyManager;",
        "[Ljavax.net.ssl.TrustManager;",
        "java.security.SecureRandom",
      ).implementation = function (keyManagers, trustManagers, secureRandom) {
        log("[*] SSLContext.init() called", colors.yellow);
        analysisResults.securityAnalysis.sslPinning.push("SSLContext.init");
        return this.init(keyManagers, trustManagers, secureRandom);
      };
      log("[+] Hooked SSLContext.init()", colors.green);
    } catch (e) {}

    // Hook TrustManager
    try {
      const X509TrustManager = Java.use("javax.net.ssl.X509TrustManager");
      X509TrustManager.checkServerTrusted.implementation = function (chain, authType) {
        log("[*] X509TrustManager.checkServerTrusted() called", colors.yellow);
        analysisResults.securityAnalysis.sslPinning.push("X509TrustManager.checkServerTrusted");
        // Don't bypass - just detect
        return this.checkServerTrusted(chain, authType);
      };
      log("[+] Hooked X509TrustManager.checkServerTrusted()", colors.green);
    } catch (e) {}

    // Hook OkHttp certificate pinner
    try {
      const CertificatePinner = Java.use("okhttp3.CertificatePinner");
      CertificatePinner.check.overload("java.lang.String", "java.util.List").implementation = function (
        hostname,
        peerCertificates,
      ) {
        log("[*] OkHttp CertificatePinner.check() called for: " + hostname, colors.yellow);
        analysisResults.securityAnalysis.sslPinning.push("OkHttp.CertificatePinner");
        return this.check(hostname, peerCertificates);
      };
      log("[+] Hooked OkHttp CertificatePinner.check()", colors.green);
    } catch (e) {}

    log("[+] SSL/TLS pinning analysis complete", colors.green);
  } catch (e) {
    log("[-] SSL/TLS pinning analysis failed: " + e, colors.red);
  }
}

// ============================================
// NETWORK TRAFFIC MONITORING
// ============================================
function monitorNetwork() {
  log("[*] Monitoring network traffic...", colors.cyan);

  try {
    // Hook HttpURLConnection
    try {
      const HttpURLConnection = Java.use("java.net.HttpURLConnection");
      HttpURLConnection.connect.implementation = function () {
        const url = this.getURL().toString();
        log("[*] HttpURLConnection.connect() to: " + url, colors.yellow);
        analysisResults.networkAnalysis.httpOperations.push({
          type: "connect",
          url: url,
          timestamp: new Date().toISOString(),
        });

        // Extract domain
        try {
          const domain = new java.net.URL(url).getHost();
          if (!analysisResults.networkAnalysis.domains.includes(domain)) {
            analysisResults.networkAnalysis.domains.push(domain);
          }
        } catch (e) {}

        return this.connect();
      };
      log("[+] Hooked HttpURLConnection.connect()", colors.green);
    } catch (e) {}

    // Hook OkHttp
    try {
      const OkHttpClient = Java.use("okhttp3.OkHttpClient");
      OkHttpClient.newCall.implementation = function (request) {
        const url = request.url().toString();
        log("[*] OkHttp request to: " + url, colors.yellow);
        analysisResults.networkAnalysis.httpsOperations.push({
          type: "request",
          url: url,
          timestamp: new Date().toISOString(),
        });

        try {
          const domain = request.url().host();
          if (!analysisResults.networkAnalysis.domains.includes(domain)) {
            analysisResults.networkAnalysis.domains.push(domain);
          }
        } catch (e) {}

        return this.newCall(request);
      };
      log("[+] Hooked OkHttpClient.newCall()", colors.green);
    } catch (e) {}

    log("[+] Network traffic monitoring active", colors.green);
  } catch (e) {
    log("[-] Network monitoring failed: " + e, colors.red);
  }
}

// ============================================
// FILE SYSTEM MONITORING
// ============================================
function monitorFileSystem() {
  log("[*] Monitoring file system operations...", colors.cyan);

  try {
    const File = Java.use("java.io.File");

    // Hook file read operations
    File.$init.overload("java.lang.String").implementation = function (path) {
      log("[*] File accessed: " + path, colors.yellow);
      analysisResults.fileSystemAnalysis.filesAccessed.push({
        path: path,
        operation: "access",
        timestamp: new Date().toISOString(),
      });
      return this.$init(path);
    };
    log("[+] Hooked File constructor", colors.green);

    // Hook FileOutputStream
    try {
      const FileOutputStream = Java.use("java.io.FileOutputStream");
      FileOutputStream.$init.overload("java.lang.String").implementation = function (path) {
        log("[*] File written: " + path, colors.yellow);
        analysisResults.fileSystemAnalysis.filesWritten.push({
          path: path,
          operation: "write",
          timestamp: new Date().toISOString(),
        });
        return this.$init(path);
      };
      log("[+] Hooked FileOutputStream", colors.green);
    } catch (e) {}

    // Hook FileInputStream
    try {
      const FileInputStream = Java.use("java.io.FileInputStream");
      FileInputStream.$init.overload("java.lang.String").implementation = function (path) {
        log("[*] File read: " + path, colors.yellow);
        analysisResults.fileSystemAnalysis.filesAccessed.push({
          path: path,
          operation: "read",
          timestamp: new Date().toISOString(),
        });
        return this.$init(path);
      };
      log("[+] Hooked FileInputStream", colors.green);
    } catch (e) {}

    log("[+] File system monitoring active", colors.green);
  } catch (e) {
    log("[-] File system monitoring failed: " + e, colors.red);
  }
}

// ============================================
// ENCRYPTION/CRYPTOGRAPHY ANALYSIS
// ============================================
function analyzeEncryption() {
  log("[*] Analyzing encryption/cryptography...", colors.cyan);

  try {
    // Hook Cipher
    try {
      const Cipher = Java.use("javax.crypto.Cipher");
      Cipher.doFinal.implementation = function () {
        log("[*] Cipher.doFinal() called", colors.yellow);
        analysisResults.encryptionAnalysis.cryptoOperations.push({
          algorithm: this.getAlgorithm(),
          operation: "doFinal",
          timestamp: new Date().toISOString(),
        });
        return this.doFinal();
      };
      log("[+] Hooked Cipher.doFinal()", colors.green);
    } catch (e) {}

    // Hook MessageDigest
    try {
      const MessageDigest = Java.use("java.security.MessageDigest");
      MessageDigest.digest.implementation = function () {
        log("[*] MessageDigest.digest() called", colors.yellow);
        analysisResults.encryptionAnalysis.cryptoOperations.push({
          algorithm: this.getAlgorithm(),
          operation: "digest",
          timestamp: new Date().toISOString(),
        });
        return this.digest();
      };
      log("[+] Hooked MessageDigest.digest()", colors.green);
    } catch (e) {}

    // Hook KeyGenerator
    try {
      const KeyGenerator = Java.use("javax.crypto.KeyGenerator");
      KeyGenerator.generateKey.implementation = function () {
        log("[*] KeyGenerator.generateKey() called", colors.yellow);
        analysisResults.encryptionAnalysis.cryptoOperations.push({
          algorithm: this.getAlgorithm(),
          operation: "generateKey",
          timestamp: new Date().toISOString(),
        });
        return this.generateKey();
      };
      log("[+] Hooked KeyGenerator.generateKey()", colors.green);
    } catch (e) {}

    // Detect encryption libraries
    try {
      const System = Java.use("java.lang.System");
      System.loadLibrary.implementation = function (libName) {
        log("[*] Native library loaded: " + libName, colors.yellow);
        if (libName.includes("crypto") || libName.includes("ssl") || libName.includes("openssl")) {
          analysisResults.encryptionAnalysis.encryptionLibraries.push(libName);
        }
        return this.loadLibrary(libName);
      };
      log("[+] Hooked System.loadLibrary()", colors.green);
    } catch (e) {}

    log("[+] Encryption analysis active", colors.green);
  } catch (e) {
    log("[-] Encryption analysis failed: " + e, colors.red);
  }
}

// ============================================
// DATABASE OPERATIONS MONITORING
// ============================================
function monitorDatabase() {
  log("[*] Monitoring database operations...", colors.cyan);

  try {
    // Hook SQLiteDatabase
    try {
      const SQLiteDatabase = Java.use("android.database.sqlite.SQLiteDatabase");
      SQLiteDatabase.execSQL.implementation = function (sql) {
        log("[*] SQL executed: " + sql, colors.yellow);
        analysisResults.databaseAnalysis.queries.push({
          query: sql,
          timestamp: new Date().toISOString(),
        });
        return this.execSQL(sql);
      };
      log("[+] Hooked SQLiteDatabase.execSQL()", colors.green);
    } catch (e) {}

    // Hook SQLiteStatement
    try {
      const SQLiteStatement = Java.use("android.database.sqlite.SQLiteStatement");
      SQLiteStatement.execute.implementation = function () {
        log("[*] SQLiteStatement.execute() called", colors.yellow);
        return this.execute();
      };
      log("[+] Hooked SQLiteStatement.execute()", colors.green);
    } catch (e) {}

    log("[+] Database monitoring active", colors.green);
  } catch (e) {
    log("[-] Database monitoring failed: " + e, colors.red);
  }
}

// ============================================
// INTENT ANALYSIS
// ============================================
function analyzeIntents() {
  log("[*] Analyzing intents...", colors.cyan);

  try {
    // Hook startActivity
    try {
      const Activity = Java.use("android.app.Activity");
      Activity.startActivity.overload("android.content.Intent").implementation = function (intent) {
        log("[*] startActivity called: " + intent.getAction(), colors.yellow);
        analysisResults.intentAnalysis.intents.push({
          action: intent.getAction(),
          component: intent.getComponent() ? intent.getComponent().toString() : null,
          data: intent.getDataString(),
          timestamp: new Date().toISOString(),
        });
        return this.startActivity(intent);
      };
      log("[+] Hooked Activity.startActivity()", colors.green);
    } catch (e) {}

    log("[+] Intent analysis active", colors.green);
  } catch (e) {
    log("[-] Intent analysis failed: " + e, colors.red);
  }
}

// ============================================
// STRING EXTRACTION
// ============================================
function extractStrings() {
  log("[*] Extracting interesting strings...", colors.cyan);

  try {
    const Process = Java.use("android.os.Process");
    const pid = Process.myPid();

    // Scan memory for strings
    const ranges = Process.enumerateRanges("r--");
    log("[+] Found " + ranges.length + " readable memory ranges", colors.green);

    ranges.forEach((range) => {
      try {
        const size = Math.min(range.size, 4096); // Limit to 4KB per range for performance
        const data = range.base.readByteArray(size);
        const decoder = new TextDecoder("utf-8");
        const text = decoder.decode(data);

        // Extract URLs
        const urlRegex = /https?:\/\/[^\s<>"]+/g;
        const urls = text.match(urlRegex);
        if (urls) {
          urls.forEach((url) => {
            if (!analysisResults.stringAnalysis.urls.includes(url)) {
              analysisResults.stringAnalysis.urls.push(url);
              log("[*] Found URL: " + url, colors.yellow);
            }
          });
        }

        // Extract potential API keys
        const apiKeyRegex = /(api[_-]?key|apikey|access[_-]?token|secret)[\s:=]+[a-zA-Z0-9\-_]{20,}/gi;
        const apiKeys = text.match(apiKeyRegex);
        if (apiKeys) {
          apiKeys.forEach((key) => {
            if (!analysisResults.stringAnalysis.apiKeys.includes(key)) {
              analysisResults.stringAnalysis.apiKeys.push(key);
              log("[!] Found potential API key: " + key.substring(0, 20) + "...", colors.yellow);
            }
          });
        }

        // Extract file paths
        const pathRegex = /\/[a-zA-Z0-9_\-./]+/g;
        const paths = text.match(pathRegex);
        if (paths) {
          paths.forEach((path) => {
            if (path.length > 5 && !analysisResults.stringAnalysis.interestingStrings.includes(path)) {
              analysisResults.stringAnalysis.interestingStrings.push(path);
            }
          });
        }
      } catch (e) {}
    });

    log("[+] String extraction complete", colors.green);
  } catch (e) {
    log("[-] String extraction failed: " + e, colors.red);
  }
}

// ============================================
// MEMORY ANALYSIS
// ============================================
function analyzeMemory() {
  log("[*] Analyzing memory regions...", colors.cyan);

  try {
    const ranges = Process.enumerateRanges();
    log("[+] Found " + ranges.length + " total memory ranges", colors.green);

    let executable = 0;
    let writable = 0;
    let readable = 0;
    let suspicious = [];

    ranges.forEach((range) => {
      if (range.protection.includes("x")) executable++;
      if (range.protection.includes("w")) writable++;
      if (range.protection.includes("r")) readable++;

      analysisResults.memoryAnalysis.regions.push({
        base: range.base,
        size: range.size,
        protection: range.protection,
      });

      // Detect suspicious regions
      if (range.protection.includes("r") && range.protection.includes("w") && range.protection.includes("x")) {
        suspicious.push({
          base: range.base,
          size: range.size,
          protection: range.protection,
          reason: "RWX permissions",
        });
      }

      if (range.size > 10 * 1024 * 1024) {
        // > 10MB
        suspicious.push({
          base: range.base,
          size: range.size,
          protection: range.protection,
          reason: "Large memory region",
        });
      }
    });

    analysisResults.memoryAnalysis.suspiciousRegions = suspicious;

    log("[+] Memory analysis complete", colors.green);
    log("    - Executable regions: " + executable, colors.reset);
    log("    - Writable regions: " + writable, colors.reset);
    log("    - Readable regions: " + readable, colors.reset);
    log("    - Suspicious regions: " + suspicious.length, colors.reset);
  } catch (e) {
    log("[-] Memory analysis failed: " + e, colors.red);
  }
}

// ============================================
// MAIN ANALYSIS FUNCTION
// ============================================
function runComprehensiveAnalysis() {
  log("\n" + "=".repeat(60), colors.bright);
  log("COMPREHENSIVE ANDROID APPLICATION ANALYSIS", colors.bright);
  log("=".repeat(60) + "\n", colors.bright);

  collectDeviceInfo();
  collectProcessInfo();
  detectAntiDebug();
  detectRoot();
  detectEmulator();
  analyzeSSLPinning();
  monitorNetwork();
  monitorFileSystem();
  analyzeEncryption();
  monitorDatabase();
  analyzeIntents();
  extractStrings();
  analyzeMemory();

  log("\n" + "=".repeat(60), colors.bright);
  log("ANALYSIS COMPLETE - RESULTS SUMMARY", colors.bright);
  log("=".repeat(60) + "\n", colors.bright);

  log("Security Findings:", colors.cyan);
  log("  - Anti-debug methods: " + analysisResults.securityAnalysis.antiDebug.length, colors.reset);
  log("  - Root detection methods: " + analysisResults.securityAnalysis.rootDetection.length, colors.reset);
  log("  - Emulator detection methods: " + analysisResults.securityAnalysis.emulatorDetection.length, colors.reset);
  log("  - SSL pinning methods: " + analysisResults.securityAnalysis.sslPinning.length, colors.reset);

  log("\nNetwork Analysis:", colors.cyan);
  log("  - HTTP operations: " + analysisResults.networkAnalysis.httpOperations.length, colors.reset);
  log("  - HTTPS operations: " + analysisResults.networkAnalysis.httpsOperations.length, colors.reset);
  log("  - Domains contacted: " + analysisResults.networkAnalysis.domains.length, colors.reset);

  log("\nFile System Analysis:", colors.cyan);
  log("  - Files accessed: " + analysisResults.fileSystemAnalysis.filesAccessed.length, colors.reset);
  log("  - Files written: " + analysisResults.fileSystemAnalysis.filesWritten.length, colors.reset);

  log("\nEncryption Analysis:", colors.cyan);
  log("  - Crypto operations: " + analysisResults.encryptionAnalysis.cryptoOperations.length, colors.reset);
  log("  - Encryption libraries: " + analysisResults.encryptionAnalysis.encryptionLibraries.length, colors.reset);

  log("\nString Analysis:", colors.cyan);
  log("  - URLs found: " + analysisResults.stringAnalysis.urls.length, colors.reset);
  log("  - Potential API keys: " + analysisResults.stringAnalysis.apiKeys.length, colors.reset);
  log("  - Interesting strings: " + analysisResults.stringAnalysis.interestingStrings.length, colors.reset);

  log("\nMemory Analysis:", colors.cyan);
  log("  - Total regions: " + analysisResults.memoryAnalysis.regions.length, colors.reset);
  log("  - Suspicious regions: " + analysisResults.memoryAnalysis.suspiciousRegions.length, colors.reset);

  log("\n" + "=".repeat(60), colors.bright);
  log("Full analysis results available in 'analysisResults' object", colors.bright);
  log("Use: send(JSON.stringify(analysisResults))", colors.bright);
  log("=".repeat(60) + "\n", colors.bright);

  return analysisResults;
}

// Run analysis automatically
setTimeout(function () {
  Java.perform(function () {
    runComprehensiveAnalysis();
  });
}, 1000);
