package kr.co.umap.tracker;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialException;
import java.util.Locale;
import java.util.concurrent.Executor;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Location keep-alive plus the system prompts the in-app buttons ask for.
 * Nothing here runs until JavaScript calls it after the Korean explanation.
 * Background location is not granted in code: the call opens the system page
 * where the user chooses 항상 허용.
 */
@CapacitorPlugin(
    name = "UmapLocation",
    permissions = {
        @Permission(strings = { android.Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications"),
        @Permission(strings = { android.Manifest.permission.ACTIVITY_RECOGNITION }, alias = "motion"),
        @Permission(
            strings = {
                android.Manifest.permission.ACCESS_COARSE_LOCATION,
                android.Manifest.permission.ACCESS_FINE_LOCATION
            },
            alias = "location"
        ),
        @Permission(strings = { android.Manifest.permission.ACCESS_BACKGROUND_LOCATION }, alias = "backgroundLocation")
    }
)
public class UmapLocationPlugin extends Plugin {
    private PluginCall pendingAlways;
    private boolean leftForSettings;

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
        result.put("opened", openAppDetails());
        call.resolve(result);
    }

    @PluginMethod
    public void requestNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 || granted(android.Manifest.permission.POST_NOTIFICATIONS)) {
            resolvePrompt(call, "granted", false);
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationsCallback");
    }

    @PermissionCallback
    private void notificationsCallback(PluginCall call) {
        if (granted(android.Manifest.permission.POST_NOTIFICATIONS)) {
            resolvePrompt(call, "granted", false);
            return;
        }
        boolean showAgain = shouldShow(android.Manifest.permission.POST_NOTIFICATIONS);
        resolvePrompt(call, "denied", !showAgain && openNotificationSettings());
    }

    @PluginMethod
    public void requestMotion(PluginCall call) {
        if (Build.VERSION.SDK_INT < 29 || granted(android.Manifest.permission.ACTIVITY_RECOGNITION)) {
            resolvePrompt(call, "granted", false);
            return;
        }
        requestPermissionForAlias("motion", call, "motionCallback");
    }

    @PermissionCallback
    private void motionCallback(PluginCall call) {
        if (granted(android.Manifest.permission.ACTIVITY_RECOGNITION)) {
            resolvePrompt(call, "granted", false);
            return;
        }
        boolean showAgain = shouldShow(android.Manifest.permission.ACTIVITY_RECOGNITION);
        boolean opened = !showAgain && openPermissionPage(android.Manifest.permission.ACTIVITY_RECOGNITION);
        resolvePrompt(call, "denied", opened);
    }

    @PluginMethod
    public void requestForeground(PluginCall call) {
        if (hasForeground()) {
            resolveForeground(call, "while-using");
            return;
        }
        requestPermissionForAlias("location", call, "foregroundCallback");
    }

    @PermissionCallback
    private void foregroundCallback(PluginCall call) {
        resolveForeground(call, hasForeground() ? "while-using" : "denied");
    }

    @PluginMethod
    public void openAlwaysLocation(PluginCall call) {
        if (getActivity() == null) {
            resolveAlways(call, false);
            return;
        }
        if (!hasForeground()) {
            requestPermissionForAlias("location", call, "alwaysAfterForeground");
            return;
        }
        openAlwaysScreen(call);
    }

    @PermissionCallback
    private void alwaysAfterForeground(PluginCall call) {
        if (!hasForeground()) {
            resolveAlways(call, true);
            return;
        }
        AppCompatActivity activity = getActivity();
        if (activity == null) {
            resolveAlways(call, false);
            return;
        }
        activity.runOnUiThread(() -> openAlwaysScreen(call));
    }

    @PermissionCallback
    private void backgroundForAlways(PluginCall call) {
        resolveAlways(call, true);
    }

    private void openAlwaysScreen(PluginCall call) {
        if (hasBackground()) {
            resolveAlways(call, false);
            return;
        }
        if (Build.VERSION.SDK_INT < 29) {
            resolveAlways(call, false);
            return;
        }
        call.setKeepAlive(true);
        pendingAlways = call;
        leftForSettings = false;
        if (openLocationPermissionPage()) return;
        pendingAlways = null;
        leftForSettings = false;
        requestPermissionForAlias("backgroundLocation", call, "backgroundForAlways");
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        if (pendingAlways != null) leftForSettings = true;
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        if (pendingAlways != null && leftForSettings) {
            PluginCall call = pendingAlways;
            pendingAlways = null;
            leftForSettings = false;
            resolveAlways(call, true);
        }
    }

    @SuppressLint("BatteryLife")
    @PluginMethod
    public void openBattery(PluginCall call) {
        JSObject result = new JSObject();
        String pkg = getContext().getPackageName();
        PowerManager power = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        boolean unrestricted = power != null && power.isIgnoringBatteryOptimizations(pkg);
        result.put("unrestricted", unrestricted);
        if (unrestricted) {
            result.put("opened", false);
            call.resolve(result);
            return;
        }
        Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
        intent.setData(Uri.parse("package:" + pkg));
        if (!startExternal(intent)) {
            Intent fallback = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
            if (!startExternal(fallback)) {
                result.put("opened", openAppDetails());
                call.resolve(result);
                return;
            }
        }
        result.put("opened", true);
        call.resolve(result);
    }

    @PluginMethod
    public void battery(PluginCall call) {
        JSObject result = new JSObject();
        Intent battery = getContext().registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        if (battery == null) {
            call.resolve(result);
            return;
        }
        int level = battery.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
        int scale = battery.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
        int status = battery.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
        if (scale > 0 && level >= 0) result.put("pct", Math.round(level * 100f / scale));
        boolean charging = status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL;
        result.put("charging", charging);
        call.resolve(result);
    }

    @PluginMethod
    public void signIn(PluginCall call) {
        String clientId = call.getString("clientId", "");
        if (clientId == null || clientId.trim().isEmpty()) {
            resolveSignIn(call, null, "missing-client");
            return;
        }
        AppCompatActivity activity = getActivity();
        if (activity == null) {
            resolveSignIn(call, null, "unavailable");
            return;
        }
        String serverClientId = clientId.trim();
        activity.runOnUiThread(() -> startGoogleSignIn(call, serverClientId));
    }

    private void startGoogleSignIn(PluginCall call, String serverClientId) {
        AppCompatActivity activity = getActivity();
        if (activity == null) {
            resolveSignIn(call, null, "unavailable");
            return;
        }
        try {
            GetSignInWithGoogleOption option = new GetSignInWithGoogleOption.Builder(serverClientId).build();
            GetCredentialRequest request = new GetCredentialRequest.Builder().addCredentialOption(option).build();
            CredentialManager manager = CredentialManager.create(activity);
            Executor executor = ContextCompat.getMainExecutor(activity);
            manager.getCredentialAsync(
                activity,
                request,
                null,
                executor,
                new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                    @Override
                    public void onResult(GetCredentialResponse response) {
                        try {
                            GoogleIdTokenCredential credential = GoogleIdTokenCredential.createFrom(response.getCredential().getData());
                            String token = credential.getIdToken();
                            if (token == null || token.isEmpty()) resolveSignIn(call, null, "token");
                            else resolveSignIn(call, token, null);
                        } catch (Exception error) {
                            resolveSignIn(call, null, "token");
                        }
                    }

                    @Override
                    public void onError(GetCredentialException error) {
                        resolveSignIn(call, null, signInCode(error));
                    }
                }
            );
        } catch (Exception error) {
            resolveSignIn(call, null, signInCode(error));
        }
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

    private void resolvePrompt(PluginCall call, String state, boolean openedSettings) {
        JSObject result = new JSObject();
        result.put("state", state);
        result.put("openedSettings", openedSettings);
        call.resolve(result);
    }

    private void resolveForeground(PluginCall call, String location) {
        JSObject result = new JSObject();
        result.put("location", location);
        call.resolve(result);
    }

    private void resolveAlways(PluginCall call, boolean opened) {
        pendingAlways = null;
        leftForSettings = false;
        String location = "denied";
        if (hasBackground()) location = "always";
        else if (hasForeground()) location = "while-using";
        JSObject result = new JSObject();
        result.put("location", location);
        result.put("opened", opened);
        result.put("native", true);
        call.resolve(result);
    }

    private void resolveSignIn(PluginCall call, String credential, String error) {
        JSObject result = new JSObject();
        if (credential != null) result.put("credential", credential);
        if (error != null) result.put("error", error);
        call.resolve(result);
    }

    private String signInCode(Throwable error) {
        String name = error.getClass().getSimpleName().toLowerCase(Locale.US);
        String message = error.getMessage() == null ? "" : error.getMessage();
        if (name.contains("cancel")) return "cancelled";
        if (message.contains("UNREGISTERED") || message.contains("28444") || message.contains("Developer console") || message.contains("10:")) {
            return "unregistered";
        }
        if (name.contains("nocredential") || name.contains("interrupt") || name.contains("provider")) return "unavailable";
        return "failed";
    }

    private boolean granted(String permission) {
        return ContextCompat.checkSelfPermission(getContext(), permission) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean shouldShow(String permission) {
        AppCompatActivity activity = getActivity();
        return activity != null && ActivityCompat.shouldShowRequestPermissionRationale(activity, permission);
    }

    private boolean hasForeground() {
        return granted(android.Manifest.permission.ACCESS_FINE_LOCATION) || granted(android.Manifest.permission.ACCESS_COARSE_LOCATION);
    }

    private boolean hasBackground() {
        if (Build.VERSION.SDK_INT < 29) return hasForeground();
        return granted(android.Manifest.permission.ACCESS_BACKGROUND_LOCATION);
    }

    private boolean openLocationPermissionPage() {
        String pkg = getContext().getPackageName();
        Intent direct = new Intent("android.intent.action.MANAGE_APP_PERMISSION");
        direct.putExtra(Intent.EXTRA_PACKAGE_NAME, pkg);
        direct.putExtra("android.intent.extra.PERMISSION_GROUP_NAME", "android.permission-group.LOCATION");
        direct.putExtra("android.intent.extra.PERMISSION_NAME", android.Manifest.permission.ACCESS_FINE_LOCATION);
        if (startExternal(direct)) return true;
        return openAppDetails();
    }

    private boolean openPermissionPage(String permission) {
        Intent direct = new Intent("android.intent.action.MANAGE_APP_PERMISSION");
        direct.putExtra(Intent.EXTRA_PACKAGE_NAME, getContext().getPackageName());
        direct.putExtra("android.intent.extra.PERMISSION_NAME", permission);
        if (startExternal(direct)) return true;
        return openAppDetails();
    }

    private boolean openNotificationSettings() {
        Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
        intent.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        if (startExternal(intent)) return true;
        return openAppDetails();
    }

    private boolean openAppDetails() {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.fromParts("package", getContext().getPackageName(), null));
        return startExternal(intent);
    }

    private boolean startExternal(Intent intent) {
        try {
            AppCompatActivity activity = getActivity();
            if (activity != null) activity.startActivity(intent);
            else {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            }
            return true;
        } catch (Exception error) {
            return false;
        }
    }

}
