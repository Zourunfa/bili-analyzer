## ADDED Requirements

### Requirement: User can search subtitles across personal analyzed videos
The system SHALL provide cross-video subtitle full-text search for authenticated users and MUST enforce user-level data isolation.

#### Scenario: Full-text search over subtitle corpus
- **WHEN** user submits query text in global search
- **THEN** system returns matched subtitle snippets only from videos associated with that user

#### Scenario: Pagination for large result set
- **WHEN** matched results exceed page size
- **THEN** system returns paginated results with total count and current page metadata

### Requirement: User can perform semantic search in same global entry
The system SHALL expose semantic retrieval through the same search entry and return normalized result structure.

#### Scenario: Semantic mode query
- **WHEN** user selects semantic mode and submits question
- **THEN** system returns ranked results with similarity score and source video metadata

### Requirement: Search results support source filtering
The system SHALL allow filtering by source type and tag-related constraints.

#### Scenario: Filter by source and tags
- **WHEN** user filters to subtitle source and selected tags
- **THEN** system returns only results satisfying source and tag filters

