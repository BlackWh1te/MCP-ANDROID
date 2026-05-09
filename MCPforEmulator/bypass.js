Java.perform(function () {
  try {
    var Build = Java.use("android.os.Build");
    Build.MODEL.value = "Pixel 5";
    Build.MANUFACTURER.value = "Google";
    Build.BRAND.value = "google";
    Build.DEVICE.value = "redfin";
    Build.HARDWARE.value = "redfin";
  } catch (e) {}

  try {
    var TelephonyManager = Java.use("android.telephony.TelephonyManager");
    TelephonyManager.getDeviceId.overload().implementation = function () {
      return "359872046812345";
    };
  } catch (e) {}

  try {
    var Settings = Java.use("android.provider.Settings$Secure");
    Settings.getString.overload("android.content.ContentResolver", "java.lang.String").implementation = function (
      cr,
      name,
    ) {
      if (name === "android_id") {
        return "3f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c";
      }
      return this.getString(cr, name);
    };
  } catch (e) {}
});

console.log("[*] Starting Root Detection Bypass");
Java.perform(function () {
  var File = Java.use("java.io.File");
  File.exists.implementation = function () {
    var path = this.getAbsolutePath();
    var suPaths = [
      "/system/app/Superuser.apk",
      "/sbin/su",
      "/system/bin/su",
      "/system/xbin/su",
      "/data/local/xbin/su",
      "/magisk/.core/bin/su",
    ];
    for (var i = 0; i < suPaths.length; i++) {
      if (path.indexOf(suPaths[i]) !== -1) {
        return false;
      }
    }
    return this.exists();
  };
  console.log("[+] Su binary checks bypassed");

  var PackageManager = Java.use("android.content.pm.PackageManager");
  PackageManager.getPackageInfo.overload("java.lang.String", "int").implementation = function (pkgName, flags) {
    var rootApps = [
      "com.noshufou.android.su",
      "com.thirdparty.superuser",
      "eu.chainfire.supersu",
      "com.topjohnwu.magisk",
    ];
    for (var i = 0; i < rootApps.length; i++) {
      if (pkgName === rootApps[i]) {
        throw Java.use("android.content.pm.PackageManager$NameNotFoundException").$new(pkgName);
      }
    }
    return this.getPackageInfo(pkgName, flags);
  };
  console.log("[+] Root app checks bypassed");
});

console.log("[*] Bypass Complete!");
