// Default Bypass Scripts for MCP Frida Android Server
// These scripts are automatically injected when connecting to apps

// Emulator Detection Bypass
const emulatorBypassScript = `
if (Java.available) {
    Java.perform(function() {
        console.log("[*] Starting Emulator Detection Bypass");
        
        try {
            var Build = Java.use("android.os.Build");
            Build.FINGERPRINT.value = "google/sdk_gphone_x86/generic_x86:13/TP1A.221105.003/9322115:user/release-keys";
            Build.MANUFACTURER.value = "Google";
            Build.BRAND.value = "google";
            Build.MODEL.value = "Pixel 5";
            Build.DEVICE.value = "redfin";
            Build.HARDWARE.value = "redfin";
            console.log("[+] Build properties bypassed");
        } catch (e) {
            console.log("[-] Build bypass failed: " + e);
        }
        
        try {
            var TelephonyManager = Java.use("android.telephony.TelephonyManager");
            TelephonyManager.getNetworkOperatorName.implementation = function() {
                return "T-Mobile";
            };
            TelephonyManager.getSimOperatorName.implementation = function() {
                return "T-Mobile";
            };
            console.log("[+] TelephonyManager bypassed");
        } catch (e) {
            console.log("[-] TelephonyManager bypass failed: " + e);
        }
        
        try {
            var TelephonyManager = Java.use("android.telephony.TelephonyManager");
            TelephonyManager.getDeviceId.overload().implementation = function() {
                return "359872046631896";
            };
            console.log("[+] Device ID bypassed");
        } catch (e) {
            console.log("[-] Device ID bypass failed: " + e);
        }
        
        try {
            var SystemProperties = Java.use("android.os.SystemProperties");
            SystemProperties.get.overload('java.lang.String').implementation = function(key) {
                var emulatorProps = ["ro.product.model", "ro.hardware", "ro.build.product", "ro.kernel.qemu"];
                for (var i = 0; i < emulatorProps.length; i++) {
                    if (key === emulatorProps[i]) {
                        if (key === "ro.product.model") return "Pixel 5";
                        if (key === "ro.hardware") return "redfin";
                        if (key === "ro.build.product") return "redfin";
                        return "";
                    }
                }
                return this.get(key);
            };
            console.log("[+] SystemProperties bypassed");
        } catch (e) {
            console.log("[-] SystemProperties bypass failed: " + e);
        }
        
        console.log("[*] Emulator Detection Bypass Complete");
    });
}
`;

// Root Detection Bypass
const rootBypassScript = `
if (Java.available) {
    Java.perform(function() {
        console.log("[*] Starting Root Detection Bypass");
        
        try {
            var File = Java.use("java.io.File");
            File.exists.implementation = function() {
                var path = this.getAbsolutePath();
                var suPaths = ["/system/app/Superuser.apk", "/sbin/su", "/system/bin/su", "/system/xbin/su", "/data/local/xbin/su", "/magisk/.core/bin/su"];
                for (var i = 0; i < suPaths.length; i++) {
                    if (path.indexOf(suPaths[i]) !== -1) {
                        return false;
                    }
                }
                return this.exists();
            };
            console.log("[+] Su binary checks bypassed");
        } catch (e) {
            console.log("[-] Su binary bypass failed: " + e);
        }
        
        try {
            var PackageManager = Java.use("android.content.pm.PackageManager");
            PackageManager.getPackageInfo.overload('java.lang.String', 'int').implementation = function(pkgName, flags) {
                var rootApps = ["com.noshufou.android.su", "com.thirdparty.superuser", "eu.chainfire.supersu", "com.topjohnwu.magisk"];
                for (var i = 0; i < rootApps.length; i++) {
                    if (pkgName === rootApps[i]) {
                        throw new Java.use("android.content.pm.PackageManager$NameNotFoundException").$new(pkgName);
                    }
                }
                return this.getPackageInfo(pkgName, flags);
            };
            console.log("[+] Root app checks bypassed");
        } catch (e) {
            console.log("[-] Root app bypass failed: " + e);
        }
        
        try {
            var SystemProperties = Java.use("android.os.SystemProperties");
            SystemProperties.get.overload('java.lang.String').implementation = function(key) {
                var rootProps = ["ro.debuggable", "ro.secure", "service.adb.root"];
                for (var i = 0; i < rootProps.length; i++) {
                    if (key === rootProps[i]) {
                        if (key === "ro.debuggable") return "0";
                        if (key === "ro.secure") return "1";
                        if (key === "service.adb.root") return "0";
                        return "";
                    }
                }
                return this.get(key);
            };
            console.log("[+] SystemProperties bypassed");
        } catch (e) {
            console.log("[-] SystemProperties bypass failed: " + e);
        }
        
        console.log("[*] Root Detection Bypass Complete");
    });
}
`;

// Combined Bypass Script
const combinedBypassScript = emulatorBypassScript + "\n" + rootBypassScript;

// Export for use in MCP server
module.exports = {
  emulatorBypass: emulatorBypassScript,
  rootBypass: rootBypassScript,
  combinedBypass: combinedBypassScript,
};
