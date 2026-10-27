package kr.co.umap.tracker;

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.Looper;
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
 * Foreground location publisher. Started only after the user turns on the
 * in-app keep-alive control. This class does not call requestPermissions and
 * does not change the OS "always allow" setting.
 *
 * Thresholds match src/lib/tracking.mjs: drop fixes older than 30s, precise
 * accuracy above 80m, later fixes worse than 40m, jumps faster than 350 m/s.
 * A still fix inside the stay radius is reported at the last stable pin so the
 * trail does not grow a multipath spike.
 */
public class LocationKeepService extends Service {
    public static final String ACTION_STOP = "kr.co.umap.tracker.STOP_KEEPALIVE";
    private static final String PREFS = "umap_location_keep";
    private static final String CHANNEL_ID = "umap_location_quiet";
    private static final String LEGACY_CHANNEL_ID = "umap_location";
    private static final int NOTIFICATION_ID = 4108;

    public interface Sink {
        void onFix(JSONObject fix);
    }

    private static volatile Sink sink;
    private static volatile boolean running;
    private static volatile String lastError;

    private ExecutorService io;
    private LocationManager locationManager;
    private LocationListener listener;
    private JSONObject config;
    private Location lastPublished;
    private long lastPublishedAt;
    private Location stableFix;

    public static void setSink(Sink next) {
        sink = next;
    }

    public static boolean isRunning() {
        return running;
    }

    public static String lastError() {
        return lastError;
    }

    public static boolean start(Context context, String configJson) {
        if (!writeConfig(context, configJson)) {
            lastError = "config";
            return false;
        }
        lastError = null;
        Intent intent = new Intent(context, LocationKeepService.class);
        try {
            if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent);
            else context.startService(intent);
            return true;
        } catch (Exception error) {
            lastError = "start";
            return false;
        }
    }

    public static void stop(Context context) {
        prefs(context).edit().remove("config").apply();
        context.stopService(new Intent(context, LocationKeepService.class));
    }

    public static void markUserStopped(Context context) {
        prefs(context).edit().remove("config").putBoolean("userStopped", true).apply();
    }

    public static void ackUserStopped(Context context) {
        prefs(context).edit().putBoolean("userStopped", false).apply();
    }

    public static boolean userStopped(Context context) {
        return prefs(context).getBoolean("userStopped", false);
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, MODE_PRIVATE);
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

    @Override
    public void onCreate() {
        super.onCreate();
        io = Executors.newSingleThreadExecutor();
        locationManager = (LocationManager) getSystemService(LOCATION_SERVICE);
        listener = new LocationListener() {
            @Override
            public void onLocationChanged(Location location) {
                handleFix(location);
            }

            @Override
            public void onStatusChanged(String provider, int status, Bundle extras) {}

            @Override
            public void onProviderEnabled(String provider) {}

            @Override
            public void onProviderDisabled(String provider) {}
        };
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            markUserStopped(this);
            shutdown();
            return START_NOT_STICKY;
        }
        if (Build.VERSION.SDK_INT >= 33
            && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            lastError = "notifications";
            stopSelf();
            return START_NOT_STICKY;
        }
        try {
            becomeForeground();
        } catch (Exception error) {
            lastError = "notifications";
            stopSelf();
            return START_NOT_STICKY;
        }
        String raw = prefs(this).getString("config", "");
        if (raw == null || raw.isEmpty() || !hasLocationPermission()) {
            lastError = hasLocationPermission() ? "config" : "permission";
            shutdown();
            return START_NOT_STICKY;
        }
        try {
            config = new JSONObject(raw);
        } catch (Exception error) {
            lastError = "config";
            shutdown();
            return START_NOT_STICKY;
        }
        if (!allowedBase(config.optString("baseUrl", ""))) {
            lastError = "config";
            shutdown();
            return START_NOT_STICKY;
        }
        lastError = null;
        running = true;
        removeUpdates();
        if (anySharing()) requestUpdates();
        else io.execute(() -> publish(null));
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        removeUpdates();
        if (io != null) io.shutdownNow();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void shutdown() {
        running = false;
        removeUpdates();
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    private void becomeForeground() {
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) {
            // The previous channel was IMPORTANCE_LOW and already created on devices.
            // Android will not lower that importance, so delete it and use a new min channel.
            manager.deleteNotificationChannel(LEGACY_CHANNEL_ID);
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Umap", NotificationManager.IMPORTANCE_MIN);
            channel.setDescription("");
            channel.setSound(null, null);
            channel.enableVibration(false);
            channel.enableLights(false);
            channel.setShowBadge(false);
            channel.setLockscreenVisibility(Notification.VISIBILITY_SECRET);
            manager.createNotificationChannel(channel);
        }
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent content = PendingIntent.getActivity(this, 1, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL_ID) : new Notification.Builder(this);
        // Location foreground services still need a notification object. It carries no share text,
        // makes no sound, and uses the minimum importance so the shade does not list "위치 공유".
        builder.setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle("\u2060")
            .setContentText("\u2060")
            .setContentIntent(content)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setVisibility(Notification.VISIBILITY_SECRET)
            .setCategory(Notification.CATEGORY_SERVICE)
            .setPriority(Notification.PRIORITY_MIN);
        if (Build.VERSION.SDK_INT >= 26) builder.setSilent(true);
        Notification notification = builder.build();
        notification.flags |= Notification.FLAG_NO_CLEAR;
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        else startForeground(NOTIFICATION_ID, notification);
    }

    private boolean hasLocationPermission() {
        return checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean anySharing() {
        for (JSONObject target : targets()) {
            if (target.optBoolean("sharing", false)) return true;
        }
        return false;
    }

    private List<JSONObject> targets() {
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

    @SuppressLint("MissingPermission")
    private void requestUpdates() {
        if (locationManager == null) return;
        boolean precise = config.optBoolean("precise", true);
        try {
            if (precise && locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 5_000L, 0f, listener, Looper.getMainLooper());
            }
        } catch (Exception ignored) {
            /* GPS 하드웨어가 없거나 권한이 없는 경우 */
        }
        try {
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, precise ? 15_000L : 20_000L, 0f, listener, Looper.getMainLooper());
            }
        } catch (Exception ignored) {
            /* 네트워크 위치가 없는 기기 */
        }
    }

    private void removeUpdates() {
        if (locationManager != null && listener != null) {
            try {
                locationManager.removeUpdates(listener);
            } catch (Exception ignored) {
                /* 이미 해제된 감시 */
            }
        }
    }

    private void handleFix(Location location) {
        if (!running || location == null || config == null) return;
        long now = System.currentTimeMillis();
        long fixAt = location.getTime() > 0 ? location.getTime() : now;
        if (now - fixAt > 30_000 || fixAt > now + 10_000) return;
        boolean precise = config.optBoolean("precise", true);
        float accuracy = location.getAccuracy();
        if (precise && accuracy > 80f) return;
        if (precise && accuracy > 40f && stableFix != null) return;
        if (!precise && accuracy > 400f) return;
        if (stableFix != null) {
            long dt = fixAt - stableFix.getTime();
            if (dt > 0 && dt <= 180_000) {
                float speed = stableFix.distanceTo(location) / (dt / 1000f);
                if (speed > 350f) return;
            }
        }
        Location reported = location;
        if (stableFix != null && isStayJitter(stableFix, location, accuracy)) {
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
            if (since < 5_000) return;
            if (since < 15_000 && moved < 30f) return;
        }
        lastPublished = new Location(reported);
        lastPublishedAt = now;
        Location publishFix = reported;
        io.execute(() -> publish(publishFix));
    }

    private boolean isStayJitter(Location anchor, Location next, float accuracy) {
        float moved = anchor.distanceTo(next);
        float gate = Math.max(50f, accuracy * 2f);
        if (moved <= gate) return true;
        if (!next.hasSpeed() || next.getSpeed() < 0.8f) {
            return moved < 80f;
        }
        return false;
    }

    private void emit(Location location, long fixAt) {
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

    private void publish(Location location) {
        JSONObject current = config;
        if (current == null) return;
        String base = current.optString("baseUrl", "").replaceAll("/+$", "");
        String name = current.optString("name", "가족").trim();
        if (name.isEmpty()) name = "가족";
        if (name.length() > 80) name = name.substring(0, 80);
        long at = System.currentTimeMillis();
        int battery = batteryPct();
        boolean charging = chargingNow();
        if (!running) return;
        for (JSONObject target : targets()) {
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
                    if (!sharing) target.put("revokeSent", true);
                    else target.put("revokeSent", false);
                }
            } catch (Exception ignored) {
                /* 다음 위치에서 다시 보낸다 */
            }
        }
    }

    private boolean put(String base, String token, JSONObject body) {
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

    private int batteryPct() {
        Intent sticky = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        if (sticky == null) return -1;
        int level = sticky.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
        int scale = sticky.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
        if (level < 0 || scale <= 0) return -1;
        return Math.round(level * 100f / scale);
    }

    private boolean chargingNow() {
        Intent sticky = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        if (sticky == null) return false;
        int status = sticky.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
        return status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL;
    }
}
