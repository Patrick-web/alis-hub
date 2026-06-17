# macOS Code Signing & Notarization

How to sign and notarize the Alis Hub macOS app for distribution.

## Overview

Two layers are required before macOS Gatekeeper will trust the app on other machines:

1. **Code signing** — proves the binary came from a known developer identity
2. **Notarization** — Apple's servers scan the binary and staple a ticket to the `.app`

Both happen automatically in CI when a version tag is pushed. This doc covers the one-time setup and how to redo it if certificates are lost.

---

## Accounts & identities

| What | Value |
|---|---|
| Apple Developer account | `patrickwaweruofficial@gmail.com` |
| Team ID | `Q79K8A6H7U` |
| Signing identity | `Developer ID Application: Patrick Waweru (Q79K8A6H7U)` |
| Notarization keychain profile (local) | `alishub-notarize` |

---

## One-time setup (per machine)

### 1. Create a Developer ID Application certificate

Only do this if the certificate does not already exist in your Apple Developer account, or if the private key has been lost.

1. Open **Keychain Access** → menu: **Keychain Access → Certificate Assistant → Request a Certificate From a Certificate Authority**
2. Fill in your email and a common name, select **Saved to disk**, click **Continue**. This creates a `.certSigningRequest` file and stores the private key in your login keychain.
3. Go to [developer.apple.com/account/resources/certificates/list](https://developer.apple.com/account/resources/certificates/list)
4. Revoke any existing **Developer ID Application** certificate for this team (the private key is gone anyway if you're redoing this)
5. Click **+**, choose **Developer ID Application**, upload the `.certSigningRequest`, download the resulting `.cer`
6. Double-click the `.cer` to install it. Keychain links it to the private key from step 2.

Verify:
```
security find-identity -v -p codesigning
```
Should show `Developer ID Application: Patrick Waweru (Q79K8A6H7U)` with 1 valid identity.

### 2. Store notarization credentials

Generate an app-specific password at [appleid.apple.com](https://appleid.apple.com) → Sign-In and Security → App-Specific Passwords.

Then store it in your keychain:
```
xcrun notarytool store-credentials "alishub-notarize" \
  --apple-id "patrickwaweruofficial@gmail.com" \
  --team-id "Q79K8A6H7U" \
  --password "xxxx-xxxx-xxxx-xxxx"
```

### 3. Set GitHub Actions secrets

Export the certificate + private key as a `.p12`:
```
security export \
  -k ~/Library/Keychains/login.keychain-db \
  -t identities \
  -f pkcs12 \
  -o /tmp/cert.p12 \
  -P "your-export-password"
```

Set the four required secrets on the repo:
```
base64 -i /tmp/cert.p12 | gh secret set MACOS_CERTIFICATE -R Patrick-web/alis-hub
gh secret set MACOS_CERTIFICATE_PWD --body "your-export-password"
gh secret set APPLE_ID --body "patrickwaweruofficial@gmail.com"
gh secret set APPLE_APP_PASSWORD --body "xxxx-xxxx-xxxx-xxxx"
```

Then clean up:
```
rm /tmp/cert.p12
```

`APPLE_TEAM_ID` is already set to `Q79K8A6H7U` and does not need changing.

---

## Signing locally

Sign without notarization (faster, for local testing):
```
wails3 task darwin:sign
```

Sign and notarize (for distribution):
```
wails3 task darwin:sign:notarize
```

Notarization takes ~1–2 minutes while Apple's servers process the submission. The ticket is stapled to the `.app` automatically on success.

---

## CI release flow

Pushing a `v*` tag triggers `.github/workflows/release.yml`, which:

1. Imports the certificate from `MACOS_CERTIFICATE` / `MACOS_CERTIFICATE_PWD` into a temporary keychain
2. Builds the Go binary with `-X main.version=<tag>`
3. Bundles and signs the `.app` with Developer ID + hardened runtime + entitlements
4. Submits to Apple notarytool using `APPLE_ID` / `APPLE_APP_PASSWORD`, waits for `Accepted`, then staples
5. Packages as `.zip` and `.dmg` (with `/Applications` symlink)
6. Creates a GitHub Release with all artifacts

To release a new version:
```
git tag v0.x.y
git push origin v0.x.y
```

---

## Troubleshooting

**`0 valid identities found`**
The private key is missing from your keychain. The certificate alone is not enough — redo step 1 of the one-time setup (revoke, generate new CSR on this machine, create new cert).

**CI notarization: `401 Invalid credentials`**
The `APPLE_ID` secret does not match the account used to generate the `APPLE_APP_PASSWORD`. Ensure both use `patrickwaweruofficial@gmail.com`. Update with:
```
gh secret set APPLE_ID --body "patrickwaweruofficial@gmail.com" -R Patrick-web/alis-hub
```
Then retrigger CI by deleting and recreating the tag.

**CI signing fails silently / ad-hoc fallback**
The `MACOS_CERTIFICATE` or `MACOS_CERTIFICATE_PWD` secret is wrong or stale. Re-export the `.p12` and update both secrets (see step 3 above).
