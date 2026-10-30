package kr.co.umap.tracker;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "DeviceSeal")
public class DeviceSealPlugin extends Plugin {
    @PluginMethod
    public void seal(PluginCall call) {
        String sealed = DeviceCipher.seal(call.getString("plain", ""));
        if (sealed.isEmpty()) {
            call.reject("seal");
            return;
        }
        JSObject result = new JSObject();
        result.put("sealed", sealed);
        call.resolve(result);
    }

    @PluginMethod
    public void open(PluginCall call) {
        String plain = DeviceCipher.open(call.getString("sealed", ""));
        if (plain.isEmpty()) {
            call.reject("open");
            return;
        }
        JSObject result = new JSObject();
        result.put("plain", plain);
        call.resolve(result);
    }
}
