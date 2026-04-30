## ADDED Requirements

### Requirement: User can manage video tags with account isolation
The system SHALL allow authenticated users to create, rename, and remove personal tags and assign tags to analyzed videos.

#### Scenario: Create and assign tag
- **WHEN** user creates tag "AI创业" and assigns it to one of their videos
- **THEN** system stores user-scoped tag and relation without affecting other users' tags

#### Scenario: Remove tag relation
- **WHEN** user removes a tag from a video
- **THEN** system deletes only that user-video-tag relation

### Requirement: Notebook supports manual and smart collection modes
The system SHALL support two collection modes in notebook: `manual` and `smart`.

#### Scenario: Create manual collection
- **WHEN** user creates a notebook in manual mode
- **THEN** notebook accepts explicit video add/remove actions through existing notebook-video relation

#### Scenario: Create smart collection with rule
- **WHEN** user creates a notebook in smart mode with valid rule JSON
- **THEN** system stores rule and returns dynamically matched videos at query time

### Requirement: Smart collection rule evaluation is deterministic
The system SHALL evaluate smart collection rules consistently for the same user data and filter set.

#### Scenario: Rule by keyword and tag
- **WHEN** smart collection rule contains keyword + tag constraints
- **THEN** returned video set includes only videos that satisfy all configured constraints

