/**
 * Hook database operations to monitor SQLite queries
 * Usage: frida -U -f com.example.app -l hook_database.js --no-pause
 */

if (Java.available) {
  Java.perform(function () {
    console.log("[*] Starting database operation hooking");

    try {
      // Hook SQLiteDatabase
      var SQLiteDatabase = Java.use("android.database.sqlite.SQLiteDatabase");

      SQLiteDatabase.execSQL.overload("java.lang.String").implementation = function (sql) {
        console.log("[*] SQLiteDatabase.execSQL: " + sql);
        return this.execSQL(sql);
      };

      SQLiteDatabase.execSQL.overload("java.lang.String", "[Ljava.lang.Object;").implementation = function (
        sql,
        bindArgs,
      ) {
        console.log("[*] SQLiteDatabase.execSQL with args: " + sql);
        console.log("    Bind args: " + JSON.stringify(bindArgs));
        return this.execSQL(sql, bindArgs);
      };

      SQLiteDatabase.query.overload(
        "java.lang.String",
        "[Ljava.lang.String;",
        "java.lang.String",
        "[Ljava.lang.String;",
        "java.lang.String",
        "java.lang.String",
      ).implementation = function (table, columns, selection, selectionArgs, groupBy, having, orderBy) {
        console.log("[*] SQLiteDatabase.query");
        console.log("    Table: " + table);
        console.log("    Selection: " + selection);
        console.log("    Selection args: " + JSON.stringify(selectionArgs));
        var cursor = this.query(table, columns, selection, selectionArgs, groupBy, having, orderBy);
        console.log("    Result count: " + cursor.getCount());
        return cursor;
      };

      SQLiteDatabase.insert.overload(
        "java.lang.String",
        "java.lang.String",
        "android.content.ContentValues",
      ).implementation = function (table, nullColumnHack, values) {
        console.log("[*] SQLiteDatabase.insert");
        console.log("    Table: " + table);
        console.log("    Values: " + values.toString());
        var result = this.insert(table, nullColumnHack, values);
        console.log("    Row ID: " + result);
        return result;
      };

      SQLiteDatabase.update.overload(
        "java.lang.String",
        "android.content.ContentValues",
        "java.lang.String",
        "[Ljava.lang.String;",
      ).implementation = function (table, values, whereClause, whereArgs) {
        console.log("[*] SQLiteDatabase.update");
        console.log("    Table: " + table);
        console.log("    Where: " + whereClause);
        console.log("    Where args: " + JSON.stringify(whereArgs));
        var result = this.update(table, values, whereClause, whereArgs);
        console.log("    Rows affected: " + result);
        return result;
      };

      SQLiteDatabase.delete.overload("java.lang.String", "java.lang.String", "[Ljava.lang.String;").implementation =
        function (table, whereClause, whereArgs) {
          console.log("[*] SQLiteDatabase.delete");
          console.log("    Table: " + table);
          console.log("    Where: " + whereClause);
          console.log("    Where args: " + JSON.stringify(whereArgs));
          var result = this.delete(table, whereClause, whereArgs);
          console.log("    Rows deleted: " + result);
          return result;
        };

      // Hook SQLiteOpenHelper
      try {
        var SQLiteOpenHelper = Java.use("android.database.sqlite.SQLiteOpenHelper");

        SQLiteOpenHelper.getWritableDatabase.implementation = function () {
          console.log("[*] SQLiteOpenHelper.getWritableDatabase");
          console.log("    Database: " + this.getDatabaseName());
          return this.getWritableDatabase();
        };

        SQLiteOpenHelper.getReadableDatabase.implementation = function () {
          console.log("[*] SQLiteOpenHelper.getReadableDatabase");
          console.log("    Database: " + this.getDatabaseName());
          return this.getReadableDatabase();
        };
      } catch (e) {
        console.log("[-] SQLiteOpenHelper hooking failed: " + e);
      }

      // Hook Cursor
      var Cursor = Java.use("android.database.Cursor");
      var CursorWrapper = Java.use("android.database.CursorWrapper");

      CursorWrapper.moveToFirst.implementation = function () {
        console.log("[*] Cursor.moveToFirst");
        return this.moveToFirst();
      };

      CursorWrapper.getCount.implementation = function () {
        var count = this.getCount();
        console.log("[*] Cursor.getCount: " + count);
        return count;
      };

      console.log("[*] Database operation hooking complete");
    } catch (e) {
      console.log("[-] Error during database hooking: " + e);
    }
  });
} else {
  console.log("[-] Java runtime not available");
}
