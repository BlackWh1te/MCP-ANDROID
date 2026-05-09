/**
 * Hook Intent and broadcast operations to monitor inter-component communication
 * Usage: frida -U -f com.example.app -l hook_intents.js --no-pause
 */

if (Java.available) {
  Java.perform(function () {
    console.log("[*] Starting Intent and broadcast hooking");

    try {
      // Hook startActivity
      var Activity = Java.use("android.app.Activity");

      Activity.startActivity.overload("android.content.Intent").implementation = function (intent) {
        console.log("[*] Activity.startActivity");
        console.log("    Action: " + intent.getAction());
        console.log("    Component: " + intent.getComponent());
        console.log("    Data: " + intent.getDataString());
        console.log("    Type: " + intent.getType());
        console.log("    Flags: " + intent.getFlags());
        this.startActivity(intent);
      };

      Activity.startActivityForResult.overload("android.content.Intent", "int").implementation = function (
        intent,
        requestCode,
      ) {
        console.log("[*] Activity.startActivityForResult");
        console.log("    Action: " + intent.getAction());
        console.log("    Request code: " + requestCode);
        this.startActivityForResult(intent, requestCode);
      };

      // Hook sendBroadcast
      var Context = Java.use("android.content.Context");

      Context.sendBroadcast.implementation = function (intent) {
        console.log("[*] Context.sendBroadcast");
        console.log("    Action: " + intent.getAction());
        console.log("    Component: " + intent.getComponent());
        console.log("    Data: " + intent.getDataString());
        this.sendBroadcast(intent);
      };

      Context.sendOrderedBroadcast.implementation = function (intent, receiverPermission) {
        console.log("[*] Context.sendOrderedBroadcast");
        console.log("    Action: " + intent.getAction());
        console.log("    Permission: " + receiverPermission);
        this.sendOrderedBroadcast(intent, receiverPermission);
      };

      // Hook startService
      Context.startService.implementation = function (intent) {
        console.log("[*] Context.startService");
        console.log("    Action: " + intent.getAction());
        console.log("    Component: " + intent.getComponent());
        this.startService(intent);
      };

      // Hook bindService
      Context.bindService.implementation = function (intent, serviceConnection, flags) {
        console.log("[*] Context.bindService");
        console.log("    Action: " + intent.getAction());
        console.log("    Component: " + intent.getComponent());
        console.log("    Flags: " + flags);
        return this.bindService(intent, serviceConnection, flags);
      };

      // Hook BroadcastReceiver
      try {
        var BroadcastReceiver = Java.use("android.content.BroadcastReceiver");

        BroadcastReceiver.onReceive.implementation = function (context, intent) {
          console.log("[*] BroadcastReceiver.onReceive");
          console.log("    Action: " + intent.getAction());
          console.log("    Component: " + intent.getComponent());
          this.onReceive(context, intent);
        };
      } catch (e) {
        console.log("[-] BroadcastReceiver hooking failed: " + e);
      }

      // Hook Intent construction
      var Intent = Java.use("android.content.Intent");

      Intent.$init.overload("java.lang.String").implementation = function (action) {
        console.log("[*] Intent created with action: " + action);
        return this.$init(action);
      };

      Intent.$init.overload("java.lang.String", "android.net.Uri").implementation = function (action, uri) {
        console.log("[*] Intent created with action and URI");
        console.log("    Action: " + action);
        console.log("    URI: " + uri);
        return this.$init(action, uri);
      };

      Intent.putExtra.implementation = function (key, value) {
        console.log("[*] Intent.putExtra: " + key + " = " + value);
        return this.putExtra(key, value);
      };

      // Hook PendingIntent
      try {
        var PendingIntent = Java.use("android.app.PendingIntent");

        PendingIntent.getActivity.implementation = function (context, requestCode, intent, flags) {
          console.log("[*] PendingIntent.getActivity");
          console.log("    Intent action: " + intent.getAction());
          console.log("    Request code: " + requestCode);
          return this.getActivity(context, requestCode, intent, flags);
        };

        PendingIntent.getBroadcast.implementation = function (context, requestCode, intent, flags) {
          console.log("[*] PendingIntent.getBroadcast");
          console.log("    Intent action: " + intent.getAction());
          return this.getBroadcast(context, requestCode, intent, flags);
        };

        PendingIntent.getService.implementation = function (context, requestCode, intent, flags) {
          console.log("[*] PendingIntent.getService");
          console.log("    Intent action: " + intent.getAction());
          return this.getService(context, requestCode, intent, flags);
        };
      } catch (e) {
        console.log("[-] PendingIntent hooking failed: " + e);
      }

      console.log("[*] Intent and broadcast hooking complete");
    } catch (e) {
      console.log("[-] Error during intent hooking: " + e);
    }
  });
} else {
  console.log("[-] Java runtime not available");
}
