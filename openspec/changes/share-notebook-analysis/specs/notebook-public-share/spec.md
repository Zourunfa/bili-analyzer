## ADDED Requirements

### Requirement: Manual notebook can be publicly shared
The system SHALL allow an authenticated user to create, read, and disable a public share for a manual notebook they own.

#### Scenario: Create public notebook share
- **WHEN** an authenticated user requests public sharing for a manual notebook they own and the notebook contains at least one video
- **THEN** the system creates or updates a public `SharePage` with `targetType` set to `notebook` and returns the public URL

#### Scenario: Reject smart notebook share
- **WHEN** an authenticated user requests public sharing for a smart notebook
- **THEN** the system rejects the request and does not create a public share

#### Scenario: Disable public notebook share
- **WHEN** an authenticated user disables sharing for a notebook they own
- **THEN** the system marks the notebook share as disabled and the public page no longer renders

### Requirement: Public notebook page exposes only share-safe analysis data
The system SHALL render public notebook pages using notebook metadata, video metadata, AI summaries, and structured knowledge points only.

#### Scenario: Render public notebook analysis
- **WHEN** a visitor opens a public notebook share URL
- **THEN** the page displays the notebook title, description, tags, video list, video summaries, and structured knowledge points

#### Scenario: Exclude private data
- **WHEN** a visitor opens a public notebook share URL
- **THEN** the page MUST NOT include full subtitles, timestamp notes, chat history, or smart notebook rules

### Requirement: Public notebook pages are SEO-ready
The system SHALL provide indexable metadata and sitemap entries for public notebook shares.

#### Scenario: Generate metadata
- **WHEN** a public notebook page is rendered
- **THEN** the page includes title, description, canonical URL, Open Graph metadata, and JSON-LD structured data

#### Scenario: Include public notebook shares in sitemap
- **WHEN** sitemap generation runs
- **THEN** public notebook share URLs are included and disabled notebook shares are excluded
