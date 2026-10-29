package kr.co.umap.tracker;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

public class NaverRedirectActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (getIntent() != null) {
            UmapAuthPlugin.completeNaverRedirect(getIntent().getData());
        }
        Intent main = new Intent(this, MainActivity.class);
        main.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        startActivity(main);
        finish();
    }
}
