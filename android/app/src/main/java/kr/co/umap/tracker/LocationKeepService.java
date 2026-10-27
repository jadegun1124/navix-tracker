package kr.co.umap.tracker;

import android.annotation.SuppressLint;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationManager;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Build;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Background location publisher. Started only after the user turns on the
 * in-app keep-alive control. Registers LocationManager updates with a
 * PendingIntent so the process does not need a foreground service.
 *
 * Android 12 and later always show a foreground-service notification, even
 * when the channel importance is minimum and the title is empty. That is the
 * blank Umap row 1.6.0 left in the shade. This class does not post one and
 * does not create a location channel.
 *
 * Updates keep the requested interval while the app is in the foreground or
 * on the battery-optimization allowlist (배터리 제한 없음) with 항상 허용.
 * Without that allowlist, Android 8+ may throttle a background app to a few
 * fixes an hour. The system location-in-use glyph is not an app notification.
 *
 * Thresholds match src/lib/tracking.mjs: drop fixes older than 30s, precise
 * accuracy above 80m, later fixes worse than 40m, jumps faster than 350 m/s.
 * A still fix inside the stay radius, and a slow leap that is not a sustained
 * walk, is reported at the last stable pin so the trail does not grow a spike.
 */
public class LocationKeepService {
    public static final String ACTION_FIX = "kr.co.umap.tracker.LOCATION_FIX";
    private static final String PREFS = "umap_location_keep";
    private static final int REQUEST_CODE = OngoingNotificationCleanup.LOCATION_NOTIFICATION_ID;
    private static final ExecutorService IO = Executors.newSingleThreadExecutor();

    public interface Sink {
        void onFix(JSONObject fix);
    }

    private static volatile Context appContext;
    private static volatile Sink sink;
    private static volatile String lastError;
    private static final Object LOCK = new Object();
    private static volatile boolean filterLoaded;
    private static Location stableFix;
    private static Location lastPublished;
    private static long lastPublishedAt;

    public static void attach(Context context) {
        appContext = context.getApplicationContext();
    }

    public static void setSink(Sink next) {
        sink = next;
    }

    public static boolean isRunning() {
        Context context = appContext;
        if (context == null) return false;
        return prefs(context).getBoolean("registered", false);
    }

    public static String lastError() {
        return lastError;
    }

    public static boolean start(Context context, String configJson) {
        attach(context);
        OngoingNotificationCleanup.clear(context);
        if (!writeConfig(context, configJson)) {
            lastError = "config";
            return false;
        }
        if (!hasLocationPermission(context)) {
            lastError = "permission";
            disarm(context);
            return false;
        }
        JSONObject config = readConfig(context);
        if (config == null || !allowedBase(config.optString("baseUrl", ""))) {
            lastError = "config";
            disarm(context);
            return false;
        }
        lastError = null;
        prefs(context).edit().putBoolean("registered", true).commit();
        synchronized (LOCK) {
            if (anySharing(config)) registerUpdates(context, config);
            else removeUpdates(context);
        }
        if (!anySharing(config)) IO.execute(() -> publish(context, null));
        return true;
    }

    public static void stop(Context context) {
        attach(context);
        prefs(context).edit().remove("config").putBoolean("registered", false).commit();
        synchronized (LOCK) {
            clearFilter(context);
            removeUpdates(context);
        }
        OngoingNotificationCleanup.clear(context);
    }

    public static void markUserStopped(Context context) {
        prefs(context).edit().remove("config").putBoolean("registered", false).putBoolean("userStopped", true).commit();
        synchronized (LOCK) {
            clearFilter(context);
            removeUpdates(context);
        }
    }

    public static void ackUserStopped(Context context) {
        prefs(context).edit().putBoolean("userStopped", false).apply();
    }

    public static boolean userStopped(Context context) {
        return prefs(context).getBoolean("userStopped", false);
    }

    @SuppressWarnings("deprecation")
    public static Location locationFrom(Intent intent) {
        if (intent == null) return null;
        if (Build.VERSION.SDK_INT >= 33) {
            return intent.getParcelableExtra(LocationManager.KEY_LOCATION_CHANGED, Location.class);
        }
        return intent.getParcelableExtra(LocationManager.KEY_LOCATION_CHANGED);
    }

    public static void onFix(Context context, Location location, BroadcastReceiver.PendingResult pending) {
        attach(context);
        IO.execute(() -> {
        try {
            if (!prefs(context).getBoolean("registered", false) || location == null) return;
            if (!hasLocationPermission(context)) {
                disarm(context);
                return;
            }
            Location publishFix;
            synchronized (LOCK) {
                publishFix = handleFix(context, location);
            }
            if (publishFix != null) publish(context, publishFix);
        } finally {
                if (pending != null) pending.finish();
            }
        });
    }

    private static void disarm(Context context) {
        prefs(context).edit().putBoolean("registered", false).commit();
        synchronized (LOCK) {
            removeUpdates(context);
        }
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static boolean writeConfig(Context context, String configJson) {
        try {
            JSONObject parsed = new JSONObject(configJson);
            if (!allowedBase(parsed.optString("baseUrl", ""))) return false;
            if (!parsed.has("targets")) return false;
            prefs(context).edit().putString("config", parsed.toString()).putBoolean("userStopped", false).commit();
            return true;
        } catch (Exception error) {
            return false;
        }
    }

    private static JSONObject readConfig(Context context) {
        String raw = prefs(context).getString("config", "");
        if (raw == null || raw.isEmpty()) return null;
        try {
            return new JSONObject(raw);
        } catch (Exception error) {
            return null;
        }
    }

    private static boolean allowedBase(String base) {
        try {
            Uri uri = Uri.parse(base);
            String scheme = uri.getScheme();
            String host = uri.getHost();
            if (host == null || uri.getUserInfo() != null) return false;
            if ("https".equalsIgnoreCase(scheme)) return true;
            return "http".equalsIgnoreCase(scheme) && ("localhost".equals(host) || "127.0.0.1".equals(host));
        } catch (Exception error) {
            return false;
        }
    }

    private static android.app.PendingIntent locationIntent(Context context) {
        Intent intent = new Intent(context, LocationKeepReceiver.class);
        intent.setAction(ACTION_FIX);
        int flags = android.app.PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 31) flags |= android.app.PendingIntent.FLAG_MUTABLE;
        return android.app.PendingIntent.getBroadcast(context, REQUEST_CODE, intent, flags);
    }

    @SuppressLint("MissingPermission")
    private static void registerUpdates(Context context, JSONObject config) {
        LocationManager locationManager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
        if (locationManager == null) return;
        android.app.PendingIntent pending = locationIntent(context);
        try {
            locationManager.removeUpdates(pending);
        } catch (Exception ignored) {
            /* 이미 해제된 감시 */
        }
        boolean precise = config.optBoolean("precise", true);
        try {
            if (precise && locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 5_000L, 0f, pending);
            }
        } catch (Exception ignored) {
            /* GPS 하드웨어가 없거나 권한이 없는 경우 */
        }
        try {
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, precise ? 15_000L : 20_000L, 0f, pending);
            }
        } catch (Exception ignored) {
            /* 네트워크 위치가 없는 기기 */
        }
    }

    private static void removeUpdates(Context context) {
        LocationManager locationManager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
        if (locationManager == null) return;
        try {
            locationManager.removeUpdates(locationIntent(context));
        } catch (Exception ignored) {
            /* 이미 해제된 감시 */
        }
    }

    private static boolean hasLocationPermission(Context context) {
        return context.checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || context.checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private static boolean anySharing(JSONObject config) {
        for (JSONObject target : targets(config)) {
            if (target.optBoolean("sharing", false)) return true;
        }
        return false;
    }

    private static List<JSONObject> targets(JSONObject config) {
        List<JSONObject> list = new ArrayList<>();
        if (config == null) return list;
        JSONArray raw = config.optJSONArray("targets");
        if (raw == null) return list;
        for (int index = 0; index < raw.length() && index < 5; index += 1) {
            JSONObject target = raw.optJSONObject(index);
            if (target == null) continue;
            String token = target.optString("token", "");
            String code = target.optString("code", "");
            if (!token.matches("[A-Za-z0-9_-]{16,64}\\.[A-Za-z0-9_-]{16,64}")) continue;
            if (!code.matches("\\d{4,6}")) continue;
            list.add(target);
        }
        return list;
    }

    private static void ensureFilter(Context context) {
        if (filterLoaded) return;
        filterLoaded = true;
        SharedPreferences stored = prefs(context);
        stableFix = readStoredFix(stored, "stable");
        lastPublished = readStoredFix(stored, "last");
        lastPublishedAt = stored.getLong("lastAt", 0L);
    }

    private static void rememberFilter(Context context) {
        SharedPreferences.Editor editor = prefs(context).edit();
        writeStoredFix(editor, "stable", stableFix);
        writeStoredFix(editor, "last", lastPublished);
        editor.putLong("lastAt", lastPublishedAt);
        editor.apply();
    }

    private static void clearFilter(Context context) {
        stableFix = null;
        lastPublished = null;
        lastPublishedAt = 0L;
        filterLoaded = true;
        prefs(context).edit().remove("stable").remove("last").remove("lastAt").apply();
    }

    private static Location readStoredFix(SharedPreferences stored, String key) {
        String raw = stored.getString(key, "");
        if (raw == null || raw.isEmpty()) return null;
        try {
            JSONObject json = new JSONObject(raw);
            Location location = new Location(json.optString("provider", LocationManager.GPS_PROVIDER));
            location.setLatitude(json.getDouble("lat"));
            location.setLongitude(json.getDouble("lng"));
            location.setTime(json.optLong("time", 0L));
            location.setAccuracy((float) json.optDouble("acc", 0d));
            if (json.has("speed") && !json.isNull("speed")) location.setSpeed((float) json.getDouble("speed"));
            return location;
        } catch (Exception error) {
            return null;
        }
    }

    private static void writeStoredFix(SharedPreferences.Editor editor, String key, Location location) {
        if (location == null) {
            editor.remove(key);
            return;
        }
        try {
            JSONObject json = new JSONObject();
            json.put("provider", location.getProvider() == null ? LocationManager.GPS_PROVIDER : location.getProvider());
            json.put("lat", location.getLatitude());
            json.put("lng", location.getLongitude());
            json.put("time", location.getTime());
            json.put("acc", location.getAccuracy());
            if (location.hasSpeed()) json.put("speed", location.getSpeed());
            editor.putString(key, json.toString());
        } catch (Exception error) {
            editor.remove(key);
        }
    }

    private static Location handleFix(Context context, Location location) {
        ensureFilter(context);
        JSONObject config = readConfig(context);
        if (config == null) return null;
        long now = System.currentTimeMillis();
        long fixAt = location.getTime() > 0 ? location.getTime() : now;
        if (now - fixAt > 30_000 || fixAt > now + 10_000) return null;
        boolean precise = config.optBoolean("precise", true);
        float accuracy = location.getAccuracy();
        if (precise && accuracy > 80f) return null;
        if (precise && accuracy > 40f && stableFix != null) return null;
        if (!precise && accuracy > 400f) return null;
        if (stableFix != null) {
            long dt = fixAt - stableFix.getTime();
            if (dt > 0 && dt <= 180_000) {
                float speed = stableFix.distanceTo(location) / (dt / 1000f);
                if (speed > 350f) return null;
            }
        }
        Location reported = location;
        if (stableFix != null && isStayJitter(stableFix, location, accuracy, fixAt)) {
            reported = new Location(stableFix);
            reported.setTime(fixAt);
            reported.setAccuracy(accuracy);
            if (location.hasSpeed()) reported.setSpeed(location.getSpeed());
        } else {
            stableFix = new Location(location);
            if (stableFix.getTime() <= 0) stableFix.setTime(fixAt);
            reported = stableFix;
        }
        emit(reported, fixAt);
        if (lastPublishedAt > 0) {
            long since = now - lastPublishedAt;
            float moved = lastPublished == null ? 9999f : lastPublished.distanceTo(reported);
            if (since < 5_000) {
                rememberFilter(context);
                return null;
            }
            if (since < 15_000 && moved < 30f) {
                rememberFilter(context);
                return null;
            }
        }
        lastPublished = new Location(reported);
        lastPublishedAt = now;
        rememberFilter(context);
        return new Location(reported);
    }

    /**
     * Mirrors trailDecision in src/lib/tracking.mjs. A still or slow fix must
     * look like a sustained walk before the published pin moves. Admin and
     * managed phones both upload through this path while the app is backgrounded,
     * and the viewer stitches those fixes into that member's trail.
     */
    private static boolean isStayJitter(Location anchor, Location next, float accuracy, long fixAt) {
        float moved = anchor.distanceTo(next);
        float gate = Math.max(50f, accuracy * 2f);
        if (moved <= gate) return true;
        if (next.hasSpeed() && next.getSpeed() >= 0.8f) return false;
        long dt = Math.max(0L, fixAt - anchor.getTime());
        float implied = dt > 0L ? moved / (dt / 1000f) : Float.POSITIVE_INFINITY;
        boolean sustained = moved >= Math.max(80f, accuracy * 3f) && dt >= 45_000L && implied >= 0.7f && implied <= 2.5f;
        return !sustained;
    }

    private static void emit(Location location, long fixAt) {
        Sink current = sink;
        if (current == null) return;
        try {
            JSONObject fix = new JSONObject();
            fix.put("lat", location.getLatitude());
            fix.put("lng", location.getLongitude());
            fix.put("accuracyM", Math.round(location.getAccuracy()));
            if (location.hasSpeed() && location.getSpeed() >= 0f && location.getSpeed() < 400f) fix.put("speedMps", location.getSpeed());
            else fix.put("speedMps", JSONObject.NULL);
            fix.put("at", fixAt);
            current.onFix(fix);
        } catch (Exception ignored) {
            /* 화면 브리지가 없어도 서버 전송은 계속한다 */
        }
    }

    private static void publish(Context context, Location location) {
        JSONObject current = readConfig(context);
        if (current == null) return;
        String base = current.optString("baseUrl", "").replaceAll("/+$", "");
        String name = current.optString("name", "가족").trim();
        if (name.isEmpty()) name = "가족";
        if (name.length() > 80) name = name.substring(0, 80);
        long at = System.currentTimeMillis();
        int battery = batteryPct(context);
        boolean charging = chargingNow(context);
        if (!prefs(context).getBoolean("registered", false)) return;
        boolean changed = false;
        for (JSONObject target : targets(current)) {
            boolean sharing = target.optBoolean("sharing", false);
            if (sharing && location == null) continue;
            if (!sharing && target.optBoolean("revokeSent", false)) continue;
            try {
                JSONObject body = new JSONObject();
                body.put("code", target.optString("code"));
                body.put("name", name);
                body.put("sharing", sharing);
                body.put("at", at);
                body.put("accuracyM", location == null ? 0 : Math.round(Math.max(0f, location.getAccuracy())));
                if ("family".equals(target.optString("audience"))) body.put("audience", "family");
                if (!sharing || location == null) {
                    body.put("lat", JSONObject.NULL);
                    body.put("lng", JSONObject.NULL);
                } else {
                    body.put("lat", location.getLatitude());
                    body.put("lng", location.getLongitude());
                    if (battery >= 0) body.put("batteryPct", battery);
                    body.put("charging", charging);
                }
                if (put(base, target.optString("token"), body)) {
                    target.put("revokeSent", !sharing);
                    changed = true;
                }
            } catch (Exception ignored) {
                /* 다음 위치에서 다시 보낸다 */
            }
        }
        if (changed) prefs(context).edit().putString("config", current.toString()).apply();
    }

    private static boolean put(String base, String token, JSONObject body) {
        HttpURLConnection connection = null;
        try {
            URL url = new URL(base + "/v1/rooms/" + body.getString("code") + "/place");
            connection = (HttpURLConnection) url.openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(8000);
            connection.setReadTimeout(8000);
            connection.setRequestMethod("PUT");
            connection.setRequestProperty("content-type", "application/json; charset=utf-8");
            connection.setRequestProperty("x-umap-sync-key", token);
            connection.setDoOutput(true);
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream stream = connection.getOutputStream()) {
                stream.write(bytes);
            }
            int status = connection.getResponseCode();
            return status >= 200 && status < 300;
        } catch (Exception error) {
            return false;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static int batteryPct(Context context) {
        Intent sticky = stickyBattery(context);
        if (sticky == null) return -1;
        int level = sticky.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
        int scale = sticky.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
        if (level < 0 || scale <= 0) return -1;
        return Math.round(level * 100f / scale);
    }

    private static boolean chargingNow(Context context) {
        Intent sticky = stickyBattery(context);
        if (sticky == null) return false;
        int status = sticky.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
        return status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL;
    }

    private static Intent stickyBattery(Context context) {
        try {
            return context.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        } catch (Exception error) {
            return null;
        }
    }
}
