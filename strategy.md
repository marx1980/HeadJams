# Strategy

Decided 2026-10-30 (Marko). Replaces the roadmaps in `money.md` and `synthesisvAI_2.md`; those files stay as source material.

## Direction
Free, open, offline, no ads, no accounts. Goal: widest use and cultural reach, for people who have music ideas but do not play. Running cost is near zero because everything runs on the user's device.

## Rules
- Making and finishing a song never needs an account, a network or a payment.
- No ads. No tracking.
- Bundled sounds are redistributable (CC0 or CC-BY) with provenance.
- Original recordings are kept; generated material is marked.
- Real-world tasks (name, licence, accounts, tax) are listed in `plan.md` › YOU.

## Why not ads
Low pay for a creative offline tool (cents per user per month), EU consent screens, and offline is already free in a public PWA, so "paid offline" cannot be enforced on the web. Only store builds can enforce a purchase.

## Why gating in code does not work
The repo is public: any feature gated by a flag is readable. Paid value must be something code cannot give away: content you recorded or licensed, store convenience, or services.

## Options, in the order to consider them
| Option | When | Notes |
|---|---|---|
| Tip link (GitHub Sponsors, Ko-fi) | At first public release | Small; costs nothing |
| Grants (Creative Europe, Croatian culture and creative funds, EU open-source and accessibility programmes) | When there is a demo and users | Fits cultural impact; check current calls with an adviser |
| School and teacher licences | After a lesson kit exists | Strongest B2B fit; slow sales; needs class features |
| Own-recorded instrument packs | After reach | Needs your recordings or written licences allowing in-app resale |
| One-time "Full" in app-store builds | Optional | Only for content outside the public repo; typical conversion 2–5% |
| Release (distribution) service | Parked | RouteNote already offers free 85/15; a partner's cut shrinks yours. Cheaper first step: release-ready export (WAV master, metadata, splits, ISRC field, AI-use statement from provenance) and hand off to existing distributors |
| Label, publishing administration | Parked | Separate businesses (capital, A&R, collecting societies) |
| Cloud Composer, generated audio | Deferred | No recurring cost to justify |

## Open decisions (Marko)
New name; open code licence (see `plan.md` › YOU).
