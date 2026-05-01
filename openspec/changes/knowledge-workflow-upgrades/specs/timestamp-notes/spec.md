## ADDED Requirements

### Requirement: User can create timestamp notes from subtitle context
The system SHALL allow authenticated users to create timestamp notes while viewing analyzed subtitles, and each note MUST be bound to the current user and target video.

#### Scenario: Create note from subtitle line
- **WHEN** user clicks "记笔记" on a subtitle line with timestamp and submits note text
- **THEN** system creates a timestamp note record with `userId`, `videoId`, `timestampSec`, and `content`

#### Scenario: Reject invalid note input
- **WHEN** user submits empty note content or missing timestamp
- **THEN** system MUST return validation error and MUST NOT create a note

### Requirement: User can view and manage timestamp notes per video
The system SHALL provide note listing, update, and delete operations scoped to the authenticated user and current video.

#### Scenario: List notes in analyze page
- **WHEN** user opens the note list panel in the analyze page
- **THEN** system returns notes sorted by `timestampSec` ascending

#### Scenario: Edit or delete own note
- **WHEN** user updates or deletes a note created by themselves
- **THEN** system applies the change and returns the latest note list

### Requirement: Timestamp notes support quick jump and deep link
The system SHALL support jumping to the related analysis context based on note timestamp.

#### Scenario: Jump from note to timestamp
- **WHEN** user clicks a timestamp note item
- **THEN** system highlights the corresponding subtitle region and updates URL query with timestamp marker

