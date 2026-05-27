## ADDED Requirements

### Requirement: Crawl Entry Points
The system SHALL expose crawler entry points for public content discovery.

#### Scenario: Robots file is requested
- **WHEN** a crawler requests `/robots.txt`
- **THEN** the system returns a robots file that allows public pages, disallows private/API/admin paths, and references `https://www.afai.asia/sitemap.xml`

#### Scenario: Sitemap is requested
- **WHEN** a crawler requests `/sitemap.xml`
- **THEN** the sitemap includes the homepage, public trust pages, publicly indexable feature pages, and public video share pages

### Requirement: Site Metadata
The system SHALL provide search and social metadata for public pages.

#### Scenario: Homepage metadata is rendered
- **WHEN** the homepage is rendered
- **THEN** the response metadata includes a descriptive title, meta description, canonical URL, Open Graph fields, and Twitter Card fields

#### Scenario: Share page metadata is rendered
- **WHEN** a public video share page is rendered
- **THEN** the page metadata includes a page-specific title, description, canonical URL, Open Graph image, and Twitter Card image

### Requirement: Structured Data
The system SHALL render JSON-LD structured data for public SEO pages.

#### Scenario: Homepage structured data is rendered
- **WHEN** the homepage is rendered
- **THEN** the page includes JSON-LD describing the web application, organization/person identity, and FAQ content

#### Scenario: Share page structured data is rendered
- **WHEN** a public video share page is rendered
- **THEN** the page includes JSON-LD describing the article, source video, and breadcrumb path

### Requirement: Trust Pages
The system SHALL provide publicly accessible trust and legal pages.

#### Scenario: About page is visited
- **WHEN** a user visits `/about`
- **THEN** the page explains the project purpose, intended users, creator/contact information, and product boundaries

#### Scenario: Privacy page is visited
- **WHEN** a user visits `/privacy`
- **THEN** the page explains what data is processed, why it is processed, how it is stored, and how users can request help

#### Scenario: Terms page is visited
- **WHEN** a user visits `/terms`
- **THEN** the page explains acceptable use, AI output limitations, source content ownership, and service disclaimers

### Requirement: Indexing Policy
The system SHALL distinguish public indexable pages from private or thin pages.

#### Scenario: Private or account-dependent page metadata is rendered
- **WHEN** a page primarily depends on authenticated user data or has thin public content
- **THEN** the page declares a noindex policy while allowing link following where appropriate

#### Scenario: Public content page metadata is rendered
- **WHEN** a page is intended to attract public search traffic
- **THEN** the page declares an indexable policy and has a canonical URL
