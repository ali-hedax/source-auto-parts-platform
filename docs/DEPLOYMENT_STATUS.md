# Public release status — Source by HEDAX

**Updated: 24 October 2026. Status: pre-launch.**

This public page describes release readiness, not private infrastructure or security configuration. A successful local preview does not establish that a public deployment is ready for customer transactions.

## Public availability

The public site is reachable at <https://sourcebyhedax.ir/fa>. Checked from outside on 12 October 2026: Persian and English storefront pages and the staff sign-in page load over HTTPS with a valid certificate; `http://` and `www.` redirect to the main address; Content-Security-Policy, HSTS and frame protection headers are present.

This is a **pre-launch** site, not a store open for business:

- customer sign-in by SMS code and online payment are **not connected** yet, so customers cannot sign in or pay;
- business policies, shipping, tax and exchange-rate data still need the owner's approval;
- the remaining acceptance items below have not been verified on the public deployment.

Do not accept real customer orders until every item below is done.

## Release acceptance

- Storefront and staff/admin pages work over valid public HTTPS.
- Customer sign-in works through the configured SMS provider.
- Staff MFA and role permissions work in the deployed application.
- Payment initiation and server-side verification pass a controlled acceptance test.
- Catalog images, conversation uploads and quarantine/scanning behavior work correctly.
- Worker jobs and Persian/English quotation PDFs complete.
- Business policies, shipping, tax and FX data are approved by the owner.
- Backup and restoration are verified by the operator before launch.

See [the launch checklist](LAUNCH_CHECKLIST.md), [deployment guide](DEPLOYMENT.md) and [backup/restore procedures](BACKUP_RESTORE.md) for implementation guidance.

## Test evidence

Historical results are in [TEST_REPORT.md](TEST_REPORT.md). They document the environment and date of each run and should not be presented as evidence of live payment, SMS delivery or public HTTPS.

## Private operations

Keep server addresses, administrator identities, credentials, network/security configuration, private logs and operational incident details out of public issues and documentation. Maintain operational records through the owner's private channel.
