package kr.co.umap.tracker;

import android.app.Activity;
import android.net.Uri;
import androidx.browser.customtabs.CustomTabsIntent;
import androidx.core.content.ContextCompat;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;
import com.kakao.sdk.auth.model.OAuthToken;
import com.kakao.sdk.common.model.ClientError;
import com.kakao.sdk.common.model.ClientErrorCause;
import com.kakao.sdk.user.UserApiClient;
import java.util.concurrent.Executor;
import kotlin.Unit;

@CapacitorPlugin(name = "UmapAuth")
public class UmapAuthPlugin extends Plugin {
    private static volatile UmapAuthPlugin instance;
    private PluginCall pendingNaver;
    private String pendingNaverState = "";

    @Override
    public void load() {
        instance = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
        super.handleOnDestroy();
    }

    @PluginMethod
    public void signIn(PluginCall call) {
        String clientId = call.getString("webClientId", "");
        if (clientId == null || !clientId.endsWith(".apps.googleusercontent.com")) {
            call.resolve(failure("missing-client"));
            return;
        }
        Activity activity = getActivity();
        if (activity == null) {
            call.resolve(failure("failed"));
            return;
        }
        GetSignInWithGoogleOption option = new GetSignInWithGoogleOption.Builder(clientId).build();
        GetCredentialRequest request = new GetCredentialRequest.Builder()
            .addCredentialOption(option)
            .build();
        CredentialManager manager = CredentialManager.create(activity);
        Executor executor = ContextCompat.getMainExecutor(activity);
        manager.getCredentialAsync(
            activity,
            request,
            null,
            executor,
            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                @Override
                public void onResult(GetCredentialResponse result) {
                    Credential credential = result.getCredential();
                    if (!(credential instanceof CustomCredential)
                        || !GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credential.getType())) {
                        call.resolve(failure("unexpected"));
                        return;
                    }
                    try {
                        GoogleIdTokenCredential google = GoogleIdTokenCredential.createFrom(credential.getData());
                        String idToken = google.getIdToken();
                        if (idToken == null || idToken.isEmpty()) {
                            call.resolve(failure("unexpected"));
                            return;
                        }
                        JSObject payload = new JSObject();
                        payload.put("ok", true);
                        payload.put("idToken", idToken);
                        call.resolve(payload);
                    } catch (Exception error) {
                        call.resolve(failure("unexpected"));
                    }
                }

                @Override
                public void onError(GetCredentialException error) {
                    String code = error instanceof GetCredentialCancellationException ? "canceled" : "failed";
                    call.resolve(failure(code));
                }
            }
        );
    }

    @PluginMethod
    public void signInKakao(PluginCall call) {
        String appKey = call.getString("nativeAppKey", "");
        if (appKey == null || appKey.isEmpty()) {
            call.resolve(failure("missing-client"));
            return;
        }
        Activity activity = getActivity();
        if (activity == null) {
            call.resolve(failure("failed"));
            return;
        }
        if (UserApiClient.getInstance().isKakaoTalkLoginAvailable(activity)) {
            UserApiClient.getInstance().loginWithKakaoTalk(activity, (token, error) -> {
                if (shouldFallbackToKakaoAccount(error)) {
                    loginWithKakaoAccount(activity, call);
                    return Unit.INSTANCE;
                }
                resolveKakao(call, token, error);
                return Unit.INSTANCE;
            });
            return;
        }
        loginWithKakaoAccount(activity, call);
    }

    @PluginMethod
    public void signInNaver(PluginCall call) {
        String clientId = call.getString("clientId", "");
        String redirectUri = call.getString("redirectUri", "kinnex://naver");
        if (clientId == null || clientId.length() < 8) {
            JSObject missing = failure("missing-client");
            missing.put("error", "missing-client");
            call.resolve(missing);
            return;
        }
        Activity activity = getActivity();
        if (activity == null) {
            JSObject failed = failure("failed");
            failed.put("error", "failed");
            call.resolve(failed);
            return;
        }
        String state = randomState();
        pendingNaver = call;
        pendingNaverState = state;
        Uri uri = Uri.parse("https://nid.naver.com/oauth2.0/authorize").buildUpon()
            .appendQueryParameter("response_type", "code")
            .appendQueryParameter("client_id", clientId)
            .appendQueryParameter("redirect_uri", redirectUri)
            .appendQueryParameter("state", state)
            .build();
        CustomTabsIntent tabs = new CustomTabsIntent.Builder().build();
        tabs.launchUrl(activity, uri);
    }

    public static void completeNaverRedirect(Uri data) {
        UmapAuthPlugin plugin = instance;
        if (plugin == null || data == null) return;
        Activity activity = plugin.getActivity();
        if (activity == null) {
            plugin.finishNaver(data);
            return;
        }
        activity.runOnUiThread(() -> plugin.finishNaver(data));
    }

    private void finishNaver(Uri data) {
        PluginCall call = pendingNaver;
        pendingNaver = null;
        if (call == null) return;
        String error = data.getQueryParameter("error");
        String code = data.getQueryParameter("code");
        String state = data.getQueryParameter("state");
        if (error != null && !error.isEmpty()) {
            JSObject payload = failure("canceled".equals(error) ? "canceled" : "failed");
            payload.put("error", "access_denied".equals(error) ? "canceled" : "failed");
            call.resolve(payload);
            return;
        }
        if (code == null || code.isEmpty() || state == null || !state.equals(pendingNaverState)) {
            JSObject payload = failure("failed");
            payload.put("error", "failed");
            call.resolve(payload);
            return;
        }
        JSObject payload = new JSObject();
        payload.put("ok", true);
        payload.put("code", code);
        payload.put("state", state);
        call.resolve(payload);
    }

    private void loginWithKakaoAccount(Activity activity, PluginCall call) {
        UserApiClient.getInstance().loginWithKakaoAccount(activity, (token, error) -> {
            resolveKakao(call, token, error);
            return Unit.INSTANCE;
        });
    }

    private void resolveKakao(PluginCall call, OAuthToken token, Throwable error) {
        if (error != null) {
            boolean canceled = error instanceof ClientError
                && ((ClientError) error).getReason() == ClientErrorCause.Cancelled;
            call.resolve(failure(canceled ? "canceled" : "failed"));
            return;
        }
        if (token == null || token.getAccessToken() == null || token.getAccessToken().isEmpty()) {
            call.resolve(failure("unexpected"));
            return;
        }
        JSObject payload = new JSObject();
        payload.put("ok", true);
        payload.put("accessToken", token.getAccessToken());
        call.resolve(payload);
    }

    private boolean shouldFallbackToKakaoAccount(Throwable error) {
        if (!(error instanceof ClientError)) return error != null;
        ClientError client = (ClientError) error;
        return client.getReason() == ClientErrorCause.Cancelled
            ? false
            : client.getReason() == ClientErrorCause.NotSupported || client.getReason() == ClientErrorCause.Unknown;
    }

    private String randomState() {
        StringBuilder out = new StringBuilder();
        byte[] bytes = new byte[16];
        new java.security.SecureRandom().nextBytes(bytes);
        for (byte value : bytes) out.append(String.format("%02x", value));
        return out.toString();
    }

    private JSObject failure(String code) {
        JSObject payload = new JSObject();
        payload.put("ok", false);
        payload.put("code", code);
        return payload;
    }
}
