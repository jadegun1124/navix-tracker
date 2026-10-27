package kr.co.umap.tracker;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(UmapLocationPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
