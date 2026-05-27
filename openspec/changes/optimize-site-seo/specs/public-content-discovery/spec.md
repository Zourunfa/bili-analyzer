## ADDED Requirements

### Requirement: Homepage Public Content
The system SHALL make the homepage useful to users and crawlers without authentication.

#### Scenario: Homepage is rendered
- **WHEN** a visitor opens the homepage
- **THEN** the page presents the product value, supported platforms, primary workflows, use cases, and common questions in crawlable text

#### Scenario: Homepage FAQ is rendered
- **WHEN** the homepage is rendered
- **THEN** FAQ content is visible in page text and represented in FAQPage JSON-LD

### Requirement: Public Share Discovery
The system SHALL provide internal links from the homepage to recent public share pages.

#### Scenario: Public share pages exist
- **WHEN** public video share pages are available
- **THEN** the homepage lists recent public notes with descriptive links to their share pages

#### Scenario: No public share pages exist
- **WHEN** no public video share pages are available
- **THEN** the homepage still renders normally without an empty or broken public notes section

### Requirement: Global Footer Navigation
The system SHALL provide stable footer navigation for public trust and discovery pages.

#### Scenario: Public page footer is rendered
- **WHEN** a public page is rendered
- **THEN** the footer links to the homepage, about page, privacy policy, terms page, and contact channel

#### Scenario: Share page footer is rendered
- **WHEN** a public share page is rendered
- **THEN** the footer or page actions provide a path back to the homepage and relevant trust pages

### Requirement: Share Page Attribution
The system SHALL expose attribution and AI-generation context on public share pages.

#### Scenario: Share page is rendered
- **WHEN** a public video share page is rendered
- **THEN** the page shows the source video link when available, source creator/platform information, AI generation attribution, and update date

#### Scenario: Source creator is unknown
- **WHEN** the source creator is missing
- **THEN** the page avoids presenting misleading authority claims and uses a neutral fallback
