/**
 * Configuration Loader for Frida Scripts
 * Loads configuration from config.json file
 * Usage: Include this script at the beginning of other scripts
 */

var CONFIG = {
  frida: {},
  hooks: {},
  memory: {},
  logging: {},
  output: {},
};

// Load configuration from file
try {
  var File = Java.use("java.io.File");
  var configPath = "/data/local/tmp/config.json";

  if (File(configPath).exists()) {
    var FileReader = Java.use("java.io.FileReader");
    var BufferedReader = Java.use("java.io.BufferedReader");
    var InputStreamReader = Java.use("java.io.InputStreamReader");

    var reader = new BufferedReader(new InputStreamReader(new FileReader(configPath)));
    var line = "";
    var jsonContent = "";

    while ((line = reader.readLine()) != null) {
      jsonContent += line;
    }
    reader.close();

    CONFIG = JSON.parse(jsonContent);
    console.log("[+] Loaded configuration from " + configPath);
  } else {
    console.log("[-] Config file not found at " + configPath);
    console.log("[*] Using default configuration");
  }
} catch (e) {
  console.log("[-] Failed to load configuration: " + e);
  console.log("[*] Using default configuration");
}

// Helper function to get config value with default
function getConfig(path, defaultValue) {
  var value = CONFIG;
  var parts = path.split(".");

  for (var i = 0; i < parts.length; i++) {
    if (value && value[parts[i]] !== undefined) {
      value = value[parts[i]];
    } else {
      return defaultValue;
    }
  }

  return value !== undefined ? value : defaultValue;
}

// Helper function to set config value
function setConfig(path, value) {
  var config = CONFIG;
  var parts = path.split(".");

  for (var i = 0; i < parts.length - 1; i++) {
    if (!config[parts[i]]) {
      config[parts[i]] = {};
    }
    config = config[parts[i]];
  }

  config[parts[parts.length - 1]] = value;
}

// Logging helper
function log(level, message) {
  var logLevel = getConfig("logging.level", "info");
  var levels = ["debug", "info", "warn", "error"];
  var levelIndex = levels.indexOf(level);

  if (levelIndex >= levels.indexOf(logLevel)) {
    var timestamp = getConfig("logging.include_timestamp", true);
    var prefix = timestamp ? new Date().toISOString() + " " : "";
    console.log(prefix + "[" + level.toUpperCase() + "] " + message);
  }
}

// Stack trace logging
function logError(message, error) {
  log("error", message);
  if (getConfig("logging.include_stack_trace", false) && error) {
    log("error", "Stack trace: " + error.stack);
  }
}

// Export for use in other scripts
var ConfigLoader = {
  getConfig: getConfig,
  setConfig: setConfig,
  log: log,
  logError: logError,
  CONFIG: CONFIG,
};

console.log("[*] Configuration loader initialized");
