## ADDED Requirements

### Requirement: Homepage Relevance Signals
The system SHALL make the homepage's primary topic unambiguous to crawlers.

#### Scenario: Homepage metadata is rendered
- **WHEN** the homepage is requested
- **THEN** the title, description, and H1 mention video-to-knowledge-note positioning and related AI summary/mind-map concepts

#### Scenario: Homepage structured data is rendered
- **WHEN** the homepage is rendered
- **THEN** the page includes JSON-LD graph data for the website, software application, organization, how-to workflow, FAQ, and breadcrumb

### Requirement: Public Feature Pages
The system SHALL expose crawlable public pages for major product information.

#### Scenario: Features page is requested
- **WHEN** a visitor opens `/features`
- **THEN** the page is indexable, has canonical metadata, describes core capabilities, and renders feature structured data

#### Scenario: FAQ page is requested
- **WHEN** a visitor opens `/faq`
- **THEN** the page is indexable, has canonical metadata, shows FAQ content, and renders FAQ structured data

### Requirement: Public Discovery Links
The system SHALL link public SEO pages from stable navigation and sitemap locations.

#### Scenario: Sitemap is requested
- **WHEN** a crawler requests `/sitemap.xml`
- **THEN** the sitemap includes `/features` and `/faq`

#### Scenario: Public footer is rendered
- **WHEN** a public page footer is rendered
- **THEN** it links to feature, FAQ, about, privacy, and terms pages
