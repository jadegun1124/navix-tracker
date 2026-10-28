package kr.co.umap.tracker;

import android.app.Activity;
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
import java.util.concurrent.Executor;

@CapacitorPlugin(name = "UmapAuth")
public class UmapAuthPlugin extends Plugin {
    @PluginMethod
    public void signIn(PluginCall call) {
        String clientId = call.getString("webClientId", "");
        if (clientId == null || !clientId.endsWith(".apps.googleusercontent.com")) {
            JSObject missing = new JSObject();
            missing.put("ok", false);
            missing.put("code", "missing-client");
            call.resolve(missing);
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

    private JSObject failure(String code) {
        JSObject payload = new JSObject();
        payload.put("ok", false);
        payload.put("code", code);
        return payload;
    }
}
