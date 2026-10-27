package kr.co.umap.tracker;

import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import androidx.appcompat.app.AppCompatActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Settings deep link and keep-alive control. No permission request lives here.
 */
@CapacitorPlugin(name = "UmapLocation")
public class UmapLocationPlugin extends Plugin {
    @Override
    public void load() {
        LocationKeepService.setSink(this::emitFix);
    }

    private void emitFix(JSONObject fix) {
        AppCompatActivity activity = getActivity();
        if (activity == null) return;
        activity.runOnUiThread(() -> {
            try {
                notifyListeners("fix", JSObject.fromJSONObject(fix));
            } catch (JSONException ignored) {
                /* 화면이 없어도 서비스의 서버 전송은 남는다 */
            }
        });
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        JSObject result = new JSObject();
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            result.put("opened", true);
        } catch (Exception error) {
            result.put("opened", false);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void start(PluginCall call) {
        String config = call.getString("config", "");
        boolean started = config != null && LocationKeepService.start(getContext(), config);
        JSObject result = new JSObject();
        result.put("started", started);
        if (!started) result.put("reason", LocationKeepService.lastError() == null ? "config" : LocationKeepService.lastError());
        call.resolve(result);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        LocationKeepService.stop(getContext());
        JSObject result = new JSObject();
        result.put("stopped", true);
        call.resolve(result);
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject result = new JSObject();
        result.put("running", LocationKeepService.isRunning());
        result.put("userStopped", LocationKeepService.userStopped(getContext()));
        result.put("native", true);
        String reason = LocationKeepService.lastError();
        if (reason != null) result.put("reason", reason);
        call.resolve(result);
    }

    @PluginMethod
    public void ackStopped(PluginCall call) {
        LocationKeepService.ackUserStopped(getContext());
        call.resolve();
    }
}
