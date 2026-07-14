# Instagram API Setup Handoff

## Purpose

This document records the live Meta developer configuration completed for
GlocalX on 2026-07-14. It is a setup handoff, not an implementation guide, and
intentionally excludes application identifiers, secrets, access tokens, account
details, and other credentials.

## Completed configuration

| Area                        | Verified state                                                    |
| --------------------------- | ----------------------------------------------------------------- |
| Instagram account           | A professional business account is available for the integration. |
| Meta developer registration | Completed for the account that owns the app.                      |
| Meta app                    | `GlocalX MVP` was created.                                        |
| App use case                | **Manage messaging & content on Instagram** was selected.         |
| Login model                 | **API setup with Instagram Login** is the intended configuration. |
| Facebook Page               | Not linked. This setup does not require a Facebook Page.          |
| Business portfolio          | Not connected to the app.                                         |
| Publish state               | The app remains unpublished.                                      |

The relevant dashboard path is:

`My Apps` -> `GlocalX MVP` -> `Use cases` -> `Instagram API` -> `API setup with Instagram login`

## What was deliberately not done

No credentials or user-data access were granted during setup. In particular:

- No Instagram account was added to the app.
- No Instagram Tester role was assigned.
- No permissions were enabled.
- No access token was generated, copied, or stored.
- No webhook, redirect URL, or business-login setting was configured.
- No API request was sent and no Instagram post was created.

Keeping these actions separate preserves explicit approval before the app gains
access to the Instagram account.

## Posting capability

The selected Instagram use case supports publishing Instagram content. To post
to the owner-managed professional account, the app still needs an Instagram
tester, an authorized test access token, and the required publishing scope.

For a minimal content-publishing test, request only the scopes required by the
feature:

- `instagram_business_basic`
- `instagram_business_content_publish`

The dashboard also offers comment and messaging permissions:

- `instagram_business_manage_comments`
- `instagram_business_manage_messages`

Those should be added only when the product needs comment moderation or direct
messaging. The dashboard's **Add all required permissions** action is oriented
toward messaging and includes broader access than a posting-only test needs.

## Next approved-test sequence

Before any of the following state-changing actions, obtain explicit approval
from the app owner:

1. In `App roles` -> `Roles`, assign the owner-managed Instagram account as an
   Instagram Tester.
2. In `Permissions and features`, enable
   `instagram_business_basic` and `instagram_business_content_publish`.
3. In `API setup with Instagram login` -> `Generate access tokens`, choose
   **Add account**, then complete the Instagram authorization prompt.
4. Use the generated token only for a controlled test against the
   owner-managed account.
5. Verify the API result in Meta's testing surface before attempting any real
   publication.

The authorization prompt may require an interactive Instagram login or MFA.
Never commit an access token, app secret, account identifier, redirect URL that
contains credentials, or API response containing private data.

## Testing and release status

No browser-based API test has run yet, so this configuration has not been
verified to publish content. The first test should be limited to the
owner-managed account and should not publish unapproved content.

The app is still unpublished. App Review and publishing are separate later
steps if the app will access data outside the owner-managed test account or
serve other businesses. Do not submit the app for review or publish it as part
of the initial test setup.
