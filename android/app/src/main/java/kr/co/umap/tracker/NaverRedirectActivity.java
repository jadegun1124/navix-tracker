package kr.co.umap.tracker;

import android.app.Activity;
import android.os.Bundle;

public class NaverRedirectActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (getIntent() != null) {
            UmapAuthPlugin.completeNaverRedirect(getIntent().getData());
        }
        finish();
    }
}
