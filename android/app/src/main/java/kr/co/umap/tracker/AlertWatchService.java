package kr.co.umap.tracker;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Polls the family sync worker for SOS and home-leave alerts and posts a
 * system notification. Web Push is used when the browser can subscribe.
 * This WebView cannot, so the admin phone keeps a data-sync foreground
 * service after notification permission. It does not read location.
 */
public class AlertWatchService extends Service {
    public static final String ACTION_STOP = "kr.co.umap.tracker.STOP_ALERT_WATCH";
    private static final String PREFS = "umap_alert_watch";
    private static final String WATCH_CHANNEL = "umap_alert_watch";
    private static final String ALERT_CHANNEL = "umap_alert";
    private static final int WATCH_ID = 5108;
    private static final long POLL_MS = 12_000L;

    private static volatile boolean running;
    private static volatile String lastError;

    private final Handler main = new Handler(Looper.getMainLooper());
    private ExecutorService io;
    private JSONObject config;
    private long since;
    private boolean polling;

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
        Intent intent = new Intent(context, AlertWatchService.class);
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
        prefs(context).edit().remove("config").putBoolean("userStopped", false).apply();
        context.stopService(new Intent(context, AlertWatchService.class));
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
            String code = parsed.optString("code", "");
            String token = parsed.optString("token", "");
            String readKey = parsed.optString("readKey", "");
            if (!code.matches("\\d{4,6}")) return false;
            if (!token.matches("[A-Za-z0-9_-]{16,64}\\.[A-Za-z0-9_-]{16,64}")) return false;
            if (!readKey.matches("[A-Za-z0-9_-]{16,64}")) return false;
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

    private final Runnable poll = new Runnable() {
        @Override
        public void run() {
            if (!running) return;
            io.execute(() -> pull());
            main.postDelayed(this, POLL_MS);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        io = Executors.newSingleThreadExecutor();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            prefs(this).edit().remove("config").putBoolean("userStopped", true).apply();
            shutdown();
            return START_NOT_STICKY;
        }
        if (Build.VERSION.SDK_INT >= 33
            && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            lastError = "notifications";
            shutdown();
            return START_NOT_STICKY;
        }
        String raw = prefs(this).getString("config", "");
        if (raw == null || raw.isEmpty()) {
            shutdown();
            return START_NOT_STICKY;
        }
        try {
            becomeForeground();
        } catch (Exception error) {
            lastError = "notifications";
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
        if (since == 0) since = prefs(this).getLong("since", System.currentTimeMillis() - 60_000L);
        running = true;
        lastError = null;
        if (!polling) {
            polling = true;
            main.post(poll);
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        polling = false;
        main.removeCallbacks(poll);
        if (io != null) io.shutdownNow();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void shutdown() {
        running = false;
        polling = false;
        main.removeCallbacks(poll);
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    private void becomeForeground() {
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel watch = new NotificationChannel(WATCH_CHANNEL, "Umap", NotificationManager.IMPORTANCE_MIN);
            watch.setDescription("");
            watch.setSound(null, null);
            watch.enableVibration(false);
            watch.enableLights(false);
            watch.setShowBadge(false);
            watch.setLockscreenVisibility(Notification.VISIBILITY_SECRET);
            manager.createNotificationChannel(watch);
            NotificationChannel alert = new NotificationChannel(ALERT_CHANNEL, "가족 알림", NotificationManager.IMPORTANCE_HIGH);
            alert.setDescription("SOS와 집 반경을 벗어났을 때 알려 줍니다.");
            alert.enableVibration(true);
            manager.createNotificationChannel(alert);
        }
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent content = PendingIntent.getActivity(this, 7, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Intent stop = new Intent(this, AlertWatchService.class);
        stop.setAction(ACTION_STOP);
        PendingIntent stopAction = PendingIntent.getService(this, 8, stop, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, WATCH_CHANNEL) : new Notification.Builder(this);
        builder.setContentTitle("\u2060")
            .setContentText("\u2060")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentIntent(content)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setVisibility(Notification.VISIBILITY_SECRET)
            .setPriority(Notification.PRIORITY_MIN)
            .addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel, "알림 대기 끄기", stopAction).build());
        if (Build.VERSION.SDK_INT >= 26) builder.setSilent(true);
        Notification notification = builder.build();
        if (Build.VERSION.SDK_INT >= 29) startForeground(WATCH_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        else startForeground(WATCH_ID, notification);
    }

    private void pull() {
        JSONObject current = config;
        if (!running || current == null) return;
        String base = current.optString("baseUrl", "").replaceAll("/+$", "");
        String code = current.optString("code", "");
        String token = current.optString("token", "");
        String readKey = current.optString("readKey", "");
        HttpURLConnection connection = null;
        try {
            URL url = new URL(base + "/v1/rooms/" + code + "?since=" + since);
            connection = (HttpURLConnection) url.openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(8000);
            connection.setReadTimeout(8000);
            connection.setRequestMethod("GET");
            connection.setRequestProperty("x-umap-sync-key", token);
            connection.setRequestProperty("x-umap-read-key", readKey);
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) return;
            JSONObject body = new JSONObject(readStream(connection.getInputStream()));
            JSONArray alerts = body.optJSONArray("alerts");
            if (alerts == null) return;
            Set<String> seen = prefs(this).getStringSet("seen", new HashSet<>());
            Set<String> nextSeen = new HashSet<>(seen);
            long cursor = since;
            for (int index = 0; index < alerts.length(); index += 1) {
                JSONObject alert = alerts.optJSONObject(index);
                if (alert == null) continue;
                String id = alert.optString("id", "");
                String kind = alert.optString("kind", "");
                long at = alert.optLong("at", 0L);
                if (id.isEmpty() || at <= since || nextSeen.contains(id)) continue;
                if (!"sos".equals(kind) && !"leave".equals(kind)) continue;
                notifyAlert(alert);
                nextSeen.add(id);
                if (at > cursor) cursor = at;
            }
            while (nextSeen.size() > 30) {
                String first = nextSeen.iterator().next();
                nextSeen.remove(first);
            }
            since = cursor;
            prefs(this).edit().putLong("since", since).putStringSet("seen", nextSeen).apply();
        } catch (Exception ignored) {
            /* 다음 주기에 다시 받는다 */
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private void notifyAlert(JSONObject alert) {
        String kind = alert.optString("kind", "");
        String title = "sos".equals(kind) ? "SOS" : "집 반경을 나갔습니다";
        String body = alert.optString("body", "");
        if (body.length() > 200) body = body.substring(0, 200);
        int id = 5200 + (alert.optString("id", title).hashCode() & 0x0fff);
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent content = PendingIntent.getActivity(this, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, ALERT_CHANNEL) : new Notification.Builder(this);
        builder.setContentTitle(title)
            .setContentText(body)
            .setStyle(new Notification.BigTextStyle().bigText(body))
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentIntent(content)
            .setAutoCancel(true)
            .setCategory(Notification.CATEGORY_ALARM);
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        manager.notify(id, builder.build());
    }

    private static String readStream(InputStream stream) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[2048];
        int read;
        while ((read = stream.read(buffer)) >= 0) {
            output.write(buffer, 0, read);
            if (output.size() > 65_536) break;
        }
        return output.toString(StandardCharsets.UTF_8);
    }
}
