# Security policy

## Report privately

Report suspected vulnerabilities to the owner through an established private contact channel. If you do not have one, open a sanitized issue requesting a private reporting channel without including vulnerability details. No private reporting address or response SLA is published here.

Include the affected commit/component, a minimal reproduction with synthetic data, expected impact and a proposed fix if available. Do not include passwords, tokens, private keys or real customer records. Do not open a public issue containing an exploit or sensitive deployment details.

فارسی: گزارش آسیب‌پذیری را از مسیر ارتباط خصوصی با مالک مطرح کنید. اگر مسیر خصوصی ندارید، فقط درخواست مسیر ارتباط را بدون جزئیات آسیب‌پذیری در issue بنویسید. رمز، توکن، کلید خصوصی و اطلاعات واقعی مشتری را در issue، PR یا گزارش عمومی ننویسید.

## Scope

The current development branch and deployed version are reviewed as the active project. There is no published security-support SLA or promise to maintain older releases. See [deployment status](docs/DEPLOYMENT_STATUS.md) for known launch blockers.

## Operational controls

Production requires secure cookies, server-side authorization, staff TOTP, an active malware scanner and private database/Redis networking. Keep antivirus signatures fresh; a running ClamAV process alone is not sufficient.

Take database and upload backups, protect the encryption key needed to restore TOTP data, and test restoration in an isolated environment. Server-local archive checks are not a complete disaster-recovery test.

If a secret is exposed, revoke/rotate it first and assess affected systems. Removing a file in a later commit does not remove it from Git history.
