package kr.co.umap.tracker;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(UmapPresencePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
