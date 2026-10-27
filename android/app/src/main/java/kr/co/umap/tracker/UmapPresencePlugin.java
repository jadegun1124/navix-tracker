package kr.co.umap.tracker;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import org.json.JSONObject;

@CapacitorPlugin(
    name = "UmapPresence",
    permissions = {
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }),
        @Permission(alias = "background", strings = { Manifest.permission.ACCESS_BACKGROUND_LOCATION }),
        @Permission(alias = "motion", strings = { Manifest.permission.ACTIVITY_RECOGNITION })
    }
)
public class UmapPresencePlugin extends Plugin {
    private Integer lastSteps = null;
    private boolean stepListening = false;

    @Override
    public void load() {
        listenForSteps();
    }

    @PluginMethod
    public void locationAccess(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("access", accessLabel());
        call.resolve(ret);
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        openSettings();
        call.resolve();
    }

    @PluginMethod
    public void requestBackgroundLocation(PluginCall call) {
        if (Build.VERSION.SDK_INT < 29) {
            resolveAccess(call);
            return;
        }
        if (Build.VERSION.SDK_INT >= 30) {
            openSettings();
            resolveAccess(call);
            return;
        }
        requestPermissionForAlias("background", call, "backgroundCallback");
    }

    @PermissionCallback
    private void backgroundCallback(PluginCall call) {
        resolveAccess(call);
    }

    @PluginMethod
    public void readStepCounter(PluginCall call) {
        JSObject ret = new JSObject();
        if (!motionAllowed()) {
            ret.put("steps", JSONObject.NULL);
            call.resolve(ret);
            return;
        }
        listenForSteps();
        if (lastSteps == null) ret.put("steps", JSONObject.NULL);
        else ret.put("steps", lastSteps);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestStepCounter(PluginCall call) {
        if (Build.VERSION.SDK_INT < 29) {
            listenForSteps();
            call.resolve();
            return;
        }
        requestPermissionForAlias("motion", call, "stepCallback");
    }

    @PermissionCallback
    private void stepCallback(PluginCall call) {
        listenForSteps();
        call.resolve();
    }

    @PluginMethod
    public void startShare(PluginCall call) {
        JSObject ret = new JSObject();
        if (!"always".equals(accessLabel())) {
            ret.put("started", false);
            ret.put("reason", accessLabel());
            call.resolve(ret);
            return;
        }
        Intent intent = new Intent(getContext(), FamilyLocationService.class);
        intent.setAction(FamilyLocationService.ACTION_START);
        intent.putExtra(FamilyLocationService.EXTRA_TARGETS, call.getString("targets", "[]"));
        try {
            if (Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(intent);
            else getContext().startService(intent);
            ret.put("started", true);
        } catch (Exception error) {
            ret.put("started", false);
            ret.put("reason", "service");
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void stopShare(PluginCall call) {
        Intent intent = new Intent(getContext(), FamilyLocationService.class);
        intent.setAction(FamilyLocationService.ACTION_STOP);
        getContext().startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void drainPoints(PluginCall call) {
        double after = call.getDouble("after", 0d);
        JSObject ret = new JSObject();
        try {
            ret.put("points", new JSArray(FamilyLocationService.drainPoints(getContext(), (long) after).toString()));
        } catch (Exception error) {
            ret.put("points", new JSArray());
        }
        call.resolve(ret);
    }

    private void resolveAccess(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("access", accessLabel());
        call.resolve(ret);
    }

    private void openSettings() {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
    }

    private String accessLabel() {
        Context context = getContext();
        boolean fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        if (!fine) return "denied";
        if (Build.VERSION.SDK_INT < 29) return "always";
        boolean background = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED;
        return background ? "always" : "while-in-use";
    }

    private boolean motionAllowed() {
        if (Build.VERSION.SDK_INT < 29) return true;
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED;
    }

    private void listenForSteps() {
        if (stepListening || !motionAllowed()) return;
        SensorManager sensors = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        if (sensors == null) return;
        Sensor step = sensors.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
        if (step == null) return;
        try {
            stepListening = true;
            sensors.registerListener(new SensorEventListener() {
                @Override
                public void onSensorChanged(SensorEvent event) {
                    if (event.values != null && event.values.length > 0) lastSteps = Math.round(event.values[0]);
                }

                @Override
                public void onAccuracyChanged(Sensor sensor, int accuracy) {}
            }, step, SensorManager.SENSOR_DELAY_NORMAL);
        } catch (SecurityException ignored) {
            lastSteps = null;
        }
    }
}
