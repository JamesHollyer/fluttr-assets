# Release notes for maintainers

## iOS (TestFlight / App Store)

App Store Connect app: **Fluttr Birding**, bundle `com.fluttr.app`, team `VQ238Q6X89`.
Signing uses an App Store Connect API key (App Manager role; `~/.private_keys/AuthKey_<KEY_ID>.p8`)
plus a distribution certificate and App Store profile created through the API, held in a
dedicated keychain `~/Library/Keychains/fluttr.keychain-db` (Xcode's cloud signing needs an
Admin key, which we avoid).

```
cd app
npx expo prebuild --platform ios            # needs the portable-ruby CocoaPods on PATH
cd ios
xcodebuild -workspace Fluttr.xcworkspace -scheme Fluttr -configuration Release -sdk iphoneos \
  -destination 'generic/platform=iOS' -archivePath /tmp/Fluttr.xcarchive \
  -allowProvisioningUpdates -authenticationKeyPath ~/.private_keys/AuthKey_<KEY_ID>.p8 \
  -authenticationKeyID <KEY_ID> -authenticationKeyIssuerID <ISSUER_ID> \
  DEVELOPMENT_TEAM=VQ238Q6X89 CODE_SIGN_STYLE=Automatic archive
xcodebuild -exportArchive -archivePath /tmp/Fluttr.xcarchive -exportOptionsPlist ExportOptions.plist \
  -exportPath /tmp/Fluttr-export -authenticationKeyPath ... -authenticationKeyID ... -authenticationKeyIssuerID ...
```

`ExportOptions.plist`: method `app-store-connect`, destination `upload`, signingStyle `manual`,
signingCertificate `iPhone Distribution`, provisioningProfiles `{ com.fluttr.app: "Fluttr App Store" }`,
manageAppVersionAndBuildNumber true (App Store Connect bumps the build number).

Testers: external group **Family** in TestFlight. The first build for external testers goes
through Beta App Review (about a day); later builds are immediate.

Not yet: iOS push (needs an APNs key in Firebase and `GoogleService-Info.plist`), and the
Sound ID model is still downloaded from the developer's Mac in dev builds.

## Android

Release APK for sideloading: see the memory notes in `tools/README.md`. Play Store needs an
upload keystore (not yet created; builds still sign with the debug keystore) and an app bundle:
`./gradlew bundleRelease`.
