## ADDED Requirements

### Requirement: Notebook public sharing routes
The architecture SHALL expose notebook public sharing through Next.js route handlers and App Router pages that reuse the existing `SharePage` model.

#### Scenario: Notebook share API route exists
- **WHEN** the application is deployed
- **THEN** `/api/share/notebooks/[notebookId]` supports authenticated share status lookup, creation, and disabling

#### Scenario: Notebook public page route exists
- **WHEN** a visitor opens `/share/notebooks/[shareId]`
- **THEN** the App Router renders the public notebook share page when the share is public

### Requirement: Notebook public sharing reuses existing data relationships
The architecture SHALL aggregate public notebook content from `Notebook`, `NotebookVideo`, `Video`, `KnowledgePoint`, and `SharePage` without adding a new table.

#### Scenario: Public page data query
- **WHEN** a public notebook share is rendered
- **THEN** the data query uses `SharePage.targetType = notebook` and the notebook-video relationships to load share-safe content
