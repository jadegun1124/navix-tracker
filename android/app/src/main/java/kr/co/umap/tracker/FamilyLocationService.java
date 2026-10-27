package kr.co.umap.tracker;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.BatteryManager;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;
import androidx.core.app.NotificationCompat;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Publishes the managed phone's latest fix while the screen is off.
 * Started only after the person confirms 항상 허용 and the OS grants background location.
 */
public class FamilyLocationService extends Service {
    public static final String ACTION_START = "kr.co.umap.tracker.SHARE_START";
    public static final String ACTION_STOP = "kr.co.umap.tracker.SHARE_STOP";
    public static final String EXTRA_TARGETS = "targets";
    private static final String PREFS = "umap_presence";
    private static final String CHANNEL = "umap-share";
    private static final int NOTICE = 71;
    private static final Object LOCK = new Object();

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private LocationManager locations;
    private LocationListener listener;

    public static JSONArray drainPoints(Context context, long after) {
        synchronized (LOCK) {
            JSONArray out = new JSONArray();
            try {
                JSONArray points = new JSONArray(context.getSharedPreferences(PREFS, MODE_PRIVATE).getString("points", "[]"));
                for (int index = 0; index < points.length(); index += 1) {
                    JSONObject point = points.getJSONObject(index);
                    if (point.optLong("at") > after) out.put(point);
                }
                context.getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString("points", "[]").apply();
            } catch (Exception ignored) {
                return new JSONArray();
            }
            return out;
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        locations = (LocationManager) getSystemService(LOCATION_SERVICE);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            shutdown();
            return START_NOT_STICKY;
        }
        if (intent != null && intent.hasExtra(EXTRA_TARGETS)) {
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString("targets", intent.getStringExtra(EXTRA_TARGETS)).putBoolean("enabled", true).apply();
        }
        if (!getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean("enabled", false)) {
            stopSelf();
            return START_NOT_STICKY;
        }
        try {
            Notification notification = buildNotification();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTICE, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            } else {
                startForeground(NOTICE, notification);
            }
        } catch (Exception error) {
            stopSelf();
            return START_NOT_STICKY;
        }
        listen();
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        if (locations != null && listener != null) locations.removeUpdates(listener);
        io.shutdownNow();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void shutdown() {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean("enabled", false).apply();
        if (locations != null && listener != null) locations.removeUpdates(listener);
        try {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } catch (Exception ignored) {
            /* 포그라운드로 올라가기 전에 멈춘 경우 */
        }
        stopSelf();
    }

    private void listen() {
        if (locations == null || listener != null) return;
        listener = location -> {
            if (location == null) return;
            long age = Math.abs(System.currentTimeMillis() - location.getTime());
            if (age > 30_000) return;
            remember(location);
            publish(location, location.getTime());
        };
        try {
            locations.requestLocationUpdates(LocationManager.GPS_PROVIDER, 60_000L, 0f, listener, Looper.getMainLooper());
        } catch (Exception ignored) {
            /* GPS 프로바이더가 꺼져 있을 수 있습니다. */
        }
        try {
            locations.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 60_000L, 0f, listener, Looper.getMainLooper());
        } catch (Exception ignored) {
            /* 네트워크 위치만 없을 수 있습니다. */
        }
    }

    private void remember(Location location) {
        synchronized (LOCK) {
            try {
                JSONArray points = new JSONArray(getSharedPreferences(PREFS, MODE_PRIVATE).getString("points", "[]"));
                JSONObject point = new JSONObject();
                point.put("lat", location.getLatitude());
                point.put("lng", location.getLongitude());
                point.put("at", location.getTime());
                point.put("accuracyM", Math.round(location.getAccuracy()));
                point.put("speedMps", location.hasSpeed() ? location.getSpeed() : JSONObject.NULL);
                points.put(point);
                while (points.length() > 80) points.remove(0);
                getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString("points", points.toString()).apply();
            } catch (Exception ignored) {
                /* 버퍼가 깨지면 다음 점부터 다시 쌓습니다. */
            }
        }
    }

    private void publish(Location location, long at) {
        String raw = getSharedPreferences(PREFS, MODE_PRIVATE).getString("targets", "[]");
        io.execute(() -> {
            try {
                JSONArray targets = new JSONArray(raw);
                for (int index = 0; index < targets.length() && index < 5; index += 1) {
                    JSONObject target = targets.getJSONObject(index);
                    putPlace(target, location, at);
                }
            } catch (Exception ignored) {
                /* 한 번 실패해도 다음 위치에서 다시 보냅니다. */
            }
        });
    }

    private void putPlace(JSONObject target, Location location, long at) {
        String endpoint = target.optString("endpoint");
        String token = target.optString("token");
        String code = target.optString("code");
        String name = target.optString("name", "가족");
        if (endpoint.isEmpty() || token.isEmpty() || code.isEmpty()) return;
        if (!(endpoint.startsWith("https://") || endpoint.startsWith("http://127.0.0.1") || endpoint.startsWith("http://localhost"))) return;
        float speed = location.hasSpeed() ? location.getSpeed() : 0f;
        String mode = speed < 0.5f ? "still" : speed < 2.1f ? "walk" : speed < 7f ? "bike" : speed < 44.4f ? "car" : "plane";
        String body = "{"
            + "\"code\":\"" + json(code) + "\","
            + "\"name\":\"" + json(name) + "\","
            + "\"lat\":" + location.getLatitude() + ","
            + "\"lng\":" + location.getLongitude() + ","
            + "\"accuracyM\":" + Math.round(location.getAccuracy()) + ","
            + "\"at\":" + at + ","
            + "\"sharing\":true,"
            + "\"battery\":" + batteryJson() + ","
            + "\"mode\":\"" + mode + "\","
            + "\"speedMps\":" + speed
            + "}";
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(endpoint).openConnection();
            connection.setRequestMethod("PUT");
            connection.setConnectTimeout(8000);
            connection.setReadTimeout(8000);
            connection.setDoOutput(true);
            connection.setRequestProperty("content-type", "application/json");
            connection.setRequestProperty("x-umap-sync-key", token);
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream stream = connection.getOutputStream()) {
                stream.write(bytes);
            }
            connection.getResponseCode();
        } catch (Exception ignored) {
            /* 다음 주기에 다시 보냅니다. */
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private String batteryJson() {
        Intent battery = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        if (battery == null) return "null";
        int level = battery.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
        int scale = battery.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
        if (level < 0 || scale <= 0) return "null";
        int percent = Math.max(0, Math.min(100, Math.round(level * 100f / scale)));
        return Integer.toString(percent);
    }

    private Notification buildNotification() {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26 && manager != null) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "위치 공유", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("가족에게 위치를 보내는 동안 켜 둡니다.");
            manager.createNotificationChannel(channel);
        }
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent pending = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new NotificationCompat.Builder(this, CHANNEL)
            .setContentTitle("Umap")
            .setContentText("가족에게 위치를 공유하는 중")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(pending)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .build();
    }

    private static String json(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ").replace("\r", " ");
    }
}
