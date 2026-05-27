## ADDED Requirements

### Requirement: Public Product Positioning
The system SHALL present VideoNote as a video-to-knowledge product on the public homepage.

#### Scenario: New visitor reads homepage
- **WHEN** an unauthenticated visitor reads the homepage
- **THEN** the visitor can understand that VideoNote turns B站、抖音、小红书 videos into summaries, mind maps, searchable notes, and reusable knowledge assets

#### Scenario: Search engine reads homepage text
- **WHEN** a crawler indexes the homepage
- **THEN** the crawlable text includes product positioning, supported platforms, workflows, use cases, and benefits aligned with the product definition

### Requirement: Public Conversion Path
The system SHALL keep the homepage usable as the primary product entry point while adding SEO content.

#### Scenario: Visitor has a video URL
- **WHEN** a visitor lands on the homepage with a video URL to analyze
- **THEN** the primary URL input and analysis action remain visible before long-form SEO content

#### Scenario: Visitor wants to evaluate trust
- **WHEN** a visitor wants to evaluate the product before using it
- **THEN** the homepage provides links to about, privacy, and terms pages without requiring login
