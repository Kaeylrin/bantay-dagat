# Paper thresholds and monitoring validation

Branch: `feature/paper-thresholds-and-monitoring-validation`.

This is a clean snapshot branch with a new root commit. It deliberately does not inherit the old history containing `.env`. It therefore has no common ancestor with the existing `main`; it is not ready for an ordinary merge. Any later integration needs a reviewed clean-history migration or another explicitly agreed integration plan. The old branch history remains local only.

The threshold bands match the project manager's supplied table. Temperature, pH and turbidity determine the website assessment; air temperature and humidity retain their contextual role. Threshold source references have been removed from the website. Hardware is called a monitoring station without describing its mounting.

## Verification

Run `npm test`, `npm run test:e2e`, `npm run build`, and `npm run check:secrets`. The repository also retains its pnpm lockfile. Install Chromium for browser tests with `npx playwright install chromium` if it is not already available.

Unit tests cover all threshold boundaries, invalid/missing readings, device error flags, stale/future timestamps, database disconnection, critical faults overriding assessment, trend calculations, decimal formatting, packet mapping, and blocked print popups.

Browser tests use isolated Firebase/auth fixtures and weather responses. They cover dashboard toggles, the threshold table, source removal, working/faulty/offline/recovery, silence without new events, database permission errors, D/T/A/E navigation, typing/modifier/dialog exclusions, mobile navigation, sidebar persistence, logout, ranger access restrictions, account management, alert filters/search/sort, CSV and print-to-PDF documents, history graph modes/time ranges/analytics, month histories beyond 500 samples, weather refresh/error feedback, disabled accounts and invalid reset URLs.

These tests do not flash or calibrate the ESP32, write to the live database, change real user accounts, or send real emails. Live device flags, sensor calibration, deployed Firebase rules, external API availability, email delivery and physical disconnect/reconnect remain field/integration checks. A successful automated run does not guarantee every possible operating condition.

The month-history query now orders by timestamp and requests the selectable month instead of truncating to 500 records. The corresponding timestamp index is included in `firebase-rules.json`; it has not been deployed. Review and deploy that index through the normal deployment process before production use.

## Private configuration

`.env` and service-account/private-key files must remain local. `.env.example` contains placeholders only. `VITE_` values are public browser configuration and must never contain server secrets. The secret checker reports paths and categories, not credential values; pattern checks are not a complete guarantee against all possible secret formats.

If a secret was previously committed, deleting the current file does not remove earlier copies. Revoke/rotate affected server secrets and review access. History cleanup requires a separate coordinated operation; this branch does not rewrite or merge `main`.
