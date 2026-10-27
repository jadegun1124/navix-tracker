package kr.co.umap.tracker;

import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;

/**
 * Removes the ongoing shade cards posted by 1.6.0 foreground services.
 * Channel importance is cached by Android and by Samsung One UI, so an
 * existing "Umap" or "위치 공유" channel cannot be edited in place.
 */
public final class OngoingNotificationCleanup {
    public static final String LOCATION_CHANNEL = "umap_location";
    public static final String QUIET_CHANNEL = "umap_location_quiet";
    public static final String WATCH_CHANNEL = "umap_alert_watch";
    public static final int LOCATION_NOTIFICATION_ID = 4108;
    public static final int WATCH_NOTIFICATION_ID = 5108;

    private OngoingNotificationCleanup() {}

    public static void clear(Context context) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        manager.cancel(LOCATION_NOTIFICATION_ID);
        manager.cancel(WATCH_NOTIFICATION_ID);
        if (Build.VERSION.SDK_INT < 26) return;
        manager.deleteNotificationChannel(LOCATION_CHANNEL);
        manager.deleteNotificationChannel(QUIET_CHANNEL);
        manager.deleteNotificationChannel(WATCH_CHANNEL);
    }
}
