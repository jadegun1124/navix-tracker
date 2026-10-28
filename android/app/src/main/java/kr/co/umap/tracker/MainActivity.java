package kr.co.umap.tracker;

import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(UmapLocationPlugin.class);
        super.onCreate(savedInstanceState);
        WebView webView = bridge != null ? bridge.getWebView() : null;
        if (webView != null) {
            webView.addJavascriptInterface(new UmapAndroidExit(this), "UmapAndroid");
        }
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView view = bridge != null ? bridge.getWebView() : null;
                if (view == null) return;
                view.evaluateJavascript(
                    "(function(){try{if(window.__umapAndroidBack){window.__umapAndroidBack();return true}return false}catch(e){return false}})()",
                    null
                );
            }
        });
    }

    static final class UmapAndroidExit {
        private final MainActivity activity;

        UmapAndroidExit(MainActivity activity) {
            this.activity = activity;
        }

        @JavascriptInterface
        public void exitApp() {
            activity.runOnUiThread(activity::finish);
        }
    }
}
