package kr.co.umap.tracker;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Polls SOS and home-leave alerts. Does not post an ongoing notification. */
public class AlertWatchReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent != null && AlertWatchService.ACTION_STOP.equals(intent.getAction())) {
            AlertWatchService.disarmFromUser(context.getApplicationContext());
            return;
        }
        if (!AlertWatchService.isArmed(context)) return;
        PendingResult pending = goAsync();
        AlertWatchService.pollThenSchedule(context.getApplicationContext(), pending);
    }
}
